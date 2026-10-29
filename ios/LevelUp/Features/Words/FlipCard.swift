import SwiftUI
import UIKit
import AVFoundation

struct FlipCard: View {
    let card: WordCardData
    @Binding var flipped: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lookup: String?

    var body: some View {
        ZStack {
            front.opacity(flipped ? 0 : 1).accessibilityHidden(flipped)
            back
                .rotation3DEffect(.degrees(reduceMotion ? 0 : 180), axis: (0, 1, 0))
                .opacity(flipped ? 1 : 0)
                .accessibilityHidden(!flipped)
        }
        .frame(maxWidth: .infinity, minHeight: 420, maxHeight: 520)
        .glass(.reading, radius: DT.radiusXl, tint: DT.englishAccent)
        .rotation3DEffect(.degrees(reduceMotion ? 0 : (flipped ? 180 : 0)), axis: (0, 1, 0), perspective: 0.6)
        .contentShape(RoundedRectangle(cornerRadius: DT.radiusXl))
        .onTapGesture { flip() }
        .accessibilityAction(named: flipped ? "Hide meaning" : "Show meaning") { flip() }
        .sheet(item: Binding(get: { lookup.map(LookupTerm.init) }, set: { lookup = $0?.term })) { t in
            DictionaryLookup(term: t.term).ignoresSafeArea()
        }
    }

    private func flip() {
        Haptics.tap()
        withAnimation(reduceMotion ? .easeInOut(duration: 0.15) : DT.spring) { flipped.toggle() }
    }

    private var front: some View {
        VStack(spacing: DT.space4) {
            Spacer()
            Text(card.word).font(.system(.largeTitle, design: .serif).weight(.bold)).foregroundStyle(DT.text)
                .multilineTextAlignment(.center).minimumScaleFactor(0.6)
            HStack(spacing: DT.space2) {
                if let pos = card.pos { Text(pos).font(.subheadline.italic()).foregroundStyle(DT.textMuted) }
                if let level = card.level { Chip(text: level, track: .english) }
            }
            if let ipa = card.ipa { Text(ipa).font(.title3).foregroundStyle(DT.englishInk) }
            speaker
            Spacer()
            Text("Tap to reveal the meaning").font(.footnote).foregroundStyle(DT.textMuted)
        }
        .padding(DT.space5)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }

    private var back: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space3) {
                HStack {
                    VStack(alignment: .leading) {
                        Text(card.word).font(.title2.weight(.bold)).foregroundStyle(DT.text)
                        HStack(spacing: DT.space2) {
                            if let ipa = card.ipa { Text(ipa).font(.subheadline).foregroundStyle(DT.englishInk) }
                            if let level = card.level { Chip(text: level, track: .english) }
                        }
                    }
                    Spacer()
                    speaker
                }
                if card.meaning.isEmpty {
                    Text("Saved from reading. No definition came with it.").font(.body).foregroundStyle(DT.textMuted)
                    Button { lookup = card.word } label: { Label("Look up", systemImage: "character.book.closed") }
                        .buttonStyle(SoftButtonStyle(tint: DT.englishInk))
                } else {
                    Text(card.meaning).font(.title3).foregroundStyle(DT.readingText)
                }
                if let ctx = card.context, !ctx.isEmpty { section("From your reading", [ctx], quote: true) }
                if !card.examples.isEmpty { section("Examples", card.examples, quote: true) }
                if let w = card.workSentence, !w.isEmpty { section("At work", [w], quote: true) }
                if !card.synonyms.isEmpty {
                    section("Synonyms", [card.synonyms.joined(separator: ", ")], quote: false)
                }
                if let m = card.commonMistake, !m.isEmpty { section("Common mistake", [m], quote: false) }
                if let e = card.etymology, !e.isEmpty { section("Origin", [e], quote: false) }
            }
            .padding(DT.space5)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var speaker: some View {
        Button {
            SpeechOutput.shared.speak(card.word, rate: AVSpeechUtteranceDefaultSpeechRate * 0.8)
        } label: {
            Image(systemName: "speaker.wave.2.fill").font(.title3)
                .foregroundStyle(DT.onAccent)
                .frame(width: 48, height: 48).background(Circle().fill(DT.englishAccent))
        }
        .accessibilityLabel("Pronounce \(card.word)")
    }

    private func section(_ title: String, _ lines: [String], quote: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(DT.englishInk)
            ForEach(lines, id: \.self) { l in
                Text(quote ? "\u{201C}\(l)\u{201D}" : l).font(.body).foregroundStyle(DT.readingText)
            }
        }
    }
}

private struct LookupTerm: Identifiable { let term: String; var id: String { term } }

struct DictionaryLookup: UIViewControllerRepresentable {
    let term: String
    func makeUIViewController(context: Context) -> UIReferenceLibraryViewController { UIReferenceLibraryViewController(term: term) }
    func updateUIViewController(_ vc: UIReferenceLibraryViewController, context: Context) {}
}
