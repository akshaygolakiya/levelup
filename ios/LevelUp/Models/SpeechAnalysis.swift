import SwiftUI

struct SpeechStats: Equatable, Sendable {
    var wordCount = 0
    var duration: Double = 0
    var wpm = 0
    var fillerCount = 0
    var fillers: [String: Int] = [:]
}

/// Local, on-device checks of a transcript.
enum SpeechAnalysis {
    // Longest phrases first so "you know" wins over "know".
    private static let fillerRegex = try! NSRegularExpression(
        pattern: #"\b(?:you know|i mean|umm+|um+|uhh*|uh+|erm+|er+|like)\b"#, options: [.caseInsensitive])
    private static let wordRegex = try! NSRegularExpression(pattern: #"[\p{L}\p{N}][\p{L}\p{N}'’]*"#)

    static func words(_ text: String) -> [String] {
        let ns = text as NSString
        return wordRegex.matches(in: text, range: NSRange(location: 0, length: ns.length))
            .map { ns.substring(with: $0.range).lowercased() }
    }

    static func fillerRanges(in text: String) -> [NSRange] {
        fillerRegex.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)).map(\.range)
    }

    static func analyze(transcript: String, duration: Double) -> SpeechStats {
        let count = words(transcript).count
        var fillers: [String: Int] = [:]
        let ns = transcript as NSString
        for r in fillerRanges(in: transcript) { fillers[ns.substring(with: r).lowercased(), default: 0] += 1 }
        let wpm = duration >= 1 ? Int((Double(count) / (duration / 60)).rounded()) : 0
        return SpeechStats(wordCount: count, duration: duration, wpm: wpm,
                           fillerCount: fillers.values.reduce(0, +), fillers: fillers)
    }

    static func highlighted(_ text: String) -> AttributedString {
        var out = AttributedString(text)
        for nsr in fillerRanges(in: text) {
            guard let r = Range(nsr, in: text), let ar = Range(r, in: out) else { continue }
            out[ar].backgroundColor = DT.fillerBg
            out[ar].font = .body.bold()
        }
        return out
    }

    /// Share of the model sentence's words that appear in what was said (0...1).
    static func similarity(model: String, spoken: String) -> Double {
        let m = words(model)
        guard !m.isEmpty else { return 0 }
        let s = Set(words(spoken))
        return Double(m.filter { s.contains($0) }.count) / Double(m.count)
    }

    static func paceNote(wpm: Int) -> String {
        switch wpm {
        case 0: return "Too short to judge pace."
        case ..<100: return "A little slow. Aim for about 120 to 160 words per minute."
        case 100...170: return "Comfortable pace for meetings and interviews."
        default: return "Quite fast. Pause between ideas so listeners can follow."
        }
    }
}
