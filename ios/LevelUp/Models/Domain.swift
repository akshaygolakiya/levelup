import Foundation

// Pure logic (no UI, no storage) so it can be unit tested.

enum ItemKind: String, Codable, Sendable, CaseIterable {
    case deep, quick, ai, paper, concept, word, grammar, speaking

    var track: Track {
        switch self {
        case .deep, .quick, .ai, .paper, .concept: .tech
        case .word, .grammar, .speaking: .english
        }
    }
    var symbol: String {
        switch self {
        case .deep: "doc.text"
        case .quick: "bolt"
        case .ai: "sparkles"
        case .paper: "doc.richtext"
        case .concept: "square.stack.3d.up"
        case .word: "textformat.abc"
        case .grammar: "text.badge.checkmark"
        case .speaking: "mic"
        }
    }
    var label: String {
        switch self {
        case .deep: "Deep read"
        case .quick: "Quick read"
        case .ai: "AI news"
        case .paper: "Paper"
        case .concept: "Concept"
        case .word: "Word"
        case .grammar: "Grammar"
        case .speaking: "Speaking"
        }
    }
}

enum Track: String, Sendable { case tech, english }

struct ItemRef: Hashable, Identifiable, Sendable {
    var date: String
    var kind: ItemKind
    /// Id used to find the item inside the day's content.
    var itemID: String
    var title: String
    var minutes: Int
    var isCore: Bool
    var capped = false
    /// Key in stored progress. Matches the web app's item ids so progress can move between the two.
    var key: String
    var id: String { key }
    var track: Track { kind.track }

    init(date: String, kind: ItemKind, itemID: String, title: String, minutes: Int, isCore: Bool,
         capped: Bool = false, key: String? = nil) {
        self.date = date; self.kind = kind; self.itemID = itemID; self.title = title
        self.minutes = minutes; self.isCore = isCore; self.capped = capped
        self.key = key ?? "\(date)|\(kind.rawValue)|\(itemID)"
    }

    var minutesLabel: String { capped ? "20+ min" : "\(minutes) min" }
}

enum Timebox: String, CaseIterable, Identifiable, Sendable {
    case quick, standard, deep
    var id: String { rawValue }
    var minutes: Int {
        switch self {
        case .quick: 15
        case .standard: 45
        case .deep: 120
        }
    }
    var label: String {
        switch self {
        case .quick: "Quick 15"
        case .standard: "Standard 45"
        case .deep: "Deep 2h"
        }
    }
}

struct DayPlan: Sendable {
    var core: [ItemRef] = []
    var more: [ItemRef] = []
    var all: [ItemRef] { core + more }
    var techCore: [ItemRef] { core.filter { $0.track == .tech } }
    var englishCore: [ItemRef] { core.filter { $0.track == .english } }
}

enum Planner {
    static let coreQuick = 3, coreWords = 5

