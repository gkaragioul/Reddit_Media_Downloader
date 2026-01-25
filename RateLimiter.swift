import Foundation

actor RateLimiter {
    private var minDelay: Double
    private var lastRequestTime: Date = .distantPast
    private var cooldownUntil: Date = .distantPast
    private var consecutiveFailures: Int = 0
    private let maxRetries: Int = 5
    
    // Rate limit state from headers
    private var remaining: Double = 100
    private var resetSeconds: Double = 60
    
    // Callback for UI updates
    nonisolated(unsafe) var onCooldownUpdate: ((Int) -> Void)?
    
    init(requestsPerMinute: Int) {
        self.minDelay = 60.0 / Double(requestsPerMinute)
    }
    
    func updateSpeed(requestsPerMinute: Int) {
        self.minDelay = 60.0 / Double(requestsPerMinute)
        // Reset timing state
        self.lastRequestTime = .distantPast
    }
    
    func getMinDelay() -> Double {
        return minDelay
    }
    
    func beforeRequest() async {
        // Check if we're in cooldown
        let now = Date()
        if cooldownUntil > now {
            let waitTime = cooldownUntil.timeIntervalSince(now)
            notifyCooldown(Int(ceil(waitTime)))
            try? await Task.sleep(nanoseconds: UInt64(waitTime * 1_000_000_000))
            notifyCooldown(0)
        }
        
        // Calculate delay based on rate limit headers or min delay
        var targetDelay = minDelay
        
        if remaining <= 1 && resetSeconds > 0 {
            targetDelay = resetSeconds + Double.random(in: 0...2)
        } else if remaining > 0 {
            let headerBasedDelay = resetSeconds / max(remaining, 1)
            targetDelay = max(minDelay, headerBasedDelay)
        }
        
        // Add jitter
        targetDelay += Double.random(in: 0...0.25)
        
        // Wait if needed since last request
        let timeSinceLastRequest = now.timeIntervalSince(lastRequestTime)
        if timeSinceLastRequest < targetDelay {
            let sleepTime = targetDelay - timeSinceLastRequest
            try? await Task.sleep(nanoseconds: UInt64(sleepTime * 1_000_000_000))
        }
        
        lastRequestTime = Date()
    }
    
    func afterResponse(headers: [AnyHashable: Any]?, statusCode: Int) async -> RetryAction {
        if let headers = headers {
            if let remainingStr = headers["x-ratelimit-remaining"] as? String,
               let remainingVal = Double(remainingStr) {
                remaining = remainingVal
            }
            if let resetStr = headers["x-ratelimit-reset"] as? String,
               let resetVal = Double(resetStr) {
                resetSeconds = resetVal
            }
        }
        
        if statusCode == 429 {
            consecutiveFailures += 1
            
            if consecutiveFailures > maxRetries {
                consecutiveFailures = 0
                return .giveUp
            }
            
            var backoffSeconds: Double
            
            if let headers = headers,
               let retryAfter = headers["retry-after"] as? String,
               let retrySeconds = Double(retryAfter) {
                backoffSeconds = retrySeconds
            } else {
                backoffSeconds = min(30.0 * pow(2.0, Double(consecutiveFailures - 1)), 600.0)
            }
            
            backoffSeconds += Double.random(in: 0...5)
            
            cooldownUntil = Date().addingTimeInterval(backoffSeconds)
            notifyCooldown(Int(ceil(backoffSeconds)))
            try? await Task.sleep(nanoseconds: UInt64(backoffSeconds * 1_000_000_000))
            notifyCooldown(0)
            
            return .retry
        }
        
        if statusCode >= 200 && statusCode < 300 {
            consecutiveFailures = 0
        }
        
        return .proceed
    }
    
    private func notifyCooldown(_ seconds: Int) {
        let callback = onCooldownUpdate
        Task { @MainActor in
            callback?(seconds)
        }
    }
    
    enum RetryAction {
        case proceed
        case retry
        case giveUp
    }
}

// Per-host rate limiter for media downloads with speed control
actor MediaHostLimiter {
    private var hostBackoffs: [String: Date] = [:]
    private var maxConcurrent: Int
    private var activeDownloads: Int = 0
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var lastDownloadTime: Date = .distantPast
    private var minDelayBetweenDownloads: Double
    
    init(maxConcurrent: Int = 3, minDelaySeconds: Double = 0.5) {
        self.maxConcurrent = maxConcurrent
        self.minDelayBetweenDownloads = minDelaySeconds
    }
    
    func updateSettings(maxConcurrent: Int, minDelaySeconds: Double) {
        self.maxConcurrent = maxConcurrent
        self.minDelayBetweenDownloads = minDelaySeconds
    }
    
    func beforeDownload(host: String) async {
        // Check host-specific backoff
        if let backoffUntil = hostBackoffs[host], backoffUntil > Date() {
            let waitTime = backoffUntil.timeIntervalSince(Date())
            try? await Task.sleep(nanoseconds: UInt64(waitTime * 1_000_000_000))
        }
        
        // Enforce minimum delay between downloads
        let now = Date()
        let timeSinceLastDownload = now.timeIntervalSince(lastDownloadTime)
        if timeSinceLastDownload < minDelayBetweenDownloads {
            let sleepTime = minDelayBetweenDownloads - timeSinceLastDownload
            try? await Task.sleep(nanoseconds: UInt64(sleepTime * 1_000_000_000))
        }
        
        // Wait for slot
        if activeDownloads >= maxConcurrent {
            await withCheckedContinuation { continuation in
                waiters.append(continuation)
            }
        }
        
        activeDownloads += 1
        lastDownloadTime = Date()
    }
    
    func afterDownload(host: String, statusCode: Int) {
        activeDownloads -= 1
        
        if statusCode == 429 || statusCode == 503 {
            let backoffSeconds = Double.random(in: 10...30)
            hostBackoffs[host] = Date().addingTimeInterval(backoffSeconds)
        }
        
        if let waiter = waiters.first {
            waiters.removeFirst()
            waiter.resume()
        }
    }
}
