import Foundation
import SwiftData
import Observation

/// Saved words with spaced repetition, writing entries, speaking sessions and grammar mistakes.
@Observable @MainActor
final class PracticeStore {
    let context: ModelContext
    /// Bumped on every change so views that don't use @Query can refresh.
    private(set) var revision = 0

    init(context: ModelContext) { self.context = context }

    private func changed() { try? context.save(); revision += 1 }

    func savedWord(_ id: String) -> SavedWord? {
        var fd = FetchDescriptor<SavedWord>(predicate: #Predicate { $0.word == id })
        fd.fetchLimit = 1
        return try? context.fetch(fd).first
    }

    @discardableResult
    func save(_ card: WordCardData, origin: String, context sentence: String? = nil) -> SavedWord {
        if let existing = savedWord(card.id) { return existing }
        let w = SavedWord(card: card, origin: origin, context: sentence)
        context.insert(w)
        changed()
        return w
    }

    /// Applies an SM-2 grade; saves the word first if needed.
    func review(_ card: WordCardData, grade: ReviewGrade, origin: String = "day") {
        let w = savedWord(card.id) ?? save(card, origin: origin)
        let next = SM2.review(SRSState(ease: w.ease, interval: w.interval, reps: w.reps, lapses: w.lapses, due: w.due), grade: grade)
        w.ease = next.ease; w.interval = next.interval; w.reps = next.reps; w.lapses = next.lapses
        w.due = next.due; w.reviewed = true
        changed()
    }

    func dueWords(now: Date = .now) -> [SavedWord] {
        let fd = FetchDescriptor<SavedWord>(sortBy: [SortDescriptor(\.due)])
        return ((try? context.fetch(fd)) ?? []).filter { $0.due <= now }
    }

    func delete(_ w: SavedWord) { context.delete(w); changed() }

    func addWriting(date: String, prompt: String, text: String) {
        context.insert(WritingEntry(date: date, prompt: prompt, text: text))
        changed()
    }

    func addSession(date: String, prompt: String, mode: String, transcript: String, stats: SpeechStats, audioFile: String?) {
        context.insert(SpeakingSession(date: date, prompt: prompt, mode: mode, transcript: transcript, stats: stats, audioFile: audioFile))
        changed()
    }

    func addMistake(date: String, topic: String, prompt: String, given: String, expected: String) {
        context.insert(GrammarMistake(date: date, topic: topic, prompt: prompt, given: given, expected: expected))
        changed()
    }
}
