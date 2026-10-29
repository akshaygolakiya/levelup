import Foundation

// Content models. Every field except the few identifying ones is optional or
// defaulted, unknown keys are ignored, and bad list elements are dropped.

struct GlossaryTerm: Hashable, Identifiable, Sendable {
    var term: String
    var explain: String
    var id: String { term }
}
extension GlossaryTerm: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let t: String = c.opt("term") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "term")) }
        term = t
        explain = c.firstString(["explain", "explanation", "meaning"]) ?? ""
    }
}

/// Deep read, quick read, AI news item or paper. All carry the original url.
struct Article: Hashable, Identifiable, Sendable {
    var id: String
    var kind: String = "deep"
    var title: String
    var source: String = ""
    var url: String = ""
    var publishedAt: String?
    var minutes: Int = 3
    var tldr: String = ""
    var keyIdeas: [String] = []
    var whyItMatters: String?
    var forYou: String?
    var seniorLens: String?
    var beforeYouRead: [GlossaryTerm] = []
    var questions: [String] = []
    var tags: [String] = []
    var whySelected: String?
    var level: String?
    var hasExplicitID = false
    /// Quick/AI estimates over 25 min are shown as "20+ min" (summaries cover only the opening).
    var capped = false

    /// Only http(s) links are opened in the in-app browser.
    var linkURL: URL? {
        guard let u = URL(string: url), let s = u.scheme?.lowercased(), s == "http" || s == "https" else { return nil }
        return u
    }
}
extension Article: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let t: String = c.opt("title") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "title")) }
        title = t
        url = c.opt("url") ?? ""
        var explicit: String? = c.opt("id")
        if explicit == nil, let n: Int = c.opt("id") { explicit = String(n) }
        hasExplicitID = explicit != nil
        id = explicit ?? StableID.make(url + t)
        kind = c.opt("kind") ?? "deep"
        source = c.opt("source") ?? ""
        publishedAt = c.opt("publishedAt")
        minutes = c.int("minutes", default: 3)
        tldr = c.opt("tldr") ?? ""
        var ideas = c.strings("keyIdeas")
        if ideas.isEmpty { ideas = c.strings("keyIdea") }
        keyIdeas = ideas
        whyItMatters = c.opt("whyItMatters")
        forYou = c.opt("forYou")
        seniorLens = c.opt("seniorLens")
        beforeYouRead = c.list("beforeYouRead")
        questions = c.strings("questions")
        tags = c.strings("tags")
        whySelected = c.opt("whySelected")
        level = c.opt("level")
    }
}

struct ConceptSection: Hashable, Sendable {
    var heading: String
    var body: String
}
extension ConceptSection: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        heading = c.opt("heading") ?? ""
        body = c.opt("body") ?? ""
        if heading.isEmpty && body.isEmpty { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "empty")) }
    }
}

struct Concept: Hashable, Identifiable, Sendable {
    var id: String
    var track: String?
    var title: String
    var minutes: Int = 10
    var hasExplicitID = false
    var intro: String = ""
    var sections: [ConceptSection] = []
    var diagram: String?
    var commonMistakes: [String] = []
    var interviewQuestions: [String] = []
    var questions: [String] = []
    var url: String?
    var source: String?
}
extension Concept: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let t: String = c.opt("title") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "title")) }
        title = t
        let explicit: String? = c.opt("id")
        hasExplicitID = explicit != nil
        id = explicit ?? "concept-" + StableID.make(t)
        track = c.opt("track")
        minutes = c.int("minutes", default: 10)
        intro = c.opt("intro") ?? ""
        sections = c.list("sections")
        diagram = c.opt("diagram")
        commonMistakes = c.strings("commonMistakes")
        interviewQuestions = c.strings("interviewQuestions")
        questions = c.strings("questions")
        url = c.opt("url")
        source = c.opt("source")
    }
}

struct TechContent: Sendable {
    var deepReads: [Article] = []
    var quickReads: [Article] = []
    var aiNews: [Article] = []
    var concepts: [Concept] = []
    var papers: [Article] = []
}
extension TechContent: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        deepReads = Self.tag(c.list("deepReads"), "deep")
        quickReads = Self.tag(c.list("quickReads"), "quick")
        aiNews = Self.tag(c.list("aiNews"), "ai")
        papers = Self.tag(c.list("papers"), "paper")
        concepts = c.oneOrMany(["concepts", "concept"])
    }
    private static func tag(_ a: [Article], _ kind: String) -> [Article] {
        a.map {
            var x = $0
            x.kind = kind
            if (kind == "quick" || kind == "ai") && x.minutes > 25 { x.minutes = 20; x.capped = true }
            return x
        }
    }
}

