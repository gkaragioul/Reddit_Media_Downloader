import Foundation

class FileDownloader {
    private static let userAgent = "macos:reddit.profile.downloader:v1.0"

    // Retry configuration
    private static let maxRetries = 3
    private static let retryDelaySeconds: [Double] = [2.0, 5.0, 10.0]

    static func download(url urlString: String, to destination: URL) async throws {
        _ = try await downloadWithStatus(url: urlString, to: destination)
    }

    // Download with automatic retry on network failures
    static func downloadWithRetry(url urlString: String, to destination: URL, progressHandler: @escaping (Double) -> Void) async throws -> (Int, URL) {
        var lastError: Error?

        for attempt in 0..<maxRetries {
            do {
                let (statusCode, _, actualURL) = try await downloadWithProgress(url: urlString, to: destination, progressHandler: progressHandler)
                return (statusCode, actualURL)
            } catch let error as URLError {
                lastError = error

                // Only retry on network-related errors
                let retryableErrors: [URLError.Code] = [
                    .timedOut,
                    .cannotFindHost,
                    .cannotConnectToHost,
                    .networkConnectionLost,
                    .dnsLookupFailed,
                    .notConnectedToInternet,
                    .internationalRoamingOff,
                    .dataNotAllowed
                ]

                guard retryableErrors.contains(error.code) else {
                    throw error  // Non-retryable error
                }

                // Don't retry if we're on the last attempt
                if attempt < maxRetries - 1 {
                    let delay = retryDelaySeconds[attempt]
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            } catch {
                throw error  // Non-URLError, don't retry
            }
        }

        throw lastError ?? URLError(.unknown)
    }

    static func downloadWithProgress(url urlString: String, to destination: URL, progressHandler: @escaping (Double) -> Void) async throws -> (Int, String?, URL) {
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")

        let partURL = destination.appendingPathExtension("part")

        // Clean up any existing part file
        try? FileManager.default.removeItem(at: partURL)

        let configuration = URLSessionConfiguration.default
        let delegate = DownloadDelegate(progressHandler: progressHandler)
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)

        let (tempURL, response) = try await session.download(for: request)

        let httpResponse = response as? HTTPURLResponse
        let statusCode = httpResponse?.statusCode ?? 200
        let contentType = httpResponse?.value(forHTTPHeaderField: "Content-Type")

        guard (200...299).contains(statusCode) else {
            throw NSError(
                domain: "FileDownloader",
                code: statusCode,
                userInfo: [NSLocalizedDescriptionKey: "HTTP \(statusCode)"]
            )
        }

        // Ensure parent directory exists
        let parentDir = destination.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

        // Move to part file first
        try FileManager.default.moveItem(at: tempURL, to: partURL)

        // Check if file is actually MP4 or PNG by reading its magic bytes
        var finalDestination = destination
        if destination.pathExtension == "gif" {
            // Read first 12 bytes to check file signature
            if let fileHandle = try? FileHandle(forReadingFrom: partURL),
               let headerData = try? fileHandle.read(upToCount: 12) {
                try? fileHandle.close()

                let headerBytes = [UInt8](headerData)
                if headerBytes.count >= 12 {
                    // Check for PNG signature (89 50 4e 47 0d 0a 1a 0a)
                    if headerBytes.count >= 8 &&
                       headerBytes[0] == 0x89 &&
                       headerBytes[1] == 0x50 && // 'P'
                       headerBytes[2] == 0x4e && // 'N'
                       headerBytes[3] == 0x47 {  // 'G'
                        // This is a PNG file, change extension
                        finalDestination = destination.deletingPathExtension().appendingPathExtension("png")
                    }
                    // Check for JPEG signature (FF D8 FF)
                    else if headerBytes.count >= 3 &&
                       headerBytes[0] == 0xff &&
                       headerBytes[1] == 0xd8 &&
                       headerBytes[2] == 0xff {
                        // This is a JPEG file, change extension
                        finalDestination = destination.deletingPathExtension().appendingPathExtension("jpg")
                    }
                    // Check for ftyp at position 4-7 (MP4 signature)
                    else if headerBytes.count > 7 &&
                       headerBytes[4] == 0x66 && // 'f'
                       headerBytes[5] == 0x74 && // 't'
                       headerBytes[6] == 0x79 && // 'y'
                       headerBytes[7] == 0x70 {  // 'p'
                        // This is an MP4 file, change extension
                        finalDestination = destination.deletingPathExtension().appendingPathExtension("mp4")
                    }
                }
            }
        }

        // Atomic rename to final destination
        try? FileManager.default.removeItem(at: finalDestination)
        try FileManager.default.moveItem(at: partURL, to: finalDestination)

        progressHandler(1.0) // Complete

        return (statusCode, contentType, finalDestination)
    }

    static func downloadWithStatus(url urlString: String, to destination: URL) async throws -> Int {
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        
        let partURL = destination.appendingPathExtension("part")
        
        // Clean up any existing part file
        try? FileManager.default.removeItem(at: partURL)
        
        let (tempURL, response) = try await URLSession.shared.download(for: request)
        
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 200
        
        guard (200...299).contains(statusCode) else {
            throw NSError(
                domain: "FileDownloader",
                code: statusCode,
                userInfo: [NSLocalizedDescriptionKey: "HTTP \(statusCode)"]
            )
        }

        // Ensure parent directory exists
        let parentDir = destination.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

        // Move to part file first
        try FileManager.default.moveItem(at: tempURL, to: partURL)

        // Atomic rename to final destination
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: partURL, to: destination)
        
        return statusCode
    }
    
    static func downloadData(url urlString: String) async throws -> Data {
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        if let httpResponse = response as? HTTPURLResponse {
            guard (200...299).contains(httpResponse.statusCode) else {
                throw NSError(
                    domain: "FileDownloader",
                    code: httpResponse.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: "HTTP \(httpResponse.statusCode)"]
                )
            }
        }
        
        return data
    }
}

private class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    let progressHandler: (Double) -> Void

    init(progressHandler: @escaping (Double) -> Void) {
        self.progressHandler = progressHandler
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesExpectedToWrite > 0 else { return }
        let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        DispatchQueue.main.async {
            self.progressHandler(progress)
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // This is required by the protocol but we handle the file in the main function
    }
}
