import SwiftUI

/// Swipeable stack for quick reads and AI news. Right = done, left = skip. Buttons and VoiceOver actions do the same.
struct CardStackView: View {
    let date: String
    let kind: ItemKind
    let articles: [Article]
    let startID: String

    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var deck: [Article] = []
    @State private var drag: CGSize = .zero
    @State private var expanded: Article?
    @State private var built = false
    @State private var history: [Article] = []
    @Environment(\.dynamicTypeSize) private var dynamicType
    @State private var note: String?
    @Namespace private var ns

    private let threshold: CGFloat = 110
    private var track: Track { .tech }

    var body: some View {
        VStack(spacing: DT.space4) {
            if built && deck.isEmpty {
                finished
            } else {
                stack
                if expanded == nil { actionBar }
                if let note { Text(note).font(.footnote).foregroundStyle(DT.textMuted).transition(.opacity) }
            }
        }
        .padding(DT.gutter)
        .frame(maxWidth: 620)
        .frame(maxWidth: .infinity)
        .navigationTitle(kind == .ai ? "AI news" : "Quick reads")
        .navigationBarTitleDisplayMode(.inline)
        .background(MeshBackground())
        .onAppear(perform: build)
    }

    // MARK: stack

    private var stack: some View {
        ZStack {
            if let ex = expanded {
                ScrollView {
                    VStack(spacing: DT.space3) {
                    CardFace(article: ex, kind: kind, expanded: true)
                        .overlay(alignment: .topTrailing) {
                            Button { collapse() } label: {
                                Image(systemName: "xmark.circle.fill").font(.title2).foregroundStyle(DT.textMuted)
                                    .frame(width: DT.tapMin, height: DT.tapMin)
                            }
                            .accessibilityLabel("Close")
                        }
                        .matchedGeometryEffect(id: ex.id, in: ns)
                    HStack {
                        Button { collapse(); settle(ex, .skipped) } label: { Label("Skip", systemImage: "xmark").frame(maxWidth: .infinity) }
                            .buttonStyle(SoftButtonStyle(tint: DT.textMuted))
                        Button { collapse(); settle(ex, .kept) } label: { Label("Keep", systemImage: "bookmark").frame(maxWidth: .infinity) }
                            .buttonStyle(AccentButtonStyle(accent: DT.success))
                    }
                    Button("Mark as unread") {
                        app.progress.markUnread(ref(ex))
                        if !deck.contains(where: { $0.id == ex.id }) { deck.insert(ex, at: 0) }
                        collapse(); flash("Marked as unread")
                    }
                    .buttonStyle(SoftButtonStyle())
                    }
                }
            } else {
                ForEach(Array(deck.prefix(3).enumerated().reversed()), id: \.element.id) { i, a in
                    let isTop = i == 0
                    CardFace(article: a, kind: kind, expanded: false)
                        .matchedGeometryEffect(id: a.id, in: ns)
                        .scaleEffect(1 - CGFloat(i) * 0.05)
                        .offset(y: CGFloat(i) * 12)
                        .offset(x: isTop ? drag.width : 0, y: isTop ? drag.height * 0.15 : 0)
                        .rotationEffect(.degrees(isTop && !reduceMotion ? Double(drag.width) / 22 : 0))
                        .overlay(alignment: .top) { if isTop { stamp } }
                        .allowsHitTesting(isTop)
                        .gesture(dragGesture(a), including: isTop ? .all : .none)
                        .onTapGesture { if isTop { expand(a) } }
                        .accessibilityElement(children: .contain)
                        .accessibilityHidden(!isTop)
                        .accessibilityAction(named: "Keep") { settle(a, .kept) }
                        .accessibilityAction(named: "Skip") { settle(a, .skipped) }
                        .accessibilityAction(named: "Expand") { expand(a) }
                }
            }
        }
        .frame(maxHeight: .infinity)
    }

    private var stamp: some View {
        ZStack {
            Label("Keep", systemImage: "bookmark.circle.fill").foregroundStyle(DT.success)
                .opacity(max(0, Double(drag.width) / threshold))
            Label("Skip", systemImage: "arrow.uturn.left.circle.fill").foregroundStyle(DT.textMuted)
                .opacity(max(0, Double(-drag.width) / threshold))
        }
        .font(.title3.weight(.bold))
        .padding(.top, DT.space5)
        .allowsHitTesting(false)
    }

