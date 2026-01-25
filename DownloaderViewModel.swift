import Foundation
import SwiftUI
import CryptoKit

struct LogLine: Identifiable {
    let id = UUID()
    let text: String
    let isError: Bool
    
    init(_ text: String, isError: Bool = false) {
        let timestamp = DateFormatter.logFormatter.string(from: Date())
        self.text = "[\(timestamp)] \(text)"
        self.isError = isError
    }
}

@MainActor
class DownloaderViewModel: ObservableObject {
    @Published var profileInput: String = ""
    @Published var isDownloading: Bool = false
    @Published var isPaused: Bool = false
    @Published var isCancelling: Bool = false
    @Published var logLines: [LogLine] = []
    @Published var progressText: String = ""
    @Published var cooldownSeconds: Int = 0
    @Published var statusText: String = "Ready"
    @Published var currentFileProgress: Double = 0.0
    @Published var currentFileName: String = ""
    @Published var overallProgress: Double = 0.0
    @Published var networkStatus: String = "Connected"

    private var downloadedCount = 0
    private var skippedCount = 0
    private var totalCount = 0
    private var photoCount = 0
    private var videoCount = 0
    private var downloadedHashes: Set<String> = []
    private var existingFiles: Set<String> = []  // Track existing files by filename
    private var contentHashes: Set<String> = []  // Track file content hashes (SHA256)
    private var indexData: [String: [String]] = [:]
    private var outputFolder: URL?
    private var photosFolder: URL?
    private var videosFolder: URL?

    // Rate limiting
    private var mediaLimiter: MediaHostLimiter?

    // Cancellation and pause support
    private var isCancelled = false
    private var pauseContinuation: CheckedContinuation<Void, Never>?

    // Network monitoring and state persistence
    private var networkMonitor: NetworkMonitor?
    private var stateManager: DownloadStateManager?
    private var currentSessionState: DownloadSessionState?
    private var isNetworkConnected = true
    private var autoPausedByNetworkChange = false
    
    func togglePause() {
        if isPaused {
            isPaused = false
            pauseContinuation?.resume()
            pauseContinuation = nil
            log("▶️ Resumed")
        } else {
            isPaused = true
            log("⏸️ Paused")
        }
    }
    
    func cancelDownload() {
        isCancelled = true
        isCancelling = true
        if isPaused {
            isPaused = false
            pauseContinuation?.resume()
            pauseContinuation = nil
        }
        log("❌ Cancelled")
        statusText = "Cancelled - ready for new download"
    }

    func clearState() {
        // Force reset all state
        isDownloading = false
        isPaused = false
        isCancelled = false
        isCancelling = false
        downloadedCount = 0
        skippedCount = 0
        totalCount = 0
        photoCount = 0
        videoCount = 0
        downloadedHashes = []
        existingFiles = []
        contentHashes = []
        indexData = [:]
        cooldownSeconds = 0
        pauseContinuation = nil
        isNetworkConnected = true
        networkStatus = "Connected"
        currentFileProgress = 0.0
        currentFileName = ""
        overallProgress = 0.0
        logLines = []
        statusText = "Ready"

        log("🔄 State cleared - ready for new download")
    }
    
    private func checkPauseAndCancel() async -> Bool {
        if isCancelled { return true }
        
        if isPaused {
            await withCheckedContinuation { continuation in
                pauseContinuation = continuation
            }
        }
        
        return isCancelled
    }
    
