import SwiftUI
import SwiftData
import AVFoundation

struct SpeakingView: View {
    var date: String?
    var focusID: String?
    @Environment(AppModel.self) private var app

    enum Mode: String, CaseIterable, Identifiable { case speak = "Speak", shadow = "Shadow", write = "Write"; var id: String { rawValue } }

    @State private var mode: Mode = .speak
    @State private var selectedID: String?
    @State private var result: RecordingResult?
    @State private var stats: SpeechStats?
    @State private var manualTranscript = ""
    @State private var similarity: Double?
    @State private var shadowSlow = false

    private var dayKey: String { date ?? app.selectedDate }
    private var day: DayContent? { app.repo.days[dayKey] }
    private var rec: SpeechRecorder { app.recorder }

    private var prompts: [SpeakingPrompt] {
        var list = day?.english.speaking ?? []
        if let a = day?.tech.deepReads.first {
            list.append(SpeakingPrompt(prompt: "Explain today's article out loud in one minute: \(a.title). What is the problem, the key idea and the trade-off?",
                                       context: "bridge", tips: ["Start with the problem, then the idea, then one trade-off.", "Pretend you are telling a teammate who has not read it."],
                                       usefulPhrases: ["The core idea is...", "The trade-off is..."]))
        }
        return list
    }
    private var current: SpeakingPrompt? {
        prompts.first { $0.id == (selectedID ?? focusID) } ?? prompts.first
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space4) {
                Picker("Mode", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: mode) { _, _ in resetAttempt() }

                if mode == .write {
                    WritingBox(date: dayKey, prompt: day?.english.writing.first)
                } else if let current {
                    promptChooser
                    promptCard(current)
                    if mode == .speak { speakSection(current) } else { shadowSection(current) }
                } else {
                    EmptyStateView(symbol: "mic.slash", title: "No prompts yet",
                                   message: "Speaking prompts arrive with each day's content. You can still use the Write tab.")
                }
            }
            .padding(DT.gutter)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Speaking")
        .navigationBarTitleDisplayMode(.inline)
        .background(MeshBackground())
        .task(id: dayKey) { _ = await app.repo.day(dayKey) }
        .onDisappear { app.recorder.stopPlayback() }
    }

    // MARK: prompt

    private var promptChooser: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(Array(prompts.enumerated()), id: \.element.id) { i, p in
                    let on = p.id == current?.id
                    Button {
                        selectedID = p.id; resetAttempt()
                    } label: {
                        Text(p.context == "bridge" ? "Bridge" : "\(i + 1) · \(p.context)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(on ? DT.onAccent : DT.englishInk)
                            .padding(.horizontal, 14).frame(minHeight: DT.tapMin)
                            .background(Capsule().fill(on ? DT.englishAccent : DT.englishSoft))
                    }
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    private func promptCard(_ p: SpeakingPrompt) -> some View {
        VStack(alignment: .leading, spacing: DT.space3) {
            Chip(text: p.context.capitalized, symbol: "bubble.left", track: .english)
            Text(p.prompt).font(.title3.weight(.semibold)).foregroundStyle(DT.readingText)
            if !p.tips.isEmpty {
                ForEach(p.tips, id: \.self) { t in
                    Label(t, systemImage: "lightbulb").font(.subheadline).foregroundStyle(DT.textMuted)
                }
            }
            if !p.usefulPhrases.isEmpty {
                DisclosureGroup("Useful phrases") {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(p.usefulPhrases, id: \.self) { Text("\u{201C}\($0)\u{201D}").font(.subheadline).foregroundStyle(DT.readingText) }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 4)
                }
                .tint(DT.englishInk)
            }
        }
        .padding(DT.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(.reading, radius: DT.radiusLg)
    }

    // MARK: speak

    private func speakSection(_ p: SpeakingPrompt) -> some View {
        VStack(spacing: DT.space4) {
            recorderControls(p, mode: "speak")
            if rec.isRecording { liveTranscript }
            if let stats { analysisCard(stats) }
        }
    }

    private func recorderControls(_ p: SpeakingPrompt, mode modeName: String) -> some View {
        VStack(spacing: DT.space3) {
            OrbView(level: CGFloat(rec.level), active: rec.isRecording)
            if rec.isRecording {
                Text(timeString(rec.elapsed)).font(.title3.monospacedDigit()).foregroundStyle(DT.text)
            }
            Button {
                Task { await toggle(p, mode: modeName) }
            } label: {
                Label(rec.isRecording ? "Stop" : (result == nil ? "Start recording" : "Record again"),
                      systemImage: rec.isRecording ? "stop.fill" : "mic.fill")
                    .frame(maxWidth: 260)
            }
            .buttonStyle(AccentButtonStyle(accent: rec.isRecording ? DT.textMuted : DT.englishAccent))
            if let msg = rec.errorMessage {
                VStack(spacing: DT.space2) {
                    Text(msg).font(.footnote).foregroundStyle(DT.textMuted).multilineTextAlignment(.center)
                    if rec.micDenied {
                        Button("Open Settings") {
                            if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                        }.buttonStyle(SoftButtonStyle(tint: DT.englishInk))
                    }
                }
            }
            if rec.speechUnavailable && !rec.micDenied {
                Text("Live transcript is unavailable here, so recording is audio only. You can type what you said below to get the analysis.")
                    .font(.footnote).foregroundStyle(DT.textMuted).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(DT.space4)
        .glass(.card, radius: DT.radiusXl)
    }

    private var liveTranscript: some View {
        Text(rec.transcript.isEmpty ? "Listening…" : rec.transcript)
            .font(.body).foregroundStyle(DT.readingText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(DT.space4).glass(.reading, radius: DT.radiusLg)
            .accessibilityLabel("Live transcript")
    }

    private func analysisCard(_ s: SpeechStats) -> some View {
        VStack(alignment: .leading, spacing: DT.space3) {
            Label("How it went", systemImage: "chart.bar").font(.headline).foregroundStyle(DT.englishInk)
            HStack {
                tile("\(s.wordCount)", "words")
                tile("\(s.wpm)", "words/min")
                tile("\(s.fillerCount)", "fillers")
                tile(timeString(s.duration), "length")
            }
            Text(SpeechAnalysis.paceNote(wpm: s.wpm)).font(.subheadline).foregroundStyle(DT.textMuted)
            if !s.fillers.isEmpty {
                Text("Fillers: " + s.fillers.sorted { $0.value > $1.value }.map { "\($0.key) ×\($0.value)" }.joined(separator: ", "))
                    .font(.subheadline).foregroundStyle(DT.textMuted)
            }
            if let t = result?.transcript, !t.isEmpty {
                Text(SpeechAnalysis.highlighted(t)).font(.body).foregroundStyle(DT.readingText)
                    .accessibilityLabel("Transcript. \(s.fillerCount) filler words highlighted. \(t)")
            } else if rec.speechUnavailable || (result?.transcript.isEmpty ?? true) {
                manualEntry
            }
            if let url = result?.fileURL {
                Button { rec.play(url) } label: { Label("Play recording", systemImage: "play.fill") }
                    .buttonStyle(SoftButtonStyle(tint: DT.englishInk))
            }
        }
        .padding(DT.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(.reading, radius: DT.radiusLg)
    }

    private var manualEntry: some View {
        VStack(alignment: .leading, spacing: DT.space2) {
            Text("No transcript was captured. Type or paste what you said to analyse it.")
                .font(.footnote).foregroundStyle(DT.textMuted)
            TextEditor(text: $manualTranscript)
                .frame(minHeight: 90).scrollContentBackground(.hidden)
                .padding(DT.space2).background(RoundedRectangle(cornerRadius: DT.radiusSm).fill(DT.borderSubtle))
            Button("Analyse") {
                guard var r = result else { return }
                r.transcript = manualTranscript
                result = r
                stats = SpeechAnalysis.analyze(transcript: manualTranscript, duration: r.duration)
            }.buttonStyle(SoftButtonStyle(tint: DT.englishInk))
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.weight(.bold).monospacedDigit()).foregroundStyle(DT.text)
            Text(label).font(.caption2).foregroundStyle(DT.textMuted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: shadowing

    private func shadowSection(_ p: SpeakingPrompt) -> some View {
        let sentence = p.shadowSentence ?? "Let me walk you through what I worked on yesterday."
        return VStack(spacing: DT.space4) {
            VStack(alignment: .leading, spacing: DT.space3) {
                Label("Model sentence", systemImage: "quote.bubble").font(.headline).foregroundStyle(DT.englishInk)
                Text(sentence).font(.title3).foregroundStyle(DT.readingText)
                HStack {
                    Button {
                        SpeechOutput.shared.speak(sentence, rate: AVSpeechUtteranceDefaultSpeechRate * (shadowSlow ? 0.6 : 0.9))
                    } label: { Label("Listen", systemImage: "speaker.wave.2.fill") }
                        .buttonStyle(AccentButtonStyle(accent: DT.englishAccent))
                    Toggle("Slow", isOn: $shadowSlow).toggleStyle(.button).frame(minHeight: DT.tapMin)
                }
                Text("Listen once, then record yourself repeating it.").font(.footnote).foregroundStyle(DT.textMuted)
            }
            .padding(DT.space4).frame(maxWidth: .infinity, alignment: .leading).glass(.reading, radius: DT.radiusLg)

            recorderControls(p, mode: "shadow")
            if rec.isRecording { liveTranscript }
            if let sim = similarity, let r = result {
                VStack(alignment: .leading, spacing: DT.space2) {
                    Label("\(Int(sim * 100))% of the words matched", systemImage: sim > 0.8 ? "checkmark.seal.fill" : "waveform.badge.magnifyingglass")
                        .font(.headline).foregroundStyle(sim > 0.8 ? DT.success : DT.englishInk)
                    if !r.transcript.isEmpty { Text(r.transcript).font(.body).foregroundStyle(DT.readingText) }
                    else { Text("No transcript captured, so a match score is unavailable.").font(.footnote).foregroundStyle(DT.textMuted) }
                    if let url = r.fileURL {
                        Button { rec.play(url) } label: { Label("Play recording", systemImage: "play.fill") }
                            .buttonStyle(SoftButtonStyle(tint: DT.englishInk))
                    }
                }
                .padding(DT.space4).frame(maxWidth: .infinity, alignment: .leading).glass(.reading, radius: DT.radiusLg)
            }
        }
        .onAppear { SpeechOutput.shared.stop() }
    }

    // MARK: actions

    private func toggle(_ p: SpeakingPrompt, mode modeName: String) async {
        if rec.isRecording {
            let r = await rec.stop()
            result = r
            let s = SpeechAnalysis.analyze(transcript: r.transcript, duration: r.duration)
            stats = modeName == "speak" ? s : nil
            if modeName == "shadow" {
                similarity = SpeechAnalysis.similarity(model: p.shadowSentence ?? "", spoken: r.transcript)
            }
            if r.duration >= 2 {
                app.practice.addSession(date: dayKey, prompt: p.prompt, mode: modeName, transcript: r.transcript, stats: s,
                                        audioFile: r.fileURL?.lastPathComponent)
                if p.context != "bridge" {
                    app.progress.set(app.ref(date: dayKey, kind: .speaking, itemID: p.id, title: p.prompt), .done)
                }
                Haptics.success()
            }
        } else {
            resetAttempt()
            await rec.start()
        }
    }

    private func resetAttempt() {
        result = nil; stats = nil; similarity = nil; manualTranscript = ""
        app.recorder.stopPlayback()
    }

    private func timeString(_ t: Double) -> String {
        let s = Int(t.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// Daily writing entry, saved locally.
struct WritingBox: View {
    let date: String
    let prompt: WritingPrompt?
    @Environment(AppModel.self) private var app
    @Query(sort: \WritingEntry.createdAt, order: .reverse) private var entries: [WritingEntry]
    @State private var text = ""
    @State private var savedNote = false

    private var sentenceCount: Int {
        text.split(whereSeparator: { ".!?".contains($0) }).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DT.space4) {
            VStack(alignment: .leading, spacing: DT.space3) {
                Label("Writing prompt", systemImage: "square.and.pencil").font(.headline).foregroundStyle(DT.englishInk)
                Text(prompt?.prompt ?? "Write three sentences about what you learned today.")
                    .font(.title3).foregroundStyle(DT.readingText)
                if let tip = prompt?.tip { Text(tip).font(.footnote).foregroundStyle(DT.textMuted) }
                TextEditor(text: $text)
                    .frame(minHeight: 140).scrollContentBackground(.hidden)
                    .padding(DT.space2).background(RoundedRectangle(cornerRadius: DT.radiusSm).fill(DT.borderSubtle))
                    .accessibilityLabel("Your writing")
                HStack {
                    Text("\(sentenceCount) sentences").font(.footnote).foregroundStyle(DT.textMuted)
                    Spacer()
                    if savedNote { Label("Saved", systemImage: "checkmark").font(.footnote).foregroundStyle(DT.success) }
                    Button("Save entry") {
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty else { return }
                        app.practice.addWriting(date: date, prompt: prompt?.prompt ?? "Free writing", text: trimmed)
                        Haptics.success(); text = ""
                        withAnimation { savedNote = true }
                    }
                    .buttonStyle(AccentButtonStyle(accent: DT.englishAccent))
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(DT.space4).glass(.reading, radius: DT.radiusLg)

            if !entries.isEmpty {
                Text("Your entries").font(.headline).foregroundStyle(DT.text)
                ForEach(entries.prefix(5)) { e in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(e.createdAt.formatted(.dateTime.day().month(.abbreviated).hour().minute()))
                            .font(.caption).foregroundStyle(DT.textMuted)
                        Text(e.text).font(.body).foregroundStyle(DT.readingText)
                    }
                    .padding(DT.space4).frame(maxWidth: .infinity, alignment: .leading).glass(.reading, radius: DT.radiusMd)
                    .contextMenu { Button(role: .destructive) { app.practice.context.delete(e) } label: { Label("Delete", systemImage: "trash") } }
                }
                Text("Corrections are not live. Paste an entry into a Claude chat if you want feedback.")
                    .font(.footnote).foregroundStyle(DT.textMuted)
            }
        }
    }
}
