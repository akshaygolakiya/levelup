import SwiftUI
import SwiftData

enum AppTab: Hashable { case today, words, speaking, saved, weekly }

/// Composition root: owns the services and the state shared across tabs.
@Observable @MainActor
final class AppModel {
    let prefs: Preferences
    let repo: ContentRepository
    let progress: ProgressStore
    let practice: PracticeStore
    let recorder = SpeechRecorder()

    var tab: AppTab = .today
    var selectedDate: String = ""
    var showSettings = false

    init(container: ModelContainer, prefs: Preferences? = nil) {
        let prefs = prefs ?? Preferences()
        self.prefs = prefs
        repo = ContentRepository(baseURL: prefs.baseURL)
        progress = ProgressStore(context: container.mainContext)
        practice = PracticeStore(context: container.mainContext)
        let repo = repo
        progress.dayProvider = { repo.days[$0] }
    }

    static var todayKey: String { DateText.dayKey(Date()) }

    /// Loads the index, then opens the newest day that is not in the future.
    func start() async {
        await repo.refresh()
        let dates = repo.dates
        if selectedDate.isEmpty || !dates.contains(selectedDate) {
            selectedDate = dates.first(where: { $0 <= Self.todayKey }) ?? dates.first ?? Self.todayKey
        }
        if let day = await repo.day(selectedDate) { progress.recompute(date: day.date) }
    }

    func applyBaseURL() async {
        repo.configure(baseURL: prefs.baseURL)
        await start()
    }

    func open(date: String) {
        selectedDate = date
        tab = .today
    }

    /// Same stored key the Today list uses for this item.
    func ref(date: String, kind: ItemKind, itemID: String, title: String, minutes: Int = 3) -> ItemRef {
        Planner.ref(in: repo.days[date], kind: kind, itemID: itemID)
            ?? ItemRef(date: date, kind: kind, itemID: itemID, title: title, minutes: minutes, isCore: false)
    }

    var streak: Int { progress.streak(today: Self.todayKey) }
}