    func startDownload(settings: SettingsModel) async {
        guard !isDownloading else { return }

        isDownloading = true
        isPaused = false
        isCancelled = false
        isCancelling = false
        logLines = []
        downloadedCount = 0
        skippedCount = 0
        totalCount = 0
        photoCount = 0
        videoCount = 0
        downloadedHashes = []
        existingFiles = []
        contentHashes = []
        indexData = [:]
        cooldownSeconds = 0
        pauseContinuation = nil  // Reset continuation
        isNetworkConnected = true
        networkStatus = "Connected"
        statusText = "Initializing..."

        // Setup rate limiter - always recreate with current settings
        RedditAPI.rateLimiter = nil  // Force recreation
        RedditAPI.setupRateLimiter(requestsPerMinute: settings.speedMode.requestsPerMinute)
        RedditAPI.onCooldown = { [weak self] seconds in
            Task { @MainActor in
                self?.cooldownSeconds = seconds
                if seconds > 0 {
                    self?.log("⏳ Rate limited, cooling down: \(seconds)s")
                }
            }
        }

        // Calculate delay for media downloads based on speed mode
        // Polite: 2s between downloads, Normal: 1s, Fast: 0.5s
        let mediaDelay: Double
        switch settings.speedMode {
        case .polite: mediaDelay = 2.0
        case .normal: mediaDelay = 1.0
        case .fast: mediaDelay = 0.5
        }

        mediaLimiter = MediaHostLimiter(
            maxConcurrent: settings.maxConcurrentDownloads,
            minDelaySeconds: mediaDelay
        )

        // Setup network monitoring
        networkMonitor = NetworkMonitor()
        await networkMonitor?.startMonitoring()
        networkMonitor?.onNetworkChange = { [weak self] isConnected in
            Task { @MainActor in
                guard let self = self else { return }

                // Only log network changes, don't spam repeated reconnections
                let wasDisconnected = !self.isNetworkConnected

                self.isNetworkConnected = isConnected
                self.networkStatus = isConnected ? "Connected" : "Disconnected"

                if !isConnected {
                    self.log("⏳ Network disconnected - waiting for connection to resume...", isError: false)
                    if self.isPaused {
                        self.statusText = "Paused - Network disconnected"
                    } else {
                        self.statusText = "⏳ Waiting for network to resume..."
                    }
                } else if wasDisconnected {
                    // Only log reconnection if we were actually disconnected before
                    self.log("✅ Network reconnected - resuming downloads")
                    if self.isPaused {
                        self.statusText = "Paused"
                    } else {
                        self.statusText = "Resuming downloads..."
                    }
                }
            }
        }

        defer {
            isDownloading = false
            isPaused = false
            isCancelled = false  // Reset cancel flag
            isCancelling = false
            cooldownSeconds = 0
            pauseContinuation = nil  // Clean up continuation

            // Stop network monitoring
            Task {
                await networkMonitor?.stopMonitoring()
            }

            if !isCancelling {
                statusText = "Ready"
            }
        }

        guard let source = Utils.parseRedditSource(profileInput) else {
            log("Invalid input. Enter a username, u/username, r/subreddit, or Reddit URL.", isError: true)
            statusText = "Error: Invalid input"
            return
        }

        statusText = "Setting up download..."
        log("Downloading from: \(source.displayName)")
        log("Speed: \(settings.speedMode.rawValue) (\(String(format: "%.1f", mediaDelay))s delay)")
        
        // Create output folders
        let downloadsURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first!
        outputFolder = downloadsURL.appendingPathComponent(source.folderName)
        photosFolder = outputFolder!.appendingPathComponent("Photos")
        videosFolder = outputFolder!.appendingPathComponent("Videos")
        
        do {
            try FileManager.default.createDirectory(at: photosFolder!, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: videosFolder!, withIntermediateDirectories: true)
        } catch {
            log("Failed to create output folders: \(error.localizedDescription)", isError: true)
            return
        }

        // Initialize state manager
        stateManager = DownloadStateManager(outputFolder: outputFolder!)

        // Check for unfinished downloads
        if let existingState = stateManager?.loadState() {
            log("⏮️ Found unfinished downloads from previous session - will resume")
            currentSessionState = existingState
            downloadedCount = existingState.downloadedCount
            photoCount = existingState.photoCount
            videoCount = existingState.videoCount
        }

        // Load existing index
        loadExistingHashes()

        // Scan for existing files if duplicate skip is enabled
        if settings.skipDuplicates {
            scanExistingFiles()
        }

        // Fetch posts from Reddit with retry logic
        statusText = "Fetching posts from Reddit..."
        log("Fetching posts... (this may take a few minutes)")
        var posts: [RedditPost]? = nil

        // Retry loop for network failures
        let maxRetries = 3
        let retryDelays = [2.0, 5.0, 10.0]  // Progressive backoff in seconds

        for attempt in 0..<maxRetries {
            // Wait for network if disconnected
            while !isNetworkConnected {
                if await checkPauseAndCancel() {
                    finishDownload(cancelled: true)
                    return
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)  // Check every 2 seconds
                if isCancelled {
                    finishDownload(cancelled: true)
                    return
                }
            }

            // Check pause/cancel before attempting fetch
            if await checkPauseAndCancel() {
                finishDownload(cancelled: true)
                return
            }

            do {
                posts = try await RedditAPI.fetchAllPosts(
                    source: source,
                    speedMode: settings.speedMode,
                    batchModeEnabled: settings.batchModeEnabled,
                    batchSize: settings.batchSize,
                    batchPauseSeconds: settings.batchPauseSeconds,
                    log: { _ in }
                )
                break  // Success, exit retry loop
            } catch let error as URLError {
                // Check if this is a retryable network error
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
                    // Non-retryable error
                    log("Failed to fetch: \(error.localizedDescription)", isError: true)
                    statusText = "Error: Failed to fetch posts"
                    return
                }

                // If this is the last attempt, fail
                if attempt >= maxRetries - 1 {
                    log("Failed to fetch after \(maxRetries) attempts: \(error.localizedDescription)", isError: true)
                    statusText = "Error: Failed to fetch posts"
                    return
                }

                // Wait before retrying
                let delay = retryDelays[attempt]
                log("Network error during fetch, retrying in \(Int(delay))s... (attempt \(attempt + 1)/\(maxRetries))")
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            } catch {
                // Non-URLError, don't retry
                log("Failed to fetch: \(error.localizedDescription)", isError: true)
                statusText = "Error: Failed to fetch posts"
                return
            }
        }