struct Word: Hashable, Identifiable, Sendable {
    var word: String
    var pos: String?
    var ipa: String?
    var syllables: String?
    var meaning: String = ""
    var examples: [String] = []
    var synonyms: [String] = []
    var commonMistake: String?
    var etymology: String?
    var workSentence: String?
    var tier: String?
    var level: String?
    var id: String { word.lowercased() }
}
extension Word: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let w: String = c.opt("word") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "word")) }
        word = w
        pos = c.opt("pos"); ipa = c.opt("ipa"); syllables = c.opt("syllables")
        meaning = c.opt("meaning") ?? ""
        examples = c.strings("examples"); synonyms = c.strings("synonyms")
        commonMistake = c.opt("commonMistake"); etymology = c.opt("etymology")
        workSentence = c.opt("workSentence"); tier = c.opt("tier"); level = c.opt("level")
    }
}

struct GrammarError: Hashable, Sendable {
    var wrong: String
    var right: String
    var why: String
}
extension GrammarError: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        wrong = c.opt("wrong") ?? ""; right = c.opt("right") ?? ""; why = c.opt("why") ?? ""
        if wrong.isEmpty && right.isEmpty { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "empty")) }
    }
}

struct Exercise: Hashable, Identifiable, Sendable {
    var type: String = "fill-blank"
    var prompt: String
    var answer: String
    var explanation: String = ""
    var options: [String] = []
    var id: String { StableID.make(prompt) }
}
extension Exercise: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let p: String = c.opt("prompt"), let a: String = c.opt("answer") else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "exercise"))
        }
        prompt = p; answer = a
        type = c.opt("type") ?? "fill-blank"
        explanation = c.opt("explanation") ?? ""
        options = c.strings("options")
    }
}

struct GrammarLesson: Hashable, Identifiable, Sendable {
    var topic: String
    var minutes: Int = 6
    var explanation: String = ""
    var commonErrors: [GrammarError] = []
    var exercises: [Exercise] = []
    var id: String { "grammar-" + StableID.make(topic) }
}
extension GrammarLesson: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let t: String = c.opt("topic") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "topic")) }
        topic = t
        minutes = c.int("minutes", default: 6)
        explanation = c.opt("explanation") ?? ""
        commonErrors = c.list("commonErrors")
        exercises = c.list("exercises")
    }
}

struct SpeakingPrompt: Hashable, Identifiable, Sendable {
    var prompt: String
    var context: String = "daily"
    var tips: [String] = []
    var usefulPhrases: [String] = []
    var modelSentence: String?
    var id: String { "speak-" + StableID.make(prompt) }

    /// Sentence for shadowing: explicit model sentence, else a useful phrase with the ellipsis removed.
    var shadowSentence: String? {
        if let m = modelSentence, !m.isEmpty { return m }
        guard let p = usefulPhrases.first else { return nil }
        let cleaned = p.replacingOccurrences(of: "...", with: "").replacingOccurrences(of: "…", with: "")
            .trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? nil : cleaned
    }
}
extension SpeakingPrompt: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let p: String = c.opt("prompt") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "prompt")) }
        prompt = p
        context = c.opt("context") ?? "daily"
        tips = c.strings("tips")
        usefulPhrases = c.strings("usefulPhrases")
        modelSentence = c.opt("modelSentence")
    }
}

struct WritingPrompt: Hashable, Identifiable, Sendable {
    var prompt: String
    var tip: String?
    var id: String { "write-" + StableID.make(prompt) }
}
extension WritingPrompt: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let p: String = c.opt("prompt") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "prompt")) }
        prompt = p
        tip = c.opt("tip")
    }
}

struct EnglishContent: Sendable {
    var words: [Word] = []
    var grammar: [GrammarLesson] = []
    var speaking: [SpeakingPrompt] = []
    var writing: [WritingPrompt] = []
}
extension EnglishContent: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        words = c.list("words")
        grammar = c.oneOrMany(["grammar"])
        speaking = c.list("speaking")
        writing = c.list("writing")
    }
}

struct DayContent: Sendable {
    var schema: Int = 1
    var date: String = ""
    var generatedAt: String?
    var promptsVersion: String?
    var tech = TechContent()
    var english = EnglishContent()
}
extension DayContent: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        schema = c.int("schema", default: 1)
        date = c.opt("date") ?? ""
        generatedAt = c.opt("generatedAt")
        if let v: String = c.opt("promptsVersion") { promptsVersion = v }
        else if let v: Int = c.opt("promptsVersion") { promptsVersion = String(v) }
        tech = c.opt("tech") ?? TechContent()
        english = c.opt("english") ?? EnglishContent()
    }
}