    /// Light core: 1 deep read, 3 quick reads, 1 AI item, the concept, 5 words, the grammar lesson, 1 speaking prompt.
    static func plan(_ day: DayContent) -> DayPlan {
        var plan = DayPlan()
        func add(_ kind: ItemKind, _ id: String, _ key: String, _ title: String, _ minutes: Int, core: Bool, capped: Bool = false) {
            let ref = ItemRef(date: day.date, kind: kind, itemID: id, title: title, minutes: minutes, isCore: core, capped: capped, key: key)
            if core { plan.core.append(ref) } else { plan.more.append(ref) }
        }
        func articleKey(_ a: Article, _ tag: String, _ i: Int) -> String { a.hasExplicitID ? a.id : "\(day.date):\(tag):\(i)" }
        for (i, a) in day.tech.deepReads.enumerated() { add(.deep, a.id, articleKey(a, "deep", i), a.title, a.minutes, core: i < 1) }
        for (i, a) in day.tech.quickReads.enumerated() { add(.quick, a.id, articleKey(a, "quick", i), a.title, a.minutes, core: i < coreQuick, capped: a.capped) }
        for (i, a) in day.tech.aiNews.enumerated() { add(.ai, a.id, articleKey(a, "ai", i), a.title, a.minutes, core: i < 1, capped: a.capped) }
        for (i, c) in day.tech.concepts.enumerated() { add(.concept, c.id, c.hasExplicitID ? c.id : "\(day.date):concept:\(i)", c.title, c.minutes, core: i < 1) }
        for (i, a) in day.tech.papers.enumerated() { add(.paper, a.id, articleKey(a, "paper", i), a.title, max(a.minutes, 10), core: false) }
        for (i, w) in day.english.words.enumerated() { add(.word, w.id, "\(day.date):w:\(w.id)", w.word, 1, core: i < coreWords) }
        for (i, g) in day.english.grammar.enumerated() { add(.grammar, g.id, "\(day.date):grammar:\(i)", g.topic, g.minutes, core: i < 1) }
        for (i, s) in day.english.speaking.enumerated() { add(.speaking, s.id, "\(day.date):speak:\(i)", s.prompt, 3, core: i < 1) }
        return plan
    }

    /// Finds the planned reference for an item, so views use the same stored key as the Today list.
    static func ref(in day: DayContent?, kind: ItemKind, itemID: String) -> ItemRef? {
        guard let day else { return nil }
        return plan(day).all.first { $0.kind == kind && $0.itemID == itemID }
    }

    /// Splits into "your plan" (fits the time box) and "more for today". Nothing is hidden.
    static func split(_ plan: DayPlan, box: Timebox) -> (today: [ItemRef], more: [ItemRef]) {
        let quickOrder: [ItemKind] = [.word, .speaking, .grammar, .quick, .ai, .concept, .deep]
        let core: [ItemRef]
        if box == .quick {
            core = plan.core.sorted { (quickOrder.firstIndex(of: $0.kind) ?? 9) < (quickOrder.firstIndex(of: $1.kind) ?? 9) }
        } else {
            core = plan.core
        }
        var today: [ItemRef] = [], rest: [ItemRef] = []
        var used = 0
        for ref in core {
            if box == .quick, used >= box.minutes, !today.isEmpty { rest.append(ref); continue }
            today.append(ref); used += ref.minutes
        }
        let extras = box == .deep ? plan.more : plan.more.sorted { $0.minutes < $1.minutes }
        for ref in extras {
            if box != .quick, used + ref.minutes <= box.minutes { today.append(ref); used += ref.minutes } else { rest.append(ref) }
        }
        return (today, rest)
    }

    static func counts(_ plan: DayPlan, status: (ItemRef) -> ItemStatus) -> DayStatValue {
        func done(_ items: [ItemRef]) -> Int { items.filter { status($0).isResolved }.count }
        return DayStatValue(coreTotal: plan.core.count, coreDone: done(plan.core),
                            techTotal: plan.techCore.count, techDone: done(plan.techCore),
                            englishTotal: plan.englishCore.count, englishDone: done(plan.englishCore))
    }
}

struct DayStatValue: Equatable, Sendable {
    var coreTotal = 0, coreDone = 0, techTotal = 0, techDone = 0, englishTotal = 0, englishDone = 0
    /// Streak rule: a day counts once at least 70% of its light-core items are kept or done
    /// (coreDone counts only done + kept; skipped items do not count). The number needed is
    /// ceil(0.7 * coreTotal), done in integers to avoid float error: (7n + 9) / 10.
    /// 10 core items: 7 passes, 6 fails. 13 core items: 10 needed.
    static func required(forCore n: Int) -> Int { (7 * n + 9) / 10 }
    var isComplete: Bool { coreTotal > 0 && coreDone >= Self.required(forCore: coreTotal) }
    var techProgress: Double { techTotal == 0 ? 0 : Double(techDone) / Double(techTotal) }
    var englishProgress: Double { englishTotal == 0 ? 0 : Double(englishDone) / Double(englishTotal) }
}

