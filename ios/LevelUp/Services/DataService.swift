import Foundation

enum DataError: Error, LocalizedError {
    case notFound(String)
    case badBaseURL
    case http(Int)

    var errorDescription: String? {
        switch self {
        case .notFound(let p): "Not available offline: \(p)"
        case .badBaseURL: "The data URL is not valid."
        case .http(let c): "Server answered \(c)."
        }
    }
}

/// Source of raw content files. Paths are relative to the site root, e.g. "data/index.json".
protocol DataService: Sendable {
    func fetchData(path: String) async throws -> Data
}

extension DataService {
    func fetchIndex() async throws -> DayIndex {
        try JSONDecoder().decode(DayIndex.self, from: try await fetchData(path: "data/index.json"))
    }
    func fetchDay(_ date: String) async throws -> DayContent {
        var day = try JSONDecoder().decode(DayContent.self, from: try await fetchData(path: "data/\(date).json"))
        if day.date.isEmpty { day.date = date }
        return day
    }
    func fetchWeekly(_ ref: WeeklyRef) async throws -> WeeklySummary {
        var w = try JSONDecoder().decode(WeeklySummary.self, from: try await fetchData(path: "data/" + ref.path))
        if w.id.isEmpty { w.id = ref.id }
        return w
    }
}

/// Reads the JSON copy shipped inside the app (development and offline).
struct BundledDataService: DataService {
    var bundle: Bundle = Bundle(for: BundleToken.self)

    func fetchData(path: String) async throws -> Data {
        let name = ((path as NSString).lastPathComponent as NSString).deletingPathExtension
        guard let url = bundle.url(forResource: name, withExtension: "json") else { throw DataError.notFound(path) }
        return try Data(contentsOf: url)
    }
}
final class BundleToken {}

/// Reads from a configurable site root, e.g. https://example.pages.dev
struct RemoteDataService: DataService {
    let baseURL: URL
    var session: URLSession = .shared

    init?(baseURLString: String, session: URLSession = .shared) {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let u = URL(string: trimmed), let s = u.scheme?.lowercased(), s == "http" || s == "https", u.host != nil else { return nil }
        baseURL = u; self.session = session
    }

    func fetchData(path: String) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent(path), timeoutInterval: 20)
        req.cachePolicy = .reloadRevalidatingCacheData
        let (data, resp) = try await session.data(for: req)
        if let h = resp as? HTTPURLResponse, !(200..<300).contains(h.statusCode) { throw DataError.http(h.statusCode) }
        return data
    }
}

/// Simple file cache so days fetched once keep working offline.
struct FileCache: Sendable {
    let directory: URL

    init(directory: URL? = nil) {
        let base = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ContentCache", isDirectory: true)
        self.directory = base
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    private func file(_ path: String) -> URL {
        directory.appendingPathComponent(path.replacingOccurrences(of: "/", with: "__"))
    }
    func read(_ path: String) -> Data? { try? Data(contentsOf: file(path)) }
    func write(_ data: Data, path: String) { try? data.write(to: file(path), options: .atomic) }
}

/// Primary source first; every success is cached; on failure the cache, then the fallback, answer.
struct CachingDataService: DataService {
    let primary: any DataService
    let cache: FileCache
    let fallback: (any DataService)?

    func fetchData(path: String) async throws -> Data {
        // Day files do not change once published, so the cache can answer first.
        if Self.isDayFile(path), let hit = cache.read(path) { return hit }
        do {
            let data = try await primary.fetchData(path: path)
            cache.write(data, path: path)
            return data
        } catch {
            if let hit = cache.read(path) { return hit }
            if let fallback, let data = try? await fallback.fetchData(path: path) { return data }
            throw error
        }
    }

    static func isDayFile(_ path: String) -> Bool {
        let name = (path as NSString).lastPathComponent
        return path.hasPrefix("data/") && !path.contains("weekly/") && name != "index.json"
    }
}
