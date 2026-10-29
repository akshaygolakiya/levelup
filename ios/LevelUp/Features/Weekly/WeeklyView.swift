import SwiftUI

struct WeeklyView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space3) {
                let refs = app.repo.index.weeklies.sorted { $0.id > $1.id }
                if refs.isEmpty {
                    EmptyStateView(symbol: "calendar.badge.clock", title: "Your first weekly summary appears after the first Sunday",
                                   message: "It collects the week into one short revision sheet: takeaways, concepts, words, grammar and a quiz. Nothing to catch up on in the meantime.")
                } else {
                    ForEach(refs) { ref in
                        NavigationLink(value: ref) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ref.title ?? "Week \(ref.weekNumber)").font(.headline).foregroundStyle(DT.text)
                                    Text(WeeklyText.subtitle(ref)).font(.caption).foregroundStyle(DT.textMuted)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(DT.textFaint)
                            }
                            .padding(DT.space4).frame(minHeight: DT.tapMin)
                            .glass(.card, radius: DT.radiusLg)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(DT.gutter)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await app.repo.refresh() }
        .background(MeshBackground())
        .navigationTitle("Weekly")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: WeeklyRef.self) { WeeklyDetailView(ref: $0) }
    }
}

struct WeeklyDetailView: View {
    let ref: WeeklyRef
    @Environment(AppModel.self) private var app
    @State private var summary: WeeklySummary?
    @State private var failed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space4) {
                if let s = summary {
                    if s.isEmpty {
                        EmptyStateView(symbol: "tray", title: "Nothing in this week yet", message: "The summary file has no sections.")
                    } else { content(s) }
                } else if failed {
                    EmptyStateView(symbol: "wifi.slash", title: "Could not load this week",
                                   message: "It will be available offline once it has loaded once.")
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(DT.space6)
                }
            }
            .padding(DT.gutter)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle(ref.title ?? "Week \(ref.weekNumber)")
        .navigationBarTitleDisplayMode(.inline)
        .background(MeshBackground())
        .task {
            if let s = await app.repo.weekly(ref) { summary = s } else { failed = true }
        }
    }

    @ViewBuilder
    private func content(_ s: WeeklySummary) -> some View {
        if let r = WeeklyText.range(s.from ?? ref.from, s.to ?? ref.to) { Text(r).font(.subheadline).foregroundStyle(DT.textMuted) }
        group("Takeaways: Engineering", "lightbulb", s.engineering, track: .tech, linked: true)
        group("Takeaways: AI", "sparkles", s.ai, track: .tech, linked: true)
        group("Concepts recap", "square.stack.3d.up", s.concepts, track: .tech)
        group("Must remember", "number", s.mustRemember, track: .tech, linked: true)
        group("Words this week", "textformat.abc", s.words, track: .english)
        group("Grammar rules", "text.badge.checkmark", s.grammar, track: .english)
        if !s.quiz.isEmpty { quizBlock(s.quiz) }
    }

    @ViewBuilder
    private func group(_ title: String, _ symbol: String, _ items: [WeeklyEntry], track: Track, linked: Bool = false) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: DT.space3) {
                Label(title, systemImage: symbol).font(.headline).foregroundStyle(DT.ink(track))
                    .accessibilityAddTraits(.isHeader)
                ForEach(items) { e in
                    VStack(alignment: .leading, spacing: 4) {
                        if !linked, let t = e.title {
                            HStack(spacing: DT.space2) {
                                Text(t).font(.subheadline.weight(.semibold)).foregroundStyle(DT.text)
                                if let pos = e.pos { Text(pos).font(.caption).foregroundStyle(DT.textMuted) }
                                if let level = e.level { Chip(text: level, track: .english) }
                            }
                        }
                        if !e.text.isEmpty { Text(e.text).font(.body).foregroundStyle(DT.readingText) }
                        if linked, let t = e.title { Text("From: \(t)").font(.caption).foregroundStyle(DT.textMuted) }
                        if let u = e.linkURL { ReadFullArticleButton(url: u.absoluteString, track: track, compact: true) }
                    }
                    if e.id != items.last?.id { Divider() }
                }
            }
            .padding(DT.space4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glass(.reading, radius: DT.radiusLg)
        }
    }

    private func quizBlock(_ quiz: [WeeklyQuizItem]) -> some View {
        VStack(alignment: .leading, spacing: DT.space3) {
            Label("Quiz", systemImage: "questionmark.circle").font(.headline).foregroundStyle(DT.techInk)
            Text("Tap to reveal each answer.").font(.footnote).foregroundStyle(DT.textMuted)
            ForEach(quiz) { q in QuizRow(item: q) }
        }
        .padding(DT.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(.reading, radius: DT.radiusLg)
    }
}

enum WeeklyText {
    static func range(_ from: String?, _ to: String?) -> String? {
        let f = [from, to].compactMap { $0 }.compactMap(DateText.date(fromKey:)).map { $0.formatted(.dateTime.day().month(.abbreviated)) }
        return f.isEmpty ? nil : f.joined(separator: " to ")
    }
    static func subtitle(_ r: WeeklyRef) -> String {
        [range(r.from, r.to), r.dayCount.map { "\($0) \($0 == 1 ? "day" : "days")" }].compactMap { $0 }.joined(separator: "  ·  ")
    }
}

private struct QuizRow: View {
    let item: WeeklyQuizItem
    @State private var revealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: DT.space2) {
            Text(item.question).font(.body.weight(.semibold)).foregroundStyle(DT.text)
            if revealed {
                Text(item.answer.isEmpty ? "Say it out loud, then check your notes." : item.answer)
                    .font(.body).foregroundStyle(DT.success)
                    .transition(.opacity)
                if let src = item.source { Text("From: \(src)").font(.caption).foregroundStyle(DT.textMuted) }
                if let u = item.linkURL { ReadFullArticleButton(url: u.absoluteString, compact: true) }
            }
            Button(revealed ? "Hide answer" : "Reveal answer") {
                withAnimation(DT.spring) { revealed.toggle() }
            }
            .buttonStyle(SoftButtonStyle())
        }
        .accessibilityElement(children: .contain)
    }
}
