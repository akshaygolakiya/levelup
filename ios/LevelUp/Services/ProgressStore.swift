import Foundation
import SwiftData
import Observation

/// Per-item read state, scroll positions and day stats. Reads come from memory; writes go through to SwiftData.
@Observable @MainActor
final class ProgressStore {
    private let context: ModelContext
    private(set) var statuses: [String: ItemStatus] = [:]
    private(set) var scrolls: [String: Double] = [:]
    private(set) var anchors: [String: String] = [:]
    private(set) var dayStats: [String: DayStatValue] = [:]
    /// Lets the store recompute a day's stats after a change without owning content loading.
    @ObservationIgnored var dayProvider: (String) -> DayContent? = { _ in nil }

    init(context: ModelContext) {
        self.context = context
        load()
    }

    func reload() {
        statuses = [:]; scrolls = [:]; anchors = [:]; dayStats = [:]
        load()
        let dates = Set(((try? context.fetch(FetchDescriptor<ItemProgress>())) ?? []).map(\.date))
        for date in dates { recompute(date: date) }
    }

    private func load() {
        for p in (try? context.fetch(FetchDescriptor<ItemProgress>())) ?? [] {
            statuses[p.key] = ItemStatus(rawValue: p.status) ?? .unread
            scrolls[p.key] = p.scroll
            if let a = p.anchor { anchors[p.key] = a }
        }
        for s in (try? context.fetch(FetchDescriptor<DayStat>())) ?? [] {
            dayStats[s.date] = DayStatValue(coreTotal: s.coreTotal, coreDone: s.coreDone, techTotal: s.techTotal,
                                            techDone: s.techDone, englishTotal: s.englishTotal, englishDone: s.englishDone)
        }
    }

    func status(_ ref: ItemRef) -> ItemStatus { statuses[ref.key] ?? .unread }
    func scroll(_ ref: ItemRef) -> Double { scrolls[ref.key] ?? 0 }
    func anchor(_ ref: ItemRef) -> String? { anchors[ref.key] }

    private func record(for ref: ItemRef) -> ItemProgress {
        let key = ref.key
        var fd = FetchDescriptor<ItemProgress>(predicate: #Predicate { $0.key == key })
        fd.fetchLimit = 1
        if let r = try? context.fetch(fd).first { return r }
        let r = ItemProgress(key: key, date: ref.date, kind: ref.kind.rawValue, itemID: ref.itemID)
        context.insert(r)
        return r
    }

    func set(_ ref: ItemRef, _ status: ItemStatus) {
        let r = record(for: ref)
        r.status = status.rawValue; r.updatedAt = .now
        statuses[ref.key] = status
        try? context.save()
        recompute(date: ref.date)
    }

    /// Back to unread: clears status and remembered scroll position.
    func markUnread(_ ref: ItemRef) {
        let r = record(for: ref)
        r.scroll = 0; r.anchor = nil
        scrolls[ref.key] = nil; anchors[ref.key] = nil
        set(ref, .unread)
    }

    /// Opening an item moves it to in-progress, but never undoes done/skipped.
    func markOpened(_ ref: ItemRef) {
        if status(ref) == .unread { set(ref, .inProgress) }
    }

    func saveScroll(_ ref: ItemRef, fraction: Double, anchor: String?) {
        let r = record(for: ref)
        r.scroll = fraction; r.anchor = anchor; r.updatedAt = .now
        scrolls[ref.key] = fraction
        if let anchor { anchors[ref.key] = anchor }
        try? context.save()
    }

    func setUseful(_ ref: ItemRef, _ useful: Bool?) {
        let r = record(for: ref)
        r.useful = useful; r.updatedAt = .now
        try? context.save()
    }

    func useful(_ ref: ItemRef) -> Bool? {
        let key = ref.key
        var fd = FetchDescriptor<ItemProgress>(predicate: #Predicate { $0.key == key })
        fd.fetchLimit = 1
        return (try? context.fetch(fd).first)?.useful
    }

    func recompute(date: String) {
        guard let day = dayProvider(date) else { return }
        let value = Planner.counts(Planner.plan(day)) { statuses[$0.key] ?? .unread }
        dayStats[date] = value
        var fd = FetchDescriptor<DayStat>(predicate: #Predicate { $0.date == date })
        fd.fetchLimit = 1
        let row = (try? context.fetch(fd).first) ?? {
            let s = DayStat(date: date); context.insert(s); return s
        }()
        row.coreTotal = value.coreTotal; row.coreDone = value.coreDone
        row.techTotal = value.techTotal; row.techDone = value.techDone
        row.englishTotal = value.englishTotal; row.englishDone = value.englishDone
        try? context.save()
    }

    func stat(_ date: String) -> DayStatValue { dayStats[date] ?? DayStatValue() }

    func streak(today: String) -> Int {
        StreakCalculator.current(completed: Set(dayStats.filter { $0.value.isComplete }.keys), today: today)
    }
}
