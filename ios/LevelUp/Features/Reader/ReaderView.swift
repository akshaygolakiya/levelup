import SwiftUI

private struct ReaderMetrics: Equatable { var offset: CGFloat = 0; var content: CGFloat = 0 }
private struct ReaderMetricsKey: PreferenceKey {
    static var defaultValue = ReaderMetrics()
    static func reduce(value: inout ReaderMetrics, nextValue: () -> ReaderMetrics) { value = nextValue() }
}

/// Reports scroll offset and content height. iOS 18 uses the scroll geometry API; iOS 17 falls back to the preference.
private struct ScrollProgressModifier: ViewModifier {
    var viewport: CGFloat
    var onChange: (ReaderMetrics, CGFloat) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18, *) {
            content.onScrollGeometryChange(for: ReaderMetrics.self) { g in
                ReaderMetrics(offset: g.contentOffset.y + g.contentInsets.top, content: g.contentSize.height + g.contentInsets.top)
            } action: { _, m in onChange(m, viewport) }
        } else {
            content.onPreferenceChange(ReaderMetricsKey.self) { onChange($0, viewport) }
        }
    }
}

struct ReaderView: View {
    let doc: ReaderDoc
    @Environment(AppModel.self) private var app
    @Environment(Preferences.self) private var prefs
    @Environment(\.scenePhase) private var scenePhase
    @ScaledMetric(relativeTo: .body) private var bodySize: CGFloat = 17

    @State private var progress: Double = 0
    @State private var topID: String?
    @State private var toast: String?
    @State private var showRecall = false
    @State private var restored = false
    @State private var ready = false   // saving starts only after the saved position was restored

    private var track: Track { doc.ref.track }

    var body: some View {
        GeometryReader { outer in
            ScrollView {
                VStack(alignment: .leading, spacing: DT.space4) {
                    headerBlock.id("top")
                    ForEach(doc.sections) { sec in sectionView(sec).id(sec.id) }
                    footerBlock.id("end")
                }
                .scrollTargetLayout()
                .padding(.horizontal, DT.gutter)
                .padding(.vertical, DT.space4)
                .frame(maxWidth: DT.readingWidth)
                .frame(maxWidth: .infinity)
                .background(GeometryReader { g in
                    Color.clear.preference(key: ReaderMetricsKey.self,
                                           value: ReaderMetrics(offset: -g.frame(in: .named("reader")).minY, content: g.size.height))
                })
            }
            .coordinateSpace(name: "reader")
            .scrollPosition(id: $topID, anchor: .top)
            .modifier(ScrollProgressModifier(viewport: outer.size.height) { m, v in update(m, viewport: v) })
        }
        .overlay(alignment: .top) { progressBar }
        .overlay(alignment: .bottom) { toastView }
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(doc.ref.kind.label)
        .sheet(isPresented: $showRecall) { RecallSheet(questions: doc.questions, track: track) }
        .onAppear { app.progress.markOpened(doc.ref) }
        .task {
            guard !restored else { return }
            restored = true
            try? await Task.sleep(nanoseconds: 350_000_000)
            if let a = app.progress.anchor(doc.ref), a != "top" { topID = a }
            try? await Task.sleep(nanoseconds: 400_000_000)
            ready = true
        }
        .onDisappear(perform: saveScroll)
        // Save while reading too: the app can be killed without onDisappear ever running.
        .onChange(of: Int(progress * 40)) { _, _ in saveScroll() }
        .onChange(of: topID) { _, _ in saveScroll() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { saveScroll() } }
        .background(MeshBackground())
    }

