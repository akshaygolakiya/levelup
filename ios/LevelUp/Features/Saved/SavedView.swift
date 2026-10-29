import SwiftUI
import SwiftData

/// Everything kept from the card stacks, across all days, newest day first.
struct SavedView: View {
    @Environment(AppModel.self) private var app
    @Query(filter: #Predicate<ItemProgress> { $0.status == 4 }, sort: \ItemProgress.updatedAt, order: .reverse)
    private var kept: [ItemProgress]

    private struct Entry: Identifiable {
        var id: String { ref.key }
        var article: Article
        var ref: ItemRef
        var at: Date
    }

    @State private var loadedDays = 0

    private var days: [(date: String, entries: [Entry])] {
        var byDay: [String: [Entry]] = [:]
        for p in kept {
            guard let day = app.repo.days[p.date], let ref = Planner.plan(day).all.first(where: { $0.key == p.key }),
                  let a = (day.tech.quickReads + day.tech.aiNews + day.tech.deepReads).first(where: { $0.id == ref.itemID }) else { continue }
            byDay[p.date, default: []].append(Entry(article: a, ref: ref, at: p.updatedAt))
        }
        return byDay.keys.sorted(by: >).map { ($0, byDay[$0] ?? []) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space4) {
                let days = days
                if days.isEmpty {
                    EmptyStateView(symbol: "bookmark", title: "Nothing saved yet",
                                   message: "Swipe right on a card, or tap Keep, and it will live here.")
                }
                ForEach(days, id: \.date) { d in
                    VStack(alignment: .leading, spacing: DT.space2) {
                        Text(heading(d.date)).font(.headline).foregroundStyle(DT.text).accessibilityAddTraits(.isHeader)
                        ForEach(d.entries) { e in row(e) }
                    }
                }
            }
            .padding(DT.gutter)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .background(MeshBackground())
        .navigationTitle("Saved")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: kept.map(\.key).joined()) {
            for date in Set(kept.map(\.date)) where app.repo.days[date] == nil { _ = await app.repo.day(date) }
            loadedDays += 1
        }
    }

    private func heading(_ date: String) -> String {
        guard let d = DateText.date(fromKey: date) else { return date }
        return d.formatted(.dateTime.weekday(.wide).day().month(.abbreviated))
    }

    private func row(_ e: Entry) -> some View {
        VStack(alignment: .leading, spacing: DT.space2) {
            Text(e.ref.kind.label.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(DT.techInk)
            Text(e.article.title).font(.headline).foregroundStyle(DT.readingText)
            SourceLine(source: e.article.source, publishedAt: e.article.publishedAt, minutes: e.article.minutes, capped: e.article.capped)
            HStack {
                ReadFullArticleButton(url: e.article.url, track: .tech, compact: true)
                Button("Remove") {
                    app.progress.markUnread(e.ref)
                    Haptics.tap()
                }
                .buttonStyle(SoftButtonStyle(tint: DT.textMuted))
                .accessibilityLabel("Remove \(e.article.title) from Saved")
            }
        }
        .padding(DT.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(.reading, radius: DT.radiusLg)
        .accessibilityElement(children: .contain)
    }
}
