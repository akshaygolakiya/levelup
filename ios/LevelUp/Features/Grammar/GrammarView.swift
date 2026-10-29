import SwiftUI

struct GrammarView: View {
    let lesson: GrammarLesson
    let ref: ItemRef
    @Environment(AppModel.self) private var app
    @Environment(Preferences.self) private var prefs
    @ScaledMetric(relativeTo: .body) private var bodySize: CGFloat = 17

    private enum Outcome { case correct, wrong, revealed }

    @State private var index = 0
    @State private var input = ""
    @State private var outcome: Outcome?
    @State private var correct = 0
    @State private var finished = false
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space4) {
                Text(lesson.topic).font(.title2.weight(.bold)).foregroundStyle(DT.text)
                    .accessibilityAddTraits(.isHeader)
                Chip(text: "\(lesson.minutes) min", symbol: "clock", track: .english)

                card("The idea", "text.book.closed") {
                    SelectableText(text: lesson.explanation, size: bodySize, serif: prefs.serifReading) { _ in }
                }
                if !lesson.commonErrors.isEmpty {
                    card("Common errors", "exclamationmark.triangle") {
                        ForEach(Array(lesson.commonErrors.enumerated()), id: \.offset) { _, e in
                            VStack(alignment: .leading, spacing: 4) {
                                Label { Text(e.wrong).strikethrough() } icon: { Image(systemName: "xmark.circle") }
                                    .foregroundStyle(DT.textMuted)
                                Label { Text(e.right) } icon: { Image(systemName: "checkmark.circle.fill") }
                                    .foregroundStyle(DT.success)
                                Text(e.why).font(.footnote).foregroundStyle(DT.textMuted)
                            }
                            .font(.body)
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Wrong: \(e.wrong). Right: \(e.right). \(e.why)")
                        }
                    }
                }
                practiceCard
            }
            .padding(DT.gutter)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Grammar")
        .navigationBarTitleDisplayMode(.inline)
        .background(MeshBackground())
        .onAppear { app.progress.markOpened(ref) }
    }

    // MARK: practice

    @ViewBuilder
    private var practiceCard: some View {
        if lesson.exercises.isEmpty {
            EmptyView()
        } else if finished {
            card("Practice complete", "party.popper") {
                Text("\(correct) of \(lesson.exercises.count) correct on the first try.")
                    .font(.headline).foregroundStyle(DT.text)
                Text("Mistakes are saved on this device and can be exported later.")
                    .font(.footnote).foregroundStyle(DT.textMuted)
                Button("Practise again") { restart() }.buttonStyle(SoftButtonStyle(tint: DT.englishInk))
            }
        } else {
            let ex = lesson.exercises[index]
            card("Practice \(index + 1) of \(lesson.exercises.count)", "pencil.and.list.clipboard") {
                Text(ex.type == "correct-the-sentence" ? "Correct the sentence" : "Fill in the blank")
                    .font(.caption.weight(.semibold)).foregroundStyle(DT.englishInk)
                Text(ex.prompt).font(.title3).foregroundStyle(DT.readingText)

                if ex.options.isEmpty {
                    TextField("Your answer", text: $input, axis: .vertical)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focused)
                        .disabled(outcome != nil)
                        .padding(DT.space3).frame(minHeight: DT.tapMin)
                        .background(RoundedRectangle(cornerRadius: DT.radiusSm).fill(DT.borderSubtle))
                        .onSubmit { check(ex) }
                } else {
                    ForEach(ex.options, id: \.self) { opt in
                        Button { input = opt; check(ex) } label: { Text(opt).frame(maxWidth: .infinity, alignment: .leading) }
                            .buttonStyle(SoftButtonStyle(tint: DT.text)).disabled(outcome != nil)
                    }
                }

                if let outcome {
                    VStack(alignment: .leading, spacing: 4) {
                        Label(outcome == .correct ? "Correct" : (outcome == .wrong ? "Not quite" : "Answer"),
                              systemImage: outcome == .correct ? "checkmark.circle.fill" : "info.circle.fill")
                            .font(.headline).foregroundStyle(outcome == .correct ? DT.success : DT.englishInk)
                        if outcome != .correct { Text("Answer: \(ex.answer)").font(.body).foregroundStyle(DT.readingText) }
                        if !ex.explanation.isEmpty { Text(ex.explanation).font(.subheadline).foregroundStyle(DT.textMuted) }
                    }
                    .accessibilityElement(children: .combine)
                    Button(index + 1 == lesson.exercises.count ? "Finish" : "Next") { next() }
                        .buttonStyle(AccentButtonStyle(accent: DT.englishAccent))
                } else {
                    HStack {
                        Button("Check") { check(ex) }
                            .buttonStyle(AccentButtonStyle(accent: DT.englishAccent))
                            .disabled(ex.options.isEmpty && input.trimmingCharacters(in: .whitespaces).isEmpty)
                        Button("Show answer") { outcome = .revealed }
                            .buttonStyle(SoftButtonStyle(tint: DT.englishInk))
                    }
                }
            }
        }
    }

    private func check(_ ex: Exercise) {
        guard outcome == nil else { return }
        focused = false
        if AnswerChecker.matches(input, ex.answer) {
            outcome = .correct; correct += 1; Haptics.success()
        } else {
            outcome = .wrong; Haptics.warn()
            app.practice.addMistake(date: ref.date, topic: lesson.topic, prompt: ex.prompt, given: input, expected: ex.answer)
        }
    }

    private func next() {
        if index + 1 < lesson.exercises.count {
            withAnimation(DT.spring) { index += 1; input = ""; outcome = nil }
        } else {
            withAnimation(DT.spring) { finished = true }
            app.progress.set(ref, .done)
        }
    }

    private func restart() {
        index = 0; input = ""; outcome = nil; correct = 0; finished = false
    }

    private func card<Content: View>(_ title: String, _ symbol: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: DT.space3) {
            Label(title, systemImage: symbol).font(.headline).foregroundStyle(DT.englishInk)
            content()
        }
        .padding(DT.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(.reading, radius: DT.radiusLg)
    }
}
