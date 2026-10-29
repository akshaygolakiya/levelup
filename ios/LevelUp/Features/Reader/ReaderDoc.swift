import Foundation

struct ReaderSection: Identifiable, Hashable {
    var id: String
    var title: String
    var symbol: String
    var paragraphs: [String] = []
    var bullets: [String] = []
    var glossary: [GlossaryTerm] = []
    var mono = false
}

/// One shape for everything the reader shows (deep reads, papers, concept lessons).
struct ReaderDoc {
    var ref: ItemRef
    var title: String
    var source: String
    var url: String
    var publishedAt: String?
    var minutes: Int
    var tldr: String
    var sections: [ReaderSection]
    var questions: [String]
    var whySelected: String?
    var capped = false

    init(article a: Article, ref: ItemRef) {
        self.ref = ref; title = a.title; source = a.source; url = a.url; publishedAt = a.publishedAt
        minutes = a.minutes; tldr = a.tldr; questions = a.questions; whySelected = a.whySelected; capped = a.capped
        var s: [ReaderSection] = []
        if !a.beforeYouRead.isEmpty { s.append(.init(id: "before", title: "Before you read", symbol: "book.closed", glossary: a.beforeYouRead)) }
        if !a.keyIdeas.isEmpty { s.append(.init(id: "ideas", title: "Key ideas", symbol: "lightbulb", bullets: a.keyIdeas)) }
        if let t = a.seniorLens, !t.isEmpty { s.append(.init(id: "senior", title: "Senior lens", symbol: "binoculars", paragraphs: Self.paras(t))) }
        if let t = a.whyItMatters, !t.isEmpty { s.append(.init(id: "why", title: "Why it matters", symbol: "target", paragraphs: Self.paras(t))) }
        if let t = a.forYou, !t.isEmpty { s.append(.init(id: "foryou", title: "For you", symbol: "person", paragraphs: Self.paras(t))) }
        sections = s
    }

    init(concept c: Concept, ref: ItemRef) {
        self.ref = ref; title = c.title; source = c.track ?? "Concept"; url = c.url ?? ""; publishedAt = nil
        minutes = c.minutes; tldr = c.intro; questions = c.questions
        var s: [ReaderSection] = []
        for (i, sec) in c.sections.enumerated() {
            s.append(.init(id: "sec\(i)", title: sec.heading, symbol: "text.alignleft", paragraphs: Self.paras(sec.body)))
        }
        if let d = c.diagram, !d.isEmpty { s.append(.init(id: "diagram", title: "Diagram", symbol: "point.3.connected.trianglepath.dotted", paragraphs: [d], mono: true)) }
        if !c.commonMistakes.isEmpty { s.append(.init(id: "mistakes", title: "Common mistakes", symbol: "exclamationmark.triangle", bullets: c.commonMistakes)) }
        if !c.interviewQuestions.isEmpty { s.append(.init(id: "interview", title: "Interview questions", symbol: "person.2", bullets: c.interviewQuestions)) }
        sections = s
    }

    static func paras(_ t: String) -> [String] {
        t.components(separatedBy: "\n\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
}

enum WordSaving {
    /// Cleans a text selection into a saveable word/phrase; nil if it is too long or empty.
    static func clean(_ selection: String) -> String? {
        let trimmed = selection.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        let count = trimmed.split(separator: " ").count
        return (1...4).contains(count) ? trimmed : nil
    }

    /// The sentence of `paragraph` that contains `selection`, for context.
    static func sentence(containing selection: String, in paragraph: String) -> String? {
        guard let r = paragraph.range(of: selection, options: .caseInsensitive) else { return nil }
        let before = paragraph[..<r.lowerBound]
        let after = paragraph[r.upperBound...]
        let start = before.lastIndex(where: { ".!?\n".contains($0) }).map { before.index(after: $0) } ?? paragraph.startIndex
        let end = after.firstIndex(where: { ".!?\n".contains($0) }).map { after.index(after: $0) } ?? paragraph.endIndex
        return String(paragraph[start..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
