import SwiftUI
import SwiftData

struct WordsView: View {
    var focus: ItemRef?
    @Environment(AppModel.self) private var app
    @Query(sort: \SavedWord.addedAt, order: .reverse) private var saved: [SavedWord]

    enum Mode: String, CaseIterable, Identifiable { case today = "Today", review = "Review", saved = "Saved"; var id: String { rawValue } }

    @State private var mode: Mode = .today
    @State private var deck: [WordCardData] = []
    @State private var flipped = false
    @State private var query = ""
    @State private var builtFor = ""

    private var date: String { focus?.date ?? app.selectedDate }
    private var dueCount: Int { saved.filter { $0.due <= .now }.count }

    var body: some View {
        VStack(spacing: DT.space4) {
            Picker("Mode", selection: $mode) {
                Text("Today").tag(Mode.today)
                Text("Review (\(dueCount))").tag(Mode.review)
                Text("Saved").tag(Mode.saved)
            }
            .pickerStyle(.segmented)

            switch mode {
            case .today, .review: practice
            case .saved: savedList
            }
        }
        .padding(DT.gutter)
        .frame(maxWidth: 620)
        .frame(maxWidth: .infinity)
        .navigationTitle("Words")
        .navigationBarTitleDisplayMode(.inline)
        .background(MeshBackground())
        .task(id: "\(date)|\(mode.rawValue)|\(app.repo.days[date] != nil)") { await rebuild() }
    }

    // MARK: practice

    @ViewBuilder
    private var practice: some View {
        if let card = deck.first {
            FlipCard(card: card, flipped: $flipped).id(card.id)
            if flipped { ratingBar(card) } else {
                Text("\(deck.count) left").font(.footnote).foregroundStyle(DT.textMuted)
            }
            Spacer(minLength: 0)
        } else {
            Spacer()
            EmptyStateView(symbol: mode == .review ? "checkmark.circle" : "textformat.abc",
                           title: mode == .review ? "Nothing to review" : "Today's words are done",
                           message: mode == .review
                           ? "Words you rate come back here when they are due."
                           : "Rated words join your review schedule. Select text in a reader to save more.")
            Spacer()
        }
    }

    private func ratingBar(_ card: WordCardData) -> some View {
        HStack(spacing: DT.space3) {
            rateButton("Again", .again, card, tint: DT.textMuted)
            rateButton("Good", .good, card, tint: DT.techInk)
            rateButton("Easy", .easy, card, tint: DT.success)
        }
    }

    private func rateButton(_ title: String, _ grade: ReviewGrade, _ card: WordCardData, tint: Color) -> some View {
        Button { rate(card, grade) } label: {
            VStack(spacing: 0) {
                Text(title).font(.headline)
                Text(interval(card, grade)).font(.caption2).opacity(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(SoftButtonStyle(tint: tint))
        .accessibilityLabel("\(title), next review \(interval(card, grade))")
    }

    private func interval(_ card: WordCardData, _ grade: ReviewGrade) -> String {
        let s = app.practice.savedWord(card.id).map { SRSState(ease: $0.ease, interval: $0.interval, reps: $0.reps, lapses: $0.lapses, due: $0.due) } ?? SRSState()
        let n = SM2.review(s, grade: grade)
        return grade == .again ? "10 min" : "\(n.interval) d"
    }

    private func rate(_ card: WordCardData, _ grade: ReviewGrade) {
        app.practice.review(card, grade: grade, origin: mode == .today ? "day" : "review")
        if mode == .today {
            app.progress.set(app.ref(date: date, kind: .word, itemID: card.id, title: card.word, minutes: 1), .done)
        }
        grade == .again ? Haptics.warn() : Haptics.success()
        withAnimation(DT.spring) {
            flipped = false
            if !deck.isEmpty { deck.removeFirst() }
        }
    }

    private func rebuild() async {
        flipped = false
        switch mode {
        case .today:
            if app.repo.days[date] == nil { _ = await app.repo.day(date) }
            let words = app.repo.days[date]?.english.words ?? []
            let startIdx = words.firstIndex { $0.id == focus?.itemID } ?? 0
            let rotated = Array(words[startIdx...] + words[..<startIdx])
            func settled(_ w: Word) -> Bool {
                app.progress.status(app.ref(date: date, kind: .word, itemID: w.id, title: w.word, minutes: 1)).isResolved
            }
            let open = rotated.filter { !settled($0) }
            deck = open.map { WordCardData($0) }
        case .review:
            deck = app.practice.dueWords().map(\.card)
        case .saved:
            break
        }
    }

    // MARK: saved

    private var filtered: [SavedWord] {
        query.isEmpty ? saved : saved.filter { $0.display.localizedCaseInsensitiveContains(query) || $0.meaning.localizedCaseInsensitiveContains(query) }
    }

    @ViewBuilder
    private var savedList: some View {
        if saved.isEmpty {
            Spacer()
            EmptyStateView(symbol: "bookmark", title: "No saved words yet",
                           message: "Rate today's words, or select a word in any article and choose Save word.")
            Spacer()
        } else {
            TextField("Search saved words", text: $query)
                .textFieldStyle(.plain).padding(DT.space3).frame(minHeight: DT.tapMin).glass(.card, radius: DT.radiusMd)
            ScrollView {
                LazyVStack(spacing: DT.space2) {
                    ForEach(filtered) { w in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(w.display).font(.headline).foregroundStyle(DT.text)
                                Text(w.meaning.isEmpty ? (w.context ?? "No definition yet") : w.meaning)
                                    .font(.subheadline).foregroundStyle(DT.textMuted).lineLimit(2)
                            }
                            Spacer()
                            Button { SpeechOutput.shared.speak(w.display) } label: {
                                Image(systemName: "speaker.wave.2").frame(width: DT.tapMin, height: DT.tapMin)
                            }
                            .accessibilityLabel("Pronounce \(w.display)")
                        }
                        .padding(.horizontal, DT.space4).padding(.vertical, DT.space2)
                        .glass(.card, radius: DT.radiusMd)
                        .accessibilityElement(children: .combine)
                        .contextMenu {
                            Button(role: .destructive) { app.practice.delete(w) } label: { Label("Delete", systemImage: "trash") }
                        }
                    }
                }
            }
        }
    }
}
