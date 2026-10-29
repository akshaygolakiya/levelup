import SwiftUI

/// Routes an item reference to its screen.
struct ItemDestination: View {
    @Environment(AppModel.self) private var app
    var ref: ItemRef

    var body: some View {
        Group {
            if let day = app.repo.days[ref.date] {
                destination(day)
            } else {
                ProgressView().task { _ = await app.repo.day(ref.date) }
            }
        }
        .background(MeshBackground())
    }

    @ViewBuilder
    private func destination(_ day: DayContent) -> some View {
        switch ref.kind {
        case .deep, .paper:
            let list = ref.kind == .deep ? day.tech.deepReads : day.tech.papers
            if let a = list.first(where: { $0.id == ref.itemID }) {
                ReaderView(doc: ReaderDoc(article: a, ref: ref))
            } else { missing }
        case .concept:
            if let c = day.tech.concepts.first(where: { $0.id == ref.itemID }) {
                ReaderView(doc: ReaderDoc(concept: c, ref: ref))
            } else { missing }
        case .quick:
            CardStackView(date: day.date, kind: .quick, articles: day.tech.quickReads, startID: ref.itemID)
        case .ai:
            CardStackView(date: day.date, kind: .ai, articles: day.tech.aiNews, startID: ref.itemID)
        case .word:
            WordsView(focus: ref)
        case .grammar:
            if let g = day.english.grammar.first(where: { $0.id == ref.itemID }) {
                GrammarView(lesson: g, ref: ref)
            } else { missing }
        case .speaking:
            SpeakingView(date: ref.date, focusID: ref.itemID)
        }
    }

    private var missing: some View {
        EmptyStateView(symbol: "questionmark.folder", title: "Item not found", message: "It may have been removed from this day.")
            .padding(DT.gutter)
    }
}
