import Foundation
import Observation

/// Loads index, days and weekly summaries from the configured source, with cache and bundled fallback.
@Observable @MainActor
final class ContentRepository {
    private(set) var index = DayIndex()
    private(set) var days: [String: DayContent] = [:]
    private(set) var weeklies: [String: WeeklySummary] = [:]
    private(set) var isLoading = false
    private(set) var statusMessage: String?
    private(set) var usingRemote = false

    private var service: any DataService
    private let bundled = BundledDataService()
    private let cache: FileCache

    init(baseURL: String, cache: FileCache = FileCache()) {
        self.cache = cache
        self.service = BundledDataService()
        configure(baseURL: baseURL)
    }

    func configure(baseURL: String) {
        if let scenario = LaunchConfig.current.scenario, baseURL.isEmpty {
            service = MockDataService(scenario: scenario)   // test harness only
            usingRemote = false
        } else if let remote = RemoteDataService(baseURLString: baseURL) {
            service = CachingDataService(primary: remote, cache: cache, fallback: bundled)
            usingRemote = true
        } else {
            service = bundled
            usingRemote = false
        }
        days = [:]; weeklies = [:]
    }

    var dates: [String] { index.dates }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            index = try await service.fetchIndex()
            statusMessage = nil
        } catch {
            // Offline or misconfigured: fall back to the bundled index so the app still opens.
            if let idx = try? await bundled.fetchIndex() { index = idx }
            statusMessage = usingRemote ? "Offline. Showing saved days." : nil
        }
    }

    func day(_ date: String) async -> DayContent? {
        if let d = days[date] { return d }
        do {
            let d = try await service.fetchDay(date)
            days[date] = d
            return d
        } catch {
            if let d = try? await bundled.fetchDay(date) { days[date] = d; return d }
            statusMessage = "Could not load \(date)."
            return nil
        }
    }

    func weekly(_ ref: WeeklyRef) async -> WeeklySummary? {
        if let w = weeklies[ref.id] { return w }
        guard let w = try? await service.fetchWeekly(ref) else { return nil }
        weeklies[ref.id] = w
        return w
    }
}
