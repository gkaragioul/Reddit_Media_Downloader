import Foundation
import Network

// Represents the state of a single download item
struct DownloadItemState: Codable {
    let mediaItem: MediaItemState
    let filename: String
    let hash: String
    let isVideo: Bool
    var status: DownloadStatus
    var attemptCount: Int

    enum DownloadStatus: String, Codable {
        case pending
        case downloading
        case completed
        case failed
    }
}

// Codable version of MediaItem
struct MediaItemState: Codable {
    let postId: String
    let title: String
    let url: String
    let typeRaw: String  // "image", "video", or "redgifs"
    let dashURL: String?
    let createdTimestamp: Double
    let index: Int
    let fileExtension: String

    init(from mediaItem: MediaItem) {
        self.postId = mediaItem.postId
        self.title = mediaItem.title
        self.url = mediaItem.url
        self.index = mediaItem.index
        self.fileExtension = mediaItem.fileExtension
        self.createdTimestamp = mediaItem.createdDate.timeIntervalSince1970

        switch mediaItem.type {
        case .image:
            self.typeRaw = "image"
            self.dashURL = nil
        case .video(let dashURL):
            self.typeRaw = "video"
            self.dashURL = dashURL
        case .redgifs:
            self.typeRaw = "redgifs"
            self.dashURL = nil
        }
    }

    func toMediaItem() -> MediaItem {
        let createdDate = Date(timeIntervalSince1970: createdTimestamp)
        let type: MediaType

        switch typeRaw {
        case "image":
            type = .image
        case "video":
            type = .video(dashURL: dashURL)
        case "redgifs":
            type = .redgifs
        default:
            type = .image
        }

        return MediaItem(
            postId: postId,
            title: title,
            url: url,
            type: type,
            createdDate: createdDate,
            index: index,
            fileExtension: fileExtension
        )
    }
}

// Overall download session state
struct DownloadSessionState: Codable {
    let sessionId: UUID
    let profileInput: String
    let startDate: Date
    var items: [DownloadItemState]
    var downloadedCount: Int
    var totalCount: Int
    var photoCount: Int
    var videoCount: Int

    var outputFolderPath: String
    var photosFolderPath: String
    var videosFolderPath: String
}

// Manager for persisting and loading download state
class DownloadStateManager {
    private let stateFileURL: URL

    init(outputFolder: URL) {
        self.stateFileURL = outputFolder.appendingPathComponent(".download_state.json")
    }

    func saveState(_ state: DownloadSessionState) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(state)
            try data.write(to: stateFileURL, options: .atomic)
        } catch {
            print("Failed to save download state: \(error)")
        }
    }

    func loadState() -> DownloadSessionState? {
        guard FileManager.default.fileExists(atPath: stateFileURL.path) else {
            return nil
        }

        do {
            let data = try Data(contentsOf: stateFileURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(DownloadSessionState.self, from: data)
        } catch {
            print("Failed to load download state: \(error)")
            return nil
        }
    }

    func clearState() {
        try? FileManager.default.removeItem(at: stateFileURL)
    }

    func hasUnfinishedDownloads() -> Bool {
        guard let state = loadState() else { return false }
        return state.items.contains { $0.status == .pending || $0.status == .downloading }
    }
}

// Network monitoring to detect network changes
actor NetworkMonitor {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")
    private var isMonitoring = false

    nonisolated(unsafe) var onNetworkChange: ((Bool) -> Void)?
    nonisolated(unsafe) var onNetworkReconnect: (() -> Void)?

    private var wasConnected = false

    func startMonitoring() {
        guard !isMonitoring else { return }

        monitor.pathUpdateHandler = { [weak self] path in
            let isConnected = path.status == .satisfied

            Task {
                await self?.handlePathUpdate(isConnected: isConnected)
            }
        }

        monitor.start(queue: queue)
        isMonitoring = true
    }

    private func handlePathUpdate(isConnected: Bool) async {
        let onChangeCallback = onNetworkChange
        let onReconnectCallback = onNetworkReconnect
        let previouslyConnected = wasConnected

        wasConnected = isConnected

        Task { @MainActor in
            onChangeCallback?(isConnected)

            // If we were disconnected and now reconnected, trigger reconnect callback
            if !previouslyConnected && isConnected {
                onReconnectCallback?()
            }
        }
    }

    func stopMonitoring() {
        guard isMonitoring else { return }
        monitor.cancel()
        isMonitoring = false
    }

    func isConnected() -> Bool {
        return wasConnected
    }
}
