import Foundation

enum MediaType {
    case image
    case video(dashURL: String?)
    case redgifs  // RedGifs video - URL resolved at download time
}

struct MediaItem {
    let postId: String
    let title: String
    let url: String
    let type: MediaType
    let createdDate: Date
    let index: Int
    let fileExtension: String
}

class MediaExtractor {
    private static let imageExtensions = ["jpg", "jpeg", "png", "gif", "webp"]
    private static let supportedExternalHosts = ["redgifs.com"]
    private static let unsupportedExternalHosts = ["imgur.com", "giphy.com", "gfycat.com", "flickr.com"]
    
    static func extractMedia(from posts: [RedditPost], log: @escaping (String) -> Void) -> [MediaItem] {
        var items: [MediaItem] = []
        var skippedText = 0
        var skippedExternal = 0
        var skippedOther = 0
        
        for post in posts {
            let postItems = extractFromPost(post, log: log)
            if postItems.isEmpty {
                // Categorize why it was skipped
                if post.url == nil && post.preview == nil && post.secureMedia == nil && post.mediaMetadata == nil {
                    skippedText += 1
                } else {
                    skippedOther += 1
                }
            }
            items.append(contentsOf: postItems)
        }
        
        if skippedText > 0 {
            log("Skipped \(skippedText) text/link posts (no media)")
        }
        if skippedExternal > 0 {
            log("Skipped \(skippedExternal) external host posts")
        }
        if skippedOther > 0 {
            log("Skipped \(skippedOther) posts (unsupported format)")
        }
        
        return items
    }
    
    private static func extractFromPost(_ post: RedditPost, log: @escaping (String) -> Void) -> [MediaItem] {
        let createdDate = Date(timeIntervalSince1970: post.createdUtc)
        
        // Check for gallery first
        if post.isGallery == true, let metadata = post.mediaMetadata {
            return extractGalleryItems(post: post, metadata: metadata, createdDate: createdDate)
        }
        
        // Check for Reddit-hosted video
        if post.isVideo == true || post.secureMedia?.redditVideo != nil {
            if let videoItem = extractVideoItem(post: post, createdDate: createdDate) {
                return [videoItem]
            }
        }
        
        // Check for redgifs
        if let url = post.urlOverriddenByDest ?? post.url,
           url.lowercased().contains("redgifs.com"),
           let redgifsId = RedGifsAPI.extractRedGifsId(from: url) {
            return [MediaItem(
                postId: post.id,
                title: post.title,
                url: redgifsId, // Store ID, will resolve URL during download
                type: .redgifs,
                createdDate: createdDate,
                index: 1,
                fileExtension: "mp4"
            )]
        }
        
        // Check for image
        if let imageItem = extractImageItem(post: post, createdDate: createdDate) {
            return [imageItem]
        }
        
        return []
    }
    
    private static func extractGalleryItems(post: RedditPost, metadata: [String: MediaMetadataItem], createdDate: Date) -> [MediaItem] {
        var items: [MediaItem] = []
        
        // Use gallery_data order if available
        let orderedIds: [String]
        if let galleryData = post.galleryData?.items {
            orderedIds = galleryData.map { $0.mediaId }
        } else {
            orderedIds = Array(metadata.keys)
        }
        
        for (index, mediaId) in orderedIds.enumerated() {
            guard let item = metadata[mediaId] else {
                continue
            }
            
            // Some items may not have status field or may be "valid"
            if let status = item.status, status != "valid" {
                continue
            }
            
            guard let source = item.s else {
                continue
            }
            
            // Get the best quality URL
            var urlString: String?
            if let u = source.u {
                urlString = Utils.decodeHTMLEntities(u)
            } else if let gif = source.gif {
                urlString = Utils.decodeHTMLEntities(gif)
            } else if let mp4 = source.mp4 {
                urlString = Utils.decodeHTMLEntities(mp4)
            }
            
            guard let url = urlString else { continue }
            
            let ext = determineExtension(from: url, mimeType: item.m)
            
            items.append(MediaItem(
                postId: post.id,
                title: post.title,
                url: url,
                type: .image,
                createdDate: createdDate,
                index: index + 1,
                fileExtension: ext
            ))
        }
        
        return items
    }
    
    private static func extractVideoItem(post: RedditPost, createdDate: Date) -> MediaItem? {
        guard let redditVideo = post.secureMedia?.redditVideo else {
            return nil
        }
        
        let dashURL = redditVideo.dashUrl.map { Utils.decodeHTMLEntities($0) }
        
        guard let fallbackURL = redditVideo.fallbackUrl else {
            return nil
        }
        
        let decodedFallback = Utils.decodeHTMLEntities(fallbackURL)
        
        return MediaItem(
            postId: post.id,
            title: post.title,
            url: decodedFallback,
            type: .video(dashURL: dashURL),
            createdDate: createdDate,
            index: 1,
            fileExtension: "mp4"
        )
    }
    
    private static func extractImageItem(post: RedditPost, createdDate: Date) -> MediaItem? {
        var imageURL: String?
        
        // Priority 1: preview.images source (full resolution)
        if let preview = post.preview?.images?.first?.source {
            imageURL = Utils.decodeHTMLEntities(preview.url)
        }
        
        // Priority 2: url_overridden_by_dest
        if imageURL == nil, let urlOverride = post.urlOverriddenByDest {
            let decoded = Utils.decodeHTMLEntities(urlOverride)
            if isDirectImageURL(decoded) {
                imageURL = decoded
            }
        }
        
        // Priority 3: url field
        if imageURL == nil, let url = post.url {
            let decoded = Utils.decodeHTMLEntities(url)
            if isDirectImageURL(decoded) {
                imageURL = decoded
            }
        }
        
        // Skip external hosts
        if let url = imageURL, isExternalHost(url) {
            return nil
        }
        
        guard let finalURL = imageURL else {
            return nil
        }
        
        let ext = determineExtension(from: finalURL, mimeType: nil)
        
        return MediaItem(
            postId: post.id,
            title: post.title,
            url: finalURL,
            type: .image,
            createdDate: createdDate,
            index: 1,
            fileExtension: ext
        )
    }
    
    private static func isDirectImageURL(_ url: String) -> Bool {
        let lowercased = url.lowercased()
        
        // Check for i.redd.it or preview.redd.it
        if lowercased.contains("i.redd.it") || lowercased.contains("preview.redd.it") {
            return true
        }
        
        // Check for image extensions
        for ext in imageExtensions {
            if lowercased.hasSuffix(".\(ext)") {
                return true
            }
        }
        
        return false
    }
    
    private static func isExternalHost(_ url: String) -> Bool {
        let lowercased = url.lowercased()
        for host in unsupportedExternalHosts {
            if lowercased.contains(host) {
                return true
            }
        }
        return false
    }
    
    private static func determineExtension(from url: String, mimeType: String?) -> String {
        // Try to get from mime type
        if let mime = mimeType {
            if mime.contains("gif") { return "gif" }
            if mime.contains("png") { return "png" }
            if mime.contains("webp") { return "webp" }
            if mime.contains("jpeg") || mime.contains("jpg") { return "jpg" }
            if mime.contains("mp4") { return "mp4" }
        }
        
        // Try to get from URL
        let lowercased = url.lowercased()
        for ext in imageExtensions {
            if lowercased.contains(".\(ext)") {
                return ext
            }
        }
        
        // Default
        return "jpg"
    }
}