        // Ensure we got posts
        guard let posts = posts else {
            log("Failed to fetch posts", isError: true)
            statusText = "Error: Failed to fetch posts"
            return
        }

        if await checkPauseAndCancel() {
            finishDownload(cancelled: true)
            return
        }

        log("Found \(posts.count) posts")
        statusText = "Extracting media from posts..."

        // Extract media
        let mediaItems = MediaExtractor.extractMedia(from: posts, log: { _ in })

        if mediaItems.isEmpty {
            log("No downloadable media found.", isError: true)
            statusText = "Error: No media found"
            return
        }

        let photos = mediaItems.filter { if case .image = $0.type { return true }; return false }
        let videos = mediaItems.filter { if case .image = $0.type { return false }; return true }

        log("Starting: \(photos.count) photos, \(videos.count) videos")
        totalCount = mediaItems.count
        statusText = "Downloading media..."
        updateProgress()
        
        let ffmpegPath = FFmpegMuxer.findFFmpeg()
        if ffmpegPath == nil && videos.count > 0 {
            log("⚠️ ffmpeg not found - videos may lack audio", isError: true)
        }
        
        // Download with concurrency limit from settings
        await withTaskGroup(of: Void.self) { group in
            let semaphore = AsyncSemaphore(limit: settings.maxConcurrentDownloads)
            
            for item in mediaItems {
                if isCancelled { break }
                
                group.addTask {
                    await semaphore.wait()
                    defer { Task { await semaphore.signal() } }
                    
                    if await self.checkPauseAndCancel() { return }
                    
                    await self.downloadItem(item, ffmpegPath: ffmpegPath)
                }
            }
        }
        
