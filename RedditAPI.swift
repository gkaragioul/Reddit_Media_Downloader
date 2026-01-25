import Foundation

struct RedditPost: Decodable {
    let id: String
    let title: String
    let url: String?
    let urlOverriddenByDest: String?
    let postHint: String?
    let isVideo: Bool?
    let isGallery: Bool?
    let createdUtc: Double
    let preview: Preview?
    let secureMedia: SecureMedia?
    let mediaMetadata: [String: MediaMetadataItem]?
    let galleryData: GalleryData?
    
    enum CodingKeys: String, CodingKey {
        case id, title, url, preview
        case urlOverriddenByDest = "url_overridden_by_dest"
        case postHint = "post_hint"
        case isVideo = "is_video"
        case isGallery = "is_gallery"
        case createdUtc = "created_utc"
        case secureMedia = "secure_media"
        case mediaMetadata = "media_metadata"
        case galleryData = "gallery_data"
    }
}

struct Preview: Decodable {
    let images: [PreviewImage]?
}

struct PreviewImage: Decodable {
    let source: ImageSource?
}

struct ImageSource: Decodable {
    let url: String
    let width: Int?
    let height: Int?
}

struct SecureMedia: Decodable {
    let redditVideo: RedditVideo?
    
    enum CodingKeys: String, CodingKey {
        case redditVideo = "reddit_video"
    }
}

struct RedditVideo: Decodable {
    let fallbackUrl: String?
    let dashUrl: String?
    let hlsUrl: String?
    let duration: Int?
    let width: Int?
    let height: Int?
    
    enum CodingKeys: String, CodingKey {
        case fallbackUrl = "fallback_url"
        case dashUrl = "dash_url"
        case hlsUrl = "hls_url"
        case duration, width, height
    }
}

struct MediaMetadataItem: Decodable {
    let status: String?
    let e: String?
    let m: String?
    let s: MediaMetadataSource?
}

struct MediaMetadataSource: Decodable {
    let u: String?
    let gif: String?
    let mp4: String?
    let x: Int?
    let y: Int?
}

struct GalleryData: Decodable {
    let items: [GalleryItem]?
}

struct GalleryItem: Decodable {
    let mediaId: String
    let id: Int?
    
    enum CodingKeys: String, CodingKey {
        case mediaId = "media_id"
        case id
    }
}

struct RedditListing: Decodable {
    let data: ListingData
}

struct ListingData: Decodable {
    let children: [PostWrapper]
    let after: String?
}

struct PostWrapper: Decodable {
    let data: RedditPost
}

class RedditAPI {
    private static let userAgent = "macos:reddit.profile.downloader:v1.0"
    private static let baseURL = "https://www.reddit.com"
    
    static var rateLimiter: RateLimiter?
    static var onCooldown: ((Int) -> Void)?
    
    static func setupRateLimiter(requestsPerMinute: Int) {
        rateLimiter = RateLimiter(requestsPerMinute: requestsPerMinute)
        rateLimiter?.onCooldownUpdate = { seconds in
            onCooldown?(seconds)
        }
    }
    
    static func updateSpeed(requestsPerMinute: Int) async {
        await rateLimiter?.updateSpeed(requestsPerMinute: requestsPerMinute)
    }
    
    static func fetchAllPosts(
        source: RedditSource,
        speedMode: SpeedMode,
        batchModeEnabled: Bool,
        batchSize: Int,
        batchPauseSeconds: Int,
        log: @escaping (String) -> Void
    ) async throws -> [RedditPost] {
        var allPosts: [RedditPost] = []
        var after: String? = nil
        let maxPosts = 2000
        var pageCount = 0
        
        // Setup rate limiter if needed
        if rateLimiter == nil {
            setupRateLimiter(requestsPerMinute: speedMode.requestsPerMinute)
        }
        
        while allPosts.count < maxPosts {
            // Apply rate limiting before request
            await rateLimiter?.beforeRequest()
            
            let result = try await fetchPageWithRetry(source: source, after: after)
            
            switch result {
            case .success(let posts, let nextAfter):
                allPosts.append(contentsOf: posts)
                pageCount += 1
                
                if nextAfter == nil || posts.isEmpty {
                    return allPosts
                }
                
                after = nextAfter
                
                // Batch mode: pause after batchSize posts
                if batchModeEnabled && allPosts.count >= batchSize * (pageCount / (batchSize / 100 + 1)) {
                    let pauseCount = allPosts.count / batchSize
                    if pauseCount > 0 && allPosts.count % batchSize < 100 {
                        log("Batch pause: \(batchPauseSeconds)s...")
                        try await Task.sleep(nanoseconds: UInt64(batchPauseSeconds) * 1_000_000_000)
                    }
                }
                
            case .failure(let error):
                throw error
            }
        }
        
        return allPosts
    }
    
    private static func fetchPageWithRetry(source: RedditSource, after: String?) async throws -> FetchResult {
        var retries = 0
        let maxRetries = 5
        
        while retries < maxRetries {
            let (data, response, headers) = try await fetchPageRaw(source: source, after: after)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw URLError(.badServerResponse)
            }
            
            // Process rate limit response
            let action = await rateLimiter?.afterResponse(
                headers: headers,
                statusCode: httpResponse.statusCode
            ) ?? .proceed
            
            switch action {
            case .retry:
                retries += 1
                continue
            case .giveUp:
                throw NSError(domain: "RedditAPI", code: 429, userInfo: [NSLocalizedDescriptionKey: "Rate limited after max retries"])
            case .proceed:
                break
            }
            
            // Handle other status codes
            if httpResponse.statusCode == 404 {
                let notFoundMsg: String
                switch source {
                case .user: notFoundMsg = "User not found"
                case .subreddit: notFoundMsg = "Subreddit not found"
                }
                throw NSError(domain: "RedditAPI", code: 404, userInfo: [NSLocalizedDescriptionKey: notFoundMsg])
            }
            
            if httpResponse.statusCode != 200 {
                throw NSError(domain: "RedditAPI", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP \(httpResponse.statusCode)"])
            }
            
            // Parse response
            let listing = try JSONDecoder().decode(RedditListing.self, from: data)
            let posts = listing.data.children.map { $0.data }
            
            return .success(posts: posts, nextAfter: listing.data.after)
        }
        
        throw NSError(domain: "RedditAPI", code: 429, userInfo: [NSLocalizedDescriptionKey: "Max retries exceeded"])
    }
    
    private static func fetchPageRaw(source: RedditSource, after: String?) async throws -> (Data, URLResponse, [AnyHashable: Any]?) {
        let urlString: String

        switch source {
        case .user(let username):
            var url = "\(baseURL)/user/\(username)/submitted.json?limit=100&raw_json=1"
            if let after = after {
                url += "&after=\(after)"
            }
            urlString = url

        case .subreddit(let subreddit):
            var url = "\(baseURL)/r/\(subreddit)/hot.json?limit=100&raw_json=1"
            if let after = after {
                url += "&after=\(after)"
            }
            urlString = url
        }
        
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        let headers = (response as? HTTPURLResponse)?.allHeaderFields
        
        return (data, response, headers)
    }
    
    enum FetchResult {
        case success(posts: [RedditPost], nextAfter: String?)
        case failure(Error)
    }
}
