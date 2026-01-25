import Foundation
import CryptoKit

enum RedditSource {
    case user(String)
    case subreddit(String)

    var displayName: String {
        switch self {
        case .user(let name): return "u/\(name)"
        case .subreddit(let name): return "r/\(name)"
        }
    }

    var folderName: String {
        switch self {
        case .user(let name): return name
        case .subreddit(let name): return "r_\(name)"
        }
    }
}

class Utils {
    
    /// Parse input to determine if it's a user or subreddit
    static func parseRedditSource(_ input: String) -> RedditSource? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Subreddit patterns
        let subredditPatterns = [
            #"(?:https?://)?(?:www\.)?reddit\.com/r/([A-Za-z0-9_]+)/?"#,
            #"^r/([A-Za-z0-9_]+)$"#
        ]
        
        for pattern in subredditPatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                let range = NSRange(trimmed.startIndex..., in: trimmed)
                if let match = regex.firstMatch(in: trimmed, options: [], range: range) {
                    if let nameRange = Range(match.range(at: 1), in: trimmed) {
                        let name = String(trimmed[nameRange])
                        if name.count >= 2 && name.count <= 21 {
                            return .subreddit(name)
                        }
                    }
                }
            }
        }
        
        // User patterns
        let userPatterns = [
            #"(?:https?://)?(?:www\.)?reddit\.com/u(?:ser)?/([A-Za-z0-9_-]+)/?"#,
            #"^u/([A-Za-z0-9_-]+)$"#,
            #"^([A-Za-z0-9_-]+)$"#
        ]
        
        for pattern in userPatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                let range = NSRange(trimmed.startIndex..., in: trimmed)
                if let match = regex.firstMatch(in: trimmed, options: [], range: range) {
                    if let nameRange = Range(match.range(at: 1), in: trimmed) {
                        let name = String(trimmed[nameRange])
                        if name.count >= 3 && name.count <= 20 {
                            return .user(name)
                        }
                    }
                }
            }
        }
        
        return nil
    }
    
    /// Legacy method for backwards compatibility
    static func normalizeUsername(_ input: String) -> String? {
        if case .user(let name) = parseRedditSource(input) {
            return name
        }
        return nil
    }
    
    /// Decode HTML entities in URLs from Reddit JSON
    static func decodeHTMLEntities(_ string: String) -> String {
        var result = string
        let entities: [(String, String)] = [
            ("&amp;", "&"),
            ("&lt;", "<"),
            ("&gt;", ">"),
            ("&quot;", "\""),
            ("&#39;", "'"),
            ("&apos;", "'")
        ]
        
        for (entity, char) in entities {
            result = result.replacingOccurrences(of: entity, with: char)
        }
        
        return result
    }
    
    /// Generate a hash for deduplication
    static func hashForDedup(postId: String, url: String) -> String {
        let combined = "\(postId)_\(url)"
        let data = Data(combined.utf8)
        let hash = SHA256.hash(data: data)
        return hash.prefix(8).map { String(format: "%02x", $0) }.joined()
    }
    
    /// Generate a filesystem-safe filename
    static func generateFilename(date: Date, postId: String, title: String, index: Int, ext: String) -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyyMMdd"
        let dateStr = dateFormatter.string(from: date)
        
        let slug = slugify(title, maxLength: 50)
        let indexStr = String(format: "%03d", index)
        
        return "\(dateStr)_\(postId)_\(slug)_\(indexStr).\(ext)"
    }
    
    /// Convert a title to a filesystem-safe slug
    static func slugify(_ string: String, maxLength: Int = 80) -> String {
        var result = string.lowercased()
        
        result = result.replacingOccurrences(of: " ", with: "_")
        result = result.replacingOccurrences(of: "-", with: "_")
        
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_"))
        result = result.unicodeScalars.filter { allowed.contains($0) }.map { String($0) }.joined()
        
        while result.contains("__") {
            result = result.replacingOccurrences(of: "__", with: "_")
        }
        
        result = result.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        
        if result.count > maxLength {
            result = String(result.prefix(maxLength))
            result = result.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        }
        
        if result.isEmpty {
            result = "untitled"
        }
        
        return result
    }
}