        finishDownload(cancelled: isCancelled)
    }
    
    private func finishDownload(cancelled: Bool) {
        saveIndex()

        if cancelled {
            log("⚠️ Cancelled. \(downloadedCount) saved.")
            statusText = "Cancelled"
        } else {
            log("✅ Done! \(photoCount) photos, \(videoCount) videos")
            statusText = "Complete! \(photoCount) photos, \(videoCount) videos"
        }
        log("📁 \(outputFolder!.path)")
    }

    
    private func saveDownloadState() {
        guard let stateManager = stateManager, let state = currentSessionState else { return }
        stateManager.saveState(state)
    }

    private func downloadItem(_ item: MediaItem, ffmpegPath: String?) async {
        if isCancelled { return }

        // Wait for network connection if disconnected (but respect pause state)
        while !isNetworkConnected {
            await MainActor.run {
                if !isPaused {
                    statusText = "⏳ Waiting for network to resume downloads..."
                }
            }
            // If paused, just wait for pause to be released
            if await checkPauseAndCancel() { return }
            try? await Task.sleep(nanoseconds: 2_000_000_000)  // Check every 2 seconds
            if isCancelled { return }
        }

        let hash = Utils.hashForDedup(postId: item.postId, url: item.url)
        if downloadedHashes.contains(hash) {
            await MainActor.run {
                skippedCount += 1
                downloadedCount += 1
                updateProgress()
            }
            return
        }
        
        let filename = Utils.generateFilename(
            date: item.createdDate,
            postId: item.postId,
            title: item.title,
            index: item.index,
            ext: item.fileExtension
        )

        // Check if file already exists (duplicate detection)
        if existingFiles.contains(filename) {
            await MainActor.run {
                skippedCount += 1
                downloadedCount += 1
                updateProgress()
            }
            return
        }

        let isVideo: Bool
        switch item.type {
        case .image:
            isVideo = false
        case .video, .redgifs:
            isVideo = true
        }

        guard let destFolder = isVideo ? videosFolder : photosFolder else { return }
        let destURL = destFolder.appendingPathComponent(filename)
        
        let typeEmoji = isVideo ? "📹" : "🖼️"
        await MainActor.run {
            log("\(typeEmoji) \(filename)")
            currentFileName = filename
            currentFileProgress = 0.0
        }

        var statusCode = 200
        var downloadHost = ""

        do {
            switch item.type {
            case .image:
                downloadHost = URL(string: item.url)?.host ?? "unknown"
                await mediaLimiter?.beforeDownload(host: downloadHost)

                let (code, actualURL) = try await FileDownloader.downloadWithRetry(url: item.url, to: destURL) { progress in
                    Task { @MainActor in
                        self.currentFileProgress = progress
                        self.updateProgress()
                    }
                }
                statusCode = code
                await MainActor.run {
                    currentFileProgress = 0.0
                    currentFileName = ""
                }

                // Check if we downloaded an actual GIF file and convert to MP4
                if actualURL.pathExtension == "gif" && FFmpegMuxer.isActualGif(at: actualURL) {
                    if let ffmpeg = ffmpegPath, let videosFolder = videosFolder {
                        await MainActor.run {
                            log("🔄 Converting GIF to MP4: \(actualURL.lastPathComponent)")
                            statusText = "Converting GIF to MP4... (\(actualURL.lastPathComponent))"
                        }

                        do {
                            let mp4Filename = actualURL.lastPathComponent.replacingOccurrences(of: ".gif", with: ".mp4")
                            // Save converted MP4 to Videos folder, not Photos folder
                            let mp4URL = videosFolder.appendingPathComponent(mp4Filename)

                            try await FFmpegMuxer.convertGifToMp4(gifPath: actualURL, outputPath: mp4URL, ffmpegPath: ffmpeg)

                            // Delete original GIF
                            try? FileManager.default.removeItem(at: actualURL)

                            await MainActor.run {
                                log("✅ Converted to MP4 (moved to Videos): \(mp4Filename)")
                            }

                            // Record the MP4 file as a video (isVideo: true)
                            await recordDownload(item: item, filename: mp4Filename, hash: hash, isVideo: true, fileURL: mp4URL)
                        } catch {
                            await MainActor.run {
                                log("⚠️ GIF conversion failed, keeping original: \(error.localizedDescription)", isError: true)
                            }
                            // Keep the original GIF if conversion fails
                            await recordDownload(item: item, filename: actualURL.lastPathComponent, hash: hash, isVideo: false, fileURL: actualURL)
                        }
                    } else {
                        // No ffmpeg available, keep the GIF
                        await recordDownload(item: item, filename: actualURL.lastPathComponent, hash: hash, isVideo: false, fileURL: actualURL)
                    }
                } else {
                    // Not a GIF or already MP4, record as-is
                    await recordDownload(item: item, filename: actualURL.lastPathComponent, hash: hash, isVideo: false, fileURL: actualURL)
                }

            case .video(let dashURL):
                downloadHost = URL(string: item.url)?.host ?? "unknown"
                await mediaLimiter?.beforeDownload(host: downloadHost)

                if let ffmpeg = ffmpegPath, let dash = dashURL {
                    await MainActor.run {
                        statusText = "Processing video with ffmpeg... (\(filename))"
                    }
                    try await FFmpegMuxer.muxDashVideo(
                        dashURL: dash,
                        fallbackURL: item.url,
                        outputPath: destURL,
                        ffmpegPath: ffmpeg
                    )
                } else {
                    await MainActor.run {
                        statusText = "Downloading video... (\(filename))"
                    }
                    let (code, _) = try await FileDownloader.downloadWithRetry(url: item.url, to: destURL) { progress in
                        Task { @MainActor in
                            self.currentFileProgress = progress
                            self.updateProgress()
                        }
                    }
                    statusCode = code
                }
                await MainActor.run {
                    currentFileProgress = 0.0
                    currentFileName = ""
                }
                await recordDownload(item: item, filename: filename, hash: hash, isVideo: true, fileURL: destURL)

            case .redgifs:
                await MainActor.run {
                    statusText = "Fetching RedGifs video URL..."
                }

                // Wait for network before RedGifs API call
                while !isNetworkConnected {
                    await MainActor.run {
                        if !isPaused {
                            statusText = "⏳ Waiting for network to fetch RedGifs URL..."
                        }
                    }
                    if await checkPauseAndCancel() { return }
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    if isCancelled { return }
                }

                do {
                    if let videoURL = try await RedGifsAPI.getVideoURL(id: item.url) {
                        // Wait for network before downloading
                        while !isNetworkConnected {
                            await MainActor.run {
                                if !isPaused {
                                    statusText = "⏳ Waiting for network to download RedGifs video..."
                                }
                            }
                            if await checkPauseAndCancel() { return }
                            try? await Task.sleep(nanoseconds: 2_000_000_000)
                            if isCancelled { return }
                        }

                        await MainActor.run {
                            statusText = "Downloading RedGifs video... (\(filename))"
                        }
                        downloadHost = URL(string: videoURL)?.host ?? "redgifs.com"
                        await mediaLimiter?.beforeDownload(host: downloadHost)

                        let (code, _) = try await FileDownloader.downloadWithRetry(url: videoURL, to: destURL) { progress in
                            Task { @MainActor in
                                self.currentFileProgress = progress
                                self.updateProgress()
                            }
                        }
                        statusCode = code
                        await MainActor.run {
                            currentFileProgress = 0.0
                            currentFileName = ""
                        }
                        await recordDownload(item: item, filename: filename, hash: hash, isVideo: true, fileURL: destURL)
                    } else {
                        await MainActor.run {
                            log("❌ RedGifs URL not found: \(filename)", isError: true)
                            downloadedCount += 1
                            updateProgress()
                        }
                    }
                } catch {
                    await MainActor.run {
                        log("❌ RedGifs API error for \(filename): \(error.localizedDescription)", isError: true)
                        downloadedCount += 1
                        updateProgress()
                    }
                }
            }
        } catch {
            await MainActor.run {
                log("❌ \(filename)", isError: true)
                downloadedCount += 1
                updateProgress()
            }
        }

        // Only call afterDownload if we actually called beforeDownload (i.e., downloadHost is set)
        if !downloadHost.isEmpty {
            await mediaLimiter?.afterDownload(host: downloadHost, statusCode: statusCode)
        }
    }
    
    private func checkContentDuplicate(fileURL: URL) -> Bool {
        guard let contentHash = calculateFileHash(fileURL) else {
            return false
        }

        if contentHashes.contains(contentHash) {
            // Duplicate found - delete the newly downloaded file
            try? FileManager.default.removeItem(at: fileURL)
            return true
        }

        // Not a duplicate - add hash to set
        contentHashes.insert(contentHash)
        return false
    }

    @MainActor
    private func recordDownload(item: MediaItem, filename: String, hash: String, isVideo: Bool, fileURL: URL) {
        // Check for content duplicate
        if checkContentDuplicate(fileURL: fileURL) {
            skippedCount += 1
            downloadedCount += 1
            log("⏭️  Skipped duplicate: \(filename)")
            updateProgress()
            return
        }

        downloadedHashes.insert(hash)
        existingFiles.insert(filename)  // Add to existing files to prevent duplicates
        downloadedCount += 1

        if isVideo {
            videoCount += 1
        } else {
            photoCount += 1
        }

        if indexData[item.postId] == nil {
            indexData[item.postId] = []
        }
        indexData[item.postId]?.append(filename)

        updateProgress()
    }
    
    private func updateProgress() {
        var text = "\(downloadedCount)/\(totalCount)"
        if photoCount > 0 || videoCount > 0 {
            text += " (\(photoCount)📷 \(videoCount)🎬)"
        }
        if skippedCount > 0 {
            text += " [\(skippedCount) skipped]"
        }
        if isPaused {
            text = "⏸ " + text
            statusText = "Paused"
        } else if isDownloading {
            statusText = "Downloading media... (\(downloadedCount)/\(totalCount))"
        }
        if cooldownSeconds > 0 {
            text += " ⏳\(cooldownSeconds)s"
            statusText = "Rate limited - cooling down (\(cooldownSeconds)s)..."
        }
        progressText = text

        // Update overall progress bar
        if totalCount > 0 {
            // Calculate progress: completed files + current file progress
            let completedProgress = Double(downloadedCount) / Double(totalCount)
            let currentProgress = (1.0 / Double(totalCount)) * currentFileProgress
            overallProgress = completedProgress + currentProgress
        } else {
            overallProgress = 0.0
        }
    }
    
    private func log(_ message: String, isError: Bool = false) {
        logLines.append(LogLine(message, isError: isError))
    }
    
    private func loadExistingHashes() {
        guard let outputFolder = outputFolder else { return }

        let indexFile = outputFolder.appendingPathComponent("index.json")
        if let data = try? Data(contentsOf: indexFile),
           let index = try? JSONDecoder().decode([String: [String]].self, from: data) {
            for (postId, files) in index {
                for file in files {
                    let hash = Utils.hashForDedup(postId: postId, url: file)
                    downloadedHashes.insert(hash)
                }
            }
        }

        if !downloadedHashes.isEmpty {
            log("Skipping \(downloadedHashes.count) already downloaded")
        }
    }

    private func scanExistingFiles() {
        guard let photosFolder = photosFolder, let videosFolder = videosFolder else { return }

        var fileCount = 0

        // Scan photos folder
        if let photoFiles = try? FileManager.default.contentsOfDirectory(
            at: photosFolder,
            includingPropertiesForKeys: nil
        ) {
            for fileURL in photoFiles {
                let filename = fileURL.lastPathComponent
                // Skip hidden files and system files
                guard !filename.hasPrefix(".") && !filename.hasSuffix(".part") else { continue }

                existingFiles.insert(filename)

                // Calculate and store content hash
                if let hash = calculateFileHash(fileURL) {
                    contentHashes.insert(hash)
                }

                fileCount += 1
            }
        }

        // Scan videos folder
        if let videoFiles = try? FileManager.default.contentsOfDirectory(
            at: videosFolder,
            includingPropertiesForKeys: nil
        ) {
            for fileURL in videoFiles {
                let filename = fileURL.lastPathComponent
                // Skip hidden files and system files
                guard !filename.hasPrefix(".") && !filename.hasSuffix(".part") else { continue }

                existingFiles.insert(filename)

                // Calculate and store content hash
                if let hash = calculateFileHash(fileURL) {
                    contentHashes.insert(hash)
                }

                fileCount += 1
            }
        }

        if fileCount > 0 {
            log("Found \(fileCount) existing files - scanning for content duplicates")
        }
    }
    
    private func saveIndex() {
        guard let outputFolder = outputFolder else { return }
        let indexURL = outputFolder.appendingPathComponent("index.json")

        if let data = try? JSONEncoder().encode(indexData) {
            try? data.write(to: indexURL)
        }
    }

    private func calculateFileHash(_ fileURL: URL) -> String? {
        guard let fileHandle = try? FileHandle(forReadingFrom: fileURL) else {
            return nil
        }
        defer { try? fileHandle.close() }

        var hasher = SHA256()
        let bufferSize = 1024 * 1024 // 1MB buffer

        while autoreleasepool(invoking: {
            guard let data = try? fileHandle.read(upToCount: bufferSize), !data.isEmpty else {
                return false
            }
            hasher.update(data: data)
            return true
        }) {}

        let digest = hasher.finalize()
        return digest.compactMap { String(format: "%02x", $0) }.joined()
    }
}

actor AsyncSemaphore {
    private var count: Int
    private var waiters: [CheckedContinuation<Void, Never>] = []
    
    init(limit: Int) {
        self.count = limit
    }
    
    func wait() async {
        if count > 0 {
            count -= 1
        } else {
            await withCheckedContinuation { continuation in
                waiters.append(continuation)
            }
        }
    }
    
    func signal() {
        if let waiter = waiters.first {
            waiters.removeFirst()
            waiter.resume()
        } else {
            count += 1
        }
    }
}

extension DateFormatter {
    static let logFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()
    
    static let folderFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd_HHmmss"
        return f
    }()
}