    private func dragGesture(_ a: Article) -> some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { drag = $0.translation }
            .onEnded { v in
                if v.translation.width > threshold { settle(a, .kept) }
                else if v.translation.width < -threshold { settle(a, .skipped) }
                else { withAnimation(DT.spring) { drag = .zero } }
            }
    }

    private var actionBar: some View {
        let layout = dynamicType.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: DT.space2)) : AnyLayout(HStackLayout(spacing: DT.space2))
        return layout {
            if let top = deck.first {
                Button { settle(top, .skipped) } label: { Label("Skip", systemImage: "xmark").lineLimit(1).frame(maxWidth: .infinity) }
                    .buttonStyle(SoftButtonStyle(tint: DT.textMuted))
                Button { expand(top) } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right").frame(width: DT.tapMin, height: DT.tapMin).glass(.card, radius: 22)
                }
                .buttonStyle(.plain).accessibilityLabel("Expand")
                Button { undo() } label: {
                    Image(systemName: "arrow.uturn.backward").frame(width: DT.tapMin, height: DT.tapMin).glass(.card, radius: 22)
                }
                .buttonStyle(.plain).disabled(history.isEmpty).opacity(history.isEmpty ? 0.4 : 1).accessibilityLabel("Undo last")
                Button { settle(top, .kept) } label: { Label("Keep", systemImage: "bookmark").lineLimit(1).frame(maxWidth: .infinity) }
                    .buttonStyle(AccentButtonStyle(accent: DT.success))
            }
        }
    }

    private var finished: some View {
        VStack(spacing: DT.space4) {
            EmptyStateView(symbol: "checkmark.seal", title: "All handled",
                           message: "Kept cards are in Saved. Skipped ones wait in the day's Skipped tray on Today.")
            if !history.isEmpty {
                Button { undo() } label: { Label("Undo last", systemImage: "arrow.uturn.backward") }.buttonStyle(SoftButtonStyle())
            }
        }
    }

    // MARK: actions

    private func ref(_ a: Article) -> ItemRef {
        app.ref(date: date, kind: kind, itemID: a.id, title: a.title, minutes: a.minutes)
    }

    private func flash(_ text: String) {
        withAnimation { note = text }
        Task { try? await Task.sleep(nanoseconds: 1_800_000_000); withAnimation { note = nil } }
    }

    private func undo() {
        guard let a = history.popLast() else { return }
        app.progress.markUnread(ref(a))
        Haptics.tap()
        withAnimation(DT.spring) { deck.insert(a, at: 0) }
    }

    private func settle(_ a: Article, _ status: ItemStatus) {
        let goingRight = status == .kept
        Haptics.tap()
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.2)) {
            drag = CGSize(width: goingRight ? 600 : -600, height: 0)
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: reduceMotion ? 0 : 200_000_000)
            app.progress.set(ref(a), status)
            history.append(a)
            if status == .kept { Haptics.success() }
            drag = .zero
            withAnimation(DT.spring) { deck.removeAll { $0.id == a.id } }
        }
    }

    private func expand(_ a: Article) {
        app.progress.markOpened(ref(a))
        withAnimation(DT.spring) { expanded = a }
    }

    private func collapse() { withAnimation(DT.spring) { expanded = nil } }

    private func build() { if !built { rebuild() } }

    /// Starts at the tapped item, unsettled ones first, then wraps.
    private func rebuild() {
        let start = articles.firstIndex { $0.id == startID } ?? 0
        let rotated = Array(articles[start...] + articles[..<start])
        deck = rotated.filter { app.progress.status(ref($0)).isPending }
        built = true
    }
}

struct CardFace: View {
    let article: Article
    let kind: ItemKind
    let expanded: Bool
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(\.verticalSizeClass) private var vSize

    /// With accessibility text sizes or in landscape a fixed-height card cannot show everything, so it scrolls instead of truncating.
    private var scrolls: Bool { (dynamicType.isAccessibilitySize || vSize == .compact) && !expanded }
    private var limit: Int? { expanded || scrolls ? nil : 6 }

    var body: some View {
        Group {
            if scrolls { ScrollView { content } } else { content }
        }
        .padding(DT.space4)
        .frame(maxWidth: .infinity, minHeight: expanded || scrolls ? nil : 420, maxHeight: expanded ? nil : .infinity, alignment: .topLeading)
        .glass(.reading, radius: DT.radiusXl)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: DT.space3) {
            HStack {
                Chip(text: kind.label, symbol: kind.symbol, track: .tech)
                Spacer()
                if let lvl = article.level { Chip(text: lvl) }
            }
            Text(article.title)
                .font(.title3.weight(.bold)).foregroundStyle(DT.text)
                .lineLimit(expanded || scrolls ? nil : 4)
                .accessibilityAddTraits(.isHeader)
            SourceLine(source: article.source, publishedAt: article.publishedAt, minutes: article.minutes, capped: article.capped)
            if let why = article.whySelected, !why.isEmpty {
                Text("**Why this is here** \(why)").font(.footnote).foregroundStyle(DT.textMuted)
                    .lineLimit(expanded ? nil : 3)
            }

            Text(article.tldr)
                .font(.body).foregroundStyle(DT.readingText)
                .lineLimit(limit)

            if expanded {
                if !article.keyIdeas.isEmpty {
                    block("Key idea", article.keyIdeas.joined(separator: "\n\n"), "lightbulb")
                }
                if let w = article.whyItMatters, !w.isEmpty { block("Why it matters", w, "target") }
                if let f = article.forYou, !f.isEmpty { block("For you", f, "person") }
            } else if let k = article.keyIdeas.first {
                Text(k).font(.subheadline).foregroundStyle(DT.textMuted).lineLimit(scrolls ? nil : 3)
            }
            if expanded, !article.tags.isEmpty {
                Text(article.tags.map { "#" + $0 }.joined(separator: "  "))
                    .font(.caption).foregroundStyle(DT.textMuted)
            }
            Spacer(minLength: 0)
            ReadFullArticleButton(url: article.url, track: .tech)
        }
    }

    private func block(_ title: String, _ body: String, _ symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: symbol).font(.subheadline.weight(.semibold)).foregroundStyle(DT.techInk)
            Text(body).font(.body).foregroundStyle(DT.readingText)
        }
    }
}
