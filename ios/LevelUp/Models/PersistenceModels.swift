import Foundation
import SwiftData

enum ItemStatus: Int, Sendable {
    case unread = 0, inProgress = 1, done = 2, skipped = 3, kept = 4

    /// Finished = done or kept. This is what rings, streak and Catch up use.
    var isResolved: Bool { self == .done || self == .kept }
    var isSkipped: Bool { self == .skipped }
    /// Still open: neither finished nor deliberately skipped.
    var isPending: Bool { !isResolved && !isSkipped }

    /// Same names as the web app's state ("prog" for in progress).
    var exportName: String {
        switch self {
        case .unread: "new"
        case .inProgress: "prog"
        case .done: "done"
        case .skipped: "skipped"
        case .kept: "kept"
        }
    }
    init(exportName: String) {
        switch exportName {
        case "prog", "inProgress": self = .inProgress
        case "done": self = .done
        case "skipped": self = .skipped
        case "kept": self = .kept
        default: self = .unread
        }
    }
}

@Model final class ItemProgress {
    @Attribute(.unique) var key: String
    var date: String
    var kind: String
    var itemID: String
    var status: Int
    var scroll: Double
    var anchor: String?
    var useful: Bool?
    var updatedAt: Date

    init(key: String, date: String, kind: String, itemID: String, status: Int = 0, scroll: Double = 0, anchor: String? = nil) {
        self.key = key; self.date = date; self.kind = kind; self.itemID = itemID
        self.status = status; self.scroll = scroll; self.anchor = anchor; self.updatedAt = .now
    }
}

/// Per-day light-core completion, kept so the streak never needs to reload old days.
@Model final class DayStat {
    @Attribute(.unique) var date: String
    var coreTotal: Int
    var coreDone: Int
    var techTotal: Int
    var techDone: Int
    var englishTotal: Int
    var englishDone: Int

    init(date: String) {
        self.date = date; coreTotal = 0; coreDone = 0; techTotal = 0; techDone = 0; englishTotal = 0; englishDone = 0
    }
}

@Model final class SavedWord {
    @Attribute(.unique) var word: String   // lowercased
    var display: String
    var pos: String?
    var ipa: String?
    var meaning: String
    var examples: [String]
    var synonyms: [String]
    var commonMistake: String?
    var etymology: String?
    var workSentence: String?
    var context: String?       // sentence it was saved from
    var origin: String         // "day" or "reader"
    var addedAt: Date
    // SM-2 state
    var ease: Double
    var interval: Int          // days
    var reps: Int
    var lapses: Int
    var due: Date
    var reviewed: Bool
    var updatedAt: Date?

    init(card: WordCardData, origin: String, context: String? = nil) {
        word = card.id; display = card.word; pos = card.pos; ipa = card.ipa; meaning = card.meaning
        examples = card.examples; synonyms = card.synonyms; commonMistake = card.commonMistake
        etymology = card.etymology; workSentence = card.workSentence
        self.context = context; self.origin = origin; addedAt = .now
        ease = 2.5; interval = 0; reps = 0; lapses = 0; due = .now; reviewed = false
    }

    var card: WordCardData {
        WordCardData(id: word, word: display, pos: pos, ipa: ipa, meaning: meaning, examples: examples,
                     synonyms: synonyms, commonMistake: commonMistake, etymology: etymology, workSentence: workSentence,
                     context: context)
    }
}

@Model final class WritingEntry {
    @Attribute(.unique) var id: UUID
    var date: String
    var prompt: String
    var text: String
    var createdAt: Date
    init(date: String, prompt: String, text: String) {
        id = UUID(); self.date = date; self.prompt = prompt; self.text = text; createdAt = .now
    }
}

@Model final class SpeakingSession {
    @Attribute(.unique) var id: UUID
    var date: String
    var prompt: String
    var mode: String   // speak | shadow
    var transcript: String
    var duration: Double
    var wordCount: Int
    var wpm: Int
    var fillerCount: Int
    var audioFile: String?
    var createdAt: Date
    init(date: String, prompt: String, mode: String, transcript: String, stats: SpeechStats, audioFile: String?) {
        id = UUID(); self.date = date; self.prompt = prompt; self.mode = mode; self.transcript = transcript
        duration = stats.duration; wordCount = stats.wordCount; wpm = stats.wpm; fillerCount = stats.fillerCount
        self.audioFile = audioFile; createdAt = .now
    }
}

@Model final class GrammarMistake {
    @Attribute(.unique) var id: UUID
    var date: String
    var topic: String
    var prompt: String
    var given: String
    var expected: String
    var createdAt: Date
    init(date: String, topic: String, prompt: String, given: String, expected: String) {
        id = UUID(); self.date = date; self.topic = topic; self.prompt = prompt; self.given = given
        self.expected = expected; createdAt = .now
    }
}

enum AppSchema {
    static let types: [any PersistentModel.Type] = [
        ItemProgress.self, DayStat.self, SavedWord.self, WritingEntry.self, SpeakingSession.self, GrammarMistake.self
    ]

    static func makeContainer(inMemory: Bool = false) -> ModelContainer {
        let inMemory = inMemory || LaunchConfig.current.memoryStore
        // A fresh install has no Application Support folder yet; create it so the store can open.
        if let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        let schema = Schema(types)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory)
        if let c = try? ModelContainer(for: schema, configurations: config) { return c }
        // A broken store must never stop the app from opening; fall back to memory.
        let mem = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try! ModelContainer(for: schema, configurations: mem)
    }
}