enum StreakCalculator {
    /// Consecutive completed days ending today; if today is not complete yet, ending yesterday
    /// (an unfinished today never breaks the streak).
    static func current(completed: Set<String>, today: String) -> Int {
        guard let todayDate = DateText.date(fromKey: today) else { return 0 }
        let cal = Calendar(identifier: .gregorian)
        var day = todayDate
        if !completed.contains(today), let y = cal.date(byAdding: .day, value: -1, to: day) { day = y }
        var n = 0
        while completed.contains(DateText.dayKey(day)) {
            n += 1
            guard let prev = cal.date(byAdding: .day, value: -1, to: day) else { break }
            day = prev
        }
        return n
    }
}

// MARK: Spaced repetition (SM-2 style)

enum ReviewGrade: Sendable { case again, good, easy }

struct SRSState: Equatable, Sendable {
    var ease = 2.5
    var interval = 0   // days
    var reps = 0
    var lapses = 0
    var due = Date()
}

enum SM2 {
    static func review(_ s: SRSState, grade: ReviewGrade, now: Date = .now) -> SRSState {
        var n = s
        switch grade {
        case .again:
            n.reps = 0; n.lapses += 1; n.interval = 0
            n.ease = max(1.3, s.ease - 0.2)
            n.due = now.addingTimeInterval(10 * 60)
            return n
        case .good:
            n.reps = s.reps + 1
            n.interval = n.reps == 1 ? 1 : n.reps == 2 ? 3 : max(s.interval + 1, Int((Double(s.interval) * s.ease).rounded()))
        case .easy:
            n.reps = s.reps + 1
            n.ease = s.ease + 0.15
            n.interval = n.reps == 1 ? 4 : max(s.interval + 2, Int((Double(s.interval) * s.ease * 1.3).rounded()))
        }
        n.due = Calendar.current.date(byAdding: .day, value: n.interval, to: now) ?? now
        return n
    }
}

struct WordCardData: Hashable, Identifiable, Sendable {
    var id: String
    var word: String
    var pos: String?
    var ipa: String?
    var meaning: String
    var examples: [String] = []
    var synonyms: [String] = []
    var commonMistake: String?
    var etymology: String?
    var workSentence: String?
    var context: String?
    var level: String?

    init(id: String, word: String, pos: String? = nil, ipa: String? = nil, meaning: String, examples: [String] = [],
         synonyms: [String] = [], commonMistake: String? = nil, etymology: String? = nil,
         workSentence: String? = nil, context: String? = nil, level: String? = nil) {
        self.id = id; self.word = word; self.pos = pos; self.ipa = ipa; self.meaning = meaning
        self.examples = examples; self.synonyms = synonyms; self.commonMistake = commonMistake
        self.etymology = etymology; self.workSentence = workSentence; self.context = context; self.level = level
    }

    init(_ w: Word) {
        self.init(id: w.id, word: w.word, pos: w.pos, ipa: w.ipa, meaning: w.meaning, examples: w.examples,
                  synonyms: w.synonyms, commonMistake: w.commonMistake, etymology: w.etymology, workSentence: w.workSentence,
                  level: w.level)
    }
}

// MARK: Grammar answer checking

enum AnswerChecker {
    /// Lenient comparison: case, punctuation, slashes and extra spaces are ignored.
    static func matches(_ input: String, _ answer: String) -> Bool {
        let a = normalize(input)
        return !a.isEmpty && a == normalize(answer)
    }

    static func normalize(_ s: String) -> String {
        let folded = s.replacingOccurrences(of: "’", with: "'").lowercased()
        let kept = folded.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || $0 == "'" ? Character($0) : " " }
        return String(kept).split(separator: " ").joined(separator: " ")
    }
}
