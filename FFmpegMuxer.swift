import Foundation

class FFmpegMuxer {
    private static let ffmpegPaths = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg"
    ]
    
    static func findFFmpeg() -> String? {
        for path in ffmpegPaths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }
        return nil
    }
    
    static func muxDashVideo(dashURL: String, fallbackURL: String, outputPath: URL, ffmpegPath: String) async throws {
        // For Reddit DASH videos, we need to:
        // 1. Download the video stream (fallback URL without audio)
        // 2. Download the audio stream (DASH_audio.mp4)
        // 3. Mux them together
        
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        
        defer {
            try? FileManager.default.removeItem(at: tempDir)
        }
        
        let videoPath = tempDir.appendingPathComponent("video.mp4")
        let audioPath = tempDir.appendingPathComponent("audio.mp4")
        let partPath = outputPath.appendingPathExtension("part")
        
        // Download video stream
        try await FileDownloader.download(url: fallbackURL, to: videoPath)
        
        // Try to get audio URL from the fallback URL
        // Reddit audio is typically at the same base path with DASH_audio.mp4
        let audioURL = constructAudioURL(from: fallbackURL)
        var hasAudio = false
        
        if let audioURL = audioURL {
            do {
                try await FileDownloader.download(url: audioURL, to: audioPath)
                hasAudio = true
            } catch {
                // Audio might not exist for some videos, that's OK
            }
        }
        
        // Mux with ffmpeg
        let process = Process()
        process.executableURL = URL(fileURLWithPath: ffmpegPath)
        
        if hasAudio {
            process.arguments = [
                "-y",
                "-i", videoPath.path,
                "-i", audioPath.path,
                "-c:v", "copy",
                "-c:a", "aac",
                "-strict", "experimental",
                partPath.path
            ]
        } else {
            // No audio, just copy video
            process.arguments = [
                "-y",
                "-i", videoPath.path,
                "-c:v", "copy",
                partPath.path
            ]
        }
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        try process.run()
        process.waitUntilExit()
        
        guard process.terminationStatus == 0 else {
            let errorData = pipe.fileHandleForReading.readDataToEndOfFile()
            let errorString = String(data: errorData, encoding: .utf8) ?? "Unknown error"
            throw NSError(
                domain: "FFmpegMuxer",
                code: Int(process.terminationStatus),
                userInfo: [NSLocalizedDescriptionKey: "ffmpeg failed: \(errorString)"]
            )
        }
        
        // Atomic rename
        try? FileManager.default.removeItem(at: outputPath)
        try FileManager.default.moveItem(at: partPath, to: outputPath)
    }
    
    static func convertGifToMp4(gifPath: URL, outputPath: URL, ffmpegPath: String) async throws {
        // Use a temporary file with .mp4 extension (not .part) so ffmpeg can detect the format
        let tempDir = FileManager.default.temporaryDirectory
        let tempFile = tempDir.appendingPathComponent(UUID().uuidString + ".mp4")

        defer {
            try? FileManager.default.removeItem(at: tempFile)
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: ffmpegPath)

        // Convert GIF to MP4 with good quality settings
        process.arguments = [
            "-y",
            "-i", gifPath.path,
            "-movflags", "faststart",
            "-pix_fmt", "yuv420p",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            tempFile.path
        ]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        try process.run()
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            let errorData = pipe.fileHandleForReading.readDataToEndOfFile()
            let errorString = String(data: errorData, encoding: .utf8) ?? "Unknown error"
            throw NSError(
                domain: "FFmpegMuxer",
                code: Int(process.terminationStatus),
                userInfo: [NSLocalizedDescriptionKey: "ffmpeg failed: \(errorString)"]
            )
        }

        // Atomic rename to final destination
        try? FileManager.default.removeItem(at: outputPath)
        try FileManager.default.moveItem(at: tempFile, to: outputPath)
    }

    static func isActualGif(at filePath: URL) -> Bool {
        // Read first 6 bytes to check for GIF signature
        guard let fileHandle = try? FileHandle(forReadingFrom: filePath),
              let headerData = try? fileHandle.read(upToCount: 6) else {
            return false
        }
        try? fileHandle.close()

        let headerBytes = [UInt8](headerData)
        guard headerBytes.count >= 6 else { return false }

        // Check for GIF87a or GIF89a signature
        let isGif87a = headerBytes[0] == 0x47 && // 'G'
                       headerBytes[1] == 0x49 && // 'I'
                       headerBytes[2] == 0x46 && // 'F'
                       headerBytes[3] == 0x38 && // '8'
                       headerBytes[4] == 0x37 && // '7'
                       headerBytes[5] == 0x61    // 'a'

        let isGif89a = headerBytes[0] == 0x47 && // 'G'
                       headerBytes[1] == 0x49 && // 'I'
                       headerBytes[2] == 0x46 && // 'F'
                       headerBytes[3] == 0x38 && // '8'
                       headerBytes[4] == 0x39 && // '9'
                       headerBytes[5] == 0x61    // 'a'

        return isGif87a || isGif89a
    }

    private static func constructAudioURL(from videoURL: String) -> String? {
        // Reddit video URLs look like:
        // https://v.redd.it/abc123/DASH_720.mp4
        // Audio is at:
        // https://v.redd.it/abc123/DASH_audio.mp4

        guard let url = URL(string: videoURL) else { return nil }

        let pathComponents = url.pathComponents
        guard pathComponents.count >= 2 else { return nil }

        // Replace the last component (DASH_XXX.mp4) with DASH_audio.mp4
        var newComponents = pathComponents.dropLast()
        newComponents.append("DASH_audio.mp4")

        var newURL = URLComponents()
        newURL.scheme = url.scheme
        newURL.host = url.host
        newURL.path = newComponents.joined(separator: "/")

        // Fix double slashes
        if let result = newURL.string {
            return result.replacingOccurrences(of: "//DASH", with: "/DASH")
        }

        return nil
    }
}
