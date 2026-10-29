import Foundation

/// Launch-argument driven test harness (Debug builds only). Release builds ignore every argument.
///   -mockScenario <name>   serve content from Resources/Mock/scenario-<name>.json instead of the bundled day
///   -mockBaseURL <url>     preset the Base URL setting (e.g. an unreachable host)
///   -resetState            wipe the store, caches and settings first
///   -memoryStore           keep progress in memory only
///   -corruptStore          overwrite the on-disk store with garbage before opening it
struct LaunchConfig {
    var scenario: String?
    var baseURL: String?
    var reset = false
    var memoryStore = false
    var corruptStore = false

    static let current: LaunchConfig = {
        var c = LaunchConfig()
        #if DEBUG
        let a = CommandLine.arguments
        func value(_ flag: String) -> String? { a.firstIndex(of: flag).flatMap { $0 + 1 < a.count ? a[$0 + 1] : nil } }
        c.scenario = value("-mockScenario")
        c.baseURL = value("-mockBaseURL")
        c.reset = a.contains("-resetState")
        c.memoryStore = a.contains("-memoryStore")
        c.corruptStore = a.contains("-corruptStore")
        #endif
        return c
    }()

    var isActive: Bool { scenario != nil || baseURL != nil || reset || memoryStore || corruptStore }

    /// Applies destructive launch options before any store opens.
    func prepare() {
        guard isActive else { return }
        let fm = FileManager.default
        let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        if reset || corruptStore {
            if let files = try? fm.contentsOfDirectory(at: support, includingPropertiesForKeys: nil) {
                for f in files { try? fm.removeItem(at: f) }
            }
            if reset, let id = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: id) }
        }
        try? fm.createDirectory(at: support, withIntermediateDirectories: true)
        if corruptStore {
            try? Data("this is not a sqlite database".utf8).write(to: support.appendingPathComponent("default.store"))
        }
        if let baseURL { UserDefaults.standard.set(baseURL, forKey: "baseURL") }
    }
}

/// Serves scenario files shipped in the bundle: { "index": {...}, "days": {date: {...}}, "weekly": {week: {...}} }.
struct MockDataService: DataService {
    let scenario: String

    func fetchData(path: String) async throws -> Data {
        guard let url = Bundle(for: BundleToken.self).url(forResource: "scenario-\(scenario)", withExtension: "json"),
              let root = (try? JSONSerialization.jsonObject(with: Data(contentsOf: url))) as? [String: Any] else {
            throw DataError.notFound(path)
        }
        let name = ((path as NSString).lastPathComponent as NSString).deletingPathExtension
        let part: Any?
        if path.contains("weekly/") { part = (root["weekly"] as? [String: Any])?[name] }
        else if name == "index" { part = root["index"] }
        else { part = (root["days"] as? [String: Any])?[name] }
        guard let part else { throw DataError.notFound(path) }
        return try JSONSerialization.data(withJSONObject: part)
    }
}
