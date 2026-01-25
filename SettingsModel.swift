import Foundation
import SwiftUI

enum SpeedMode: String, CaseIterable, Identifiable {
    case polite = "Polite"
    case normal = "Normal"
    case fast = "Fast"
    
    var id: String { rawValue }
    
    var requestsPerMinute: Int {
        switch self {
        case .polite: return 30
        case .normal: return 60
        case .fast: return 90
        }
    }
    
    var minDelaySeconds: Double {
        return 60.0 / Double(requestsPerMinute)
    }
    
    var icon: String {
        switch self {
        case .polite: return "tortoise.fill"
        case .normal: return "hare.fill"
        case .fast: return "bolt.fill"
        }
    }
    
    var color: Color {
        switch self {
        case .polite: return .green
        case .normal: return .orange
        case .fast: return .red
        }
    }
}

@MainActor
class SettingsModel: ObservableObject {
    static let shared = SettingsModel()

    @AppStorage("speedMode") private var speedModeRaw: String = SpeedMode.normal.rawValue
    @AppStorage("batchModeEnabled") var batchModeEnabled: Bool = false
    @AppStorage("batchSize") var batchSize: Int = 50
    @AppStorage("batchPauseSeconds") var batchPauseSeconds: Int = 60
    @AppStorage("maxConcurrentDownloads") var maxConcurrentDownloads: Int = 3
    @AppStorage("skipDuplicates") var skipDuplicates: Bool = true

    var speedMode: SpeedMode {
        get { SpeedMode(rawValue: speedModeRaw) ?? .normal }
        set { speedModeRaw = newValue.rawValue }
    }

    private init() {}
}
