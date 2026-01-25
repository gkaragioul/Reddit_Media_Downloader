import Foundation

class RedGifsAPI {
    private static var cachedToken: String?
    private static var tokenExpiry: Date?
    
    static func getVideoURL(id: String) async throws -> String? {
        let maxRetries = 3
        let retryDelays = [2.0, 5.0, 10.0]

        for attempt in 0..<maxRetries {
            do {
                let token = try await getToken()

                let url = URL(string: "https://api.redgifs.com/v2/gifs/\(id)")!
                var request = URLRequest(url: url)
                request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", forHTTPHeaderField: "User-Agent")
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

                let (data, response) = try await URLSession.shared.data(for: request)

                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                    return nil
                }

                let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                let gif = json?["gif"] as? [String: Any]
                let urls = gif?["urls"] as? [String: Any]

                // Prefer HD, fallback to SD
                return urls?["hd"] as? String ?? urls?["sd"] as? String

            } catch let error as URLError {
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

                if attempt >= maxRetries - 1 {
                    throw error  // Last attempt, throw the error
                }

                // Wait before retrying
                let delay = retryDelays[attempt]
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }

        return nil
    }
    
    private static func getToken() async throws -> String {
        // Return cached token if still valid
        if let token = cachedToken, let expiry = tokenExpiry, Date() < expiry {
            return token
        }
        
        let url = URL(string: "https://api.redgifs.com/v2/auth/temporary")!
        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", forHTTPHeaderField: "User-Agent")
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        
        guard let token = json?["token"] as? String else {
            throw NSError(domain: "RedGifsAPI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to get token"])
        }
        
        cachedToken = token
        tokenExpiry = Date().addingTimeInterval(3600) // Token valid for ~1 hour
        
        return token
    }
    
    static func extractRedGifsId(from url: String) -> String? {
        // URLs like: https://redgifs.com/watch/scornfulpalegoldfish
        // or: https://www.redgifs.com/watch/scornfulpalegoldfish
        let pattern = #"redgifs\.com/(?:watch|ifr)/([a-zA-Z]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.firstMatch(in: url, range: NSRange(url.startIndex..., in: url)),
              let range = Range(match.range(at: 1), in: url) else {
            return nil
        }
        return String(url[range]).lowercased()
    }
}