    // MARK: blocks

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: DT.space3) {
            Text(doc.title)
                .font(.title.weight(.bold)).foregroundStyle(DT.text)
                .fontDesign(prefs.serifReading ? .serif : .default)
                .accessibilityAddTraits(.isHeader)
            SourceLine(source: doc.source, publishedAt: doc.publishedAt, minutes: doc.minutes, capped: doc.capped)
            if !doc.url.isEmpty {
                ReadFullArticleButton(url: doc.url, track: track)
            }
            if !doc.tldr.isEmpty {
                VStack(alignment: .leading, spacing: DT.space2) {
                    Label(doc.ref.kind == .concept ? "Overview" : "TL;DR", systemImage: "bolt.fill")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(DT.ink(track))
                    text(doc.tldr)
                }
                .padding(DT.space4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glass(.reading, radius: DT.radiusLg, tint: DT.accent(track))
            }
            if let why = doc.whySelected, !why.isEmpty {
                Text("**Why this is here** \(why)").font(.footnote).foregroundStyle(DT.textMuted)
            }
        }
    }

    private func sectionView(_ s: ReaderSection) -> some View {
        VStack(alignment: .leading, spacing: DT.space3) {
            Label(s.title, systemImage: s.symbol)
                .font(.headline).foregroundStyle(DT.ink(track))
                .accessibilityAddTraits(.isHeader)
            ForEach(s.glossary) { g in
                VStack(alignment: .leading, spacing: 2) {
                    Text(g.term).font(.subheadline.weight(.semibold)).foregroundStyle(DT.text)
                    text(g.explain)
                }
            }
            ForEach(Array(s.paragraphs.enumerated()), id: \.offset) { _, p in text(p, mono: s.mono) }
            ForEach(Array(s.bullets.enumerated()), id: \.offset) { _, b in
                HStack(alignment: .firstTextBaseline, spacing: DT.space2) {
                    Text("•").foregroundStyle(DT.ink(track))
                    text(b)
                }
            }
        }
        .padding(DT.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(.reading, radius: DT.radiusLg)
    }

    private var footerBlock: some View {
        VStack(spacing: DT.space3) {
            if !doc.url.isEmpty { ReadFullArticleButton(url: doc.url, track: track) }
            if !doc.questions.isEmpty {
                Button { showRecall = true } label: {
                    Label("Test yourself: recall questions", systemImage: "questionmark.bubble").frame(maxWidth: .infinity)
                }
                .buttonStyle(SoftButtonStyle(tint: DT.ink(track)))
            }
            Button {
                app.progress.set(doc.ref, .done)
                Haptics.success()
                show("Marked as read")
            } label: {
                Label(app.progress.status(doc.ref) == .done ? "Read" : "Mark as read",
                      systemImage: app.progress.status(doc.ref) == .done ? "checkmark.circle.fill" : "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SoftButtonStyle(tint: DT.success))
            if app.progress.status(doc.ref).isResolved || app.progress.status(doc.ref) == .skipped {
                Button {
                    app.progress.markUnread(doc.ref)
                    Haptics.tap(); show("Marked as unread")
                } label: { Label("Mark as unread", systemImage: "arrow.uturn.backward").frame(maxWidth: .infinity) }
                .buttonStyle(SoftButtonStyle())
            }
            HStack {
                Text("Useful?").font(.footnote).foregroundStyle(DT.textMuted)
                feedback(true, "hand.thumbsup"); feedback(false, "hand.thumbsdown")
            }
            Text("Tip: select a word and choose Save word to review it later.")
                .font(.caption).foregroundStyle(DT.textMuted).multilineTextAlignment(.center)
        }
        .padding(.bottom, DT.space6)
    }

    private func feedback(_ value: Bool, _ symbol: String) -> some View {
        let on = app.progress.useful(doc.ref) == value
        return Button {
            app.progress.setUseful(doc.ref, on ? nil : value)
            Haptics.tap(); show(on ? "Cleared" : "Thanks, noted")
        } label: {
            Image(systemName: on ? symbol + ".fill" : symbol).frame(width: DT.tapMin, height: DT.tapMin)
        }
        .accessibilityLabel(value ? "Useful" : "Not useful")
    }

    private func text(_ s: String, mono: Bool = false) -> some View {
        SelectableText(text: s, size: bodySize, serif: prefs.serifReading, monospaced: mono) { selection in
            saveWord(selection, in: s)
        }
    }

    // MARK: progress

    private var progressBar: some View {
        GeometryReader { g in
            Capsule().fill(DT.accent(track)).frame(width: g.size.width * progress, height: 3)
        }
        .frame(height: 3)
        .accessibilityElement()
        .accessibilityLabel("Reading progress")
        .accessibilityValue("\(Int(progress * 100)) percent")
    }

    private func update(_ m: ReaderMetrics, viewport: CGFloat) {
        let span = m.content - viewport
        guard span > 120 else { return }
        let p = Double(min(max(m.offset / span, 0), 1))
        progress = p
        if p >= 0.97, app.progress.status(doc.ref) == .inProgress { app.progress.set(doc.ref, .done) }
    }

    private func saveScroll() {
        guard ready else { return }
        app.progress.saveScroll(doc.ref, fraction: progress, anchor: topID)
    }

    // MARK: tap-a-word

    private func saveWord(_ selection: String, in paragraph: String) {
        guard let w = WordSaving.clean(selection) else { show("Select one word or a short phrase"); return }
        let key = w.lowercased()
        var card = WordCardData(id: key, word: w, meaning: "")
        if let day = app.repo.days[doc.ref.date], let known = day.english.words.first(where: { $0.id == key }) {
            card = WordCardData(known)
        } else {
            card.context = WordSaving.sentence(containing: selection, in: paragraph)
        }
        app.practice.save(card, origin: "reader", context: card.context)
        Haptics.success()
        show("Saved \"\(w)\"")
    }

    private func show(_ message: String) {
        withAnimation(DT.spring) { toast = message }
        Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            withAnimation(DT.spring) { if toast == message { toast = nil } }
        }
    }

    @ViewBuilder
    private var toastView: some View {
        if let toast {
            Text(toast)
                .font(.subheadline.weight(.semibold)).foregroundStyle(DT.text)
                .padding(.horizontal, DT.space4).padding(.vertical, DT.space3)
                .glass(.chrome, radius: 24)
                .padding(.bottom, DT.space5)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

struct RecallSheet: View {
    let questions: [String]
    let track: Track
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DT.space4) {
                    Text("Answer each one out loud before checking the article.")
                        .font(.subheadline).foregroundStyle(DT.textMuted)
                    ForEach(Array(questions.enumerated()), id: \.offset) { i, q in
                        HStack(alignment: .top, spacing: DT.space3) {
                            Text("\(i + 1)").font(.headline).foregroundStyle(DT.onAccent)
                                .frame(width: 28, height: 28).background(Circle().fill(DT.accent(track)))
                            Text(q).font(.body).foregroundStyle(DT.text)
                        }
                        .padding(DT.space4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glass(.reading, radius: DT.radiusLg)
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(DT.gutter)
            }
            .navigationTitle("Recall")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .background(MeshBackground())
        }
        .presentationDetents([.medium, .large])
    }
}
