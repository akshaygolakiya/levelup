import Foundation

struct DayEntry: Hashable, Identifiable, Sendable {
    var date: String
    var id: String { date }
}
extension DayEntry: Decodable {
    init(from decoder: Decoder) throws {
        if let single = try? decoder.singleValueContainer(), let s = try? single.decode(String.self) {
            date = s; return
        }
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let d: String = c.opt("date") else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "date")) }
        date = d
    }
}

/// Entry of `weeklies` in index.json: { week, from, to, days }. Plain strings are accepted too.
struct WeeklyRef: Hashable, Identifiable, Sendable {
    var id: String          // the week, e.g. "2026-W44"
    var title: String?
    var path: String        // relative to the data root, e.g. "weekly/2026-W44.json"
    var from: String?
    var to: String?
    var dayCount: Int?

    var weekNumber: String { id.split(separator: "W").last.map(String.init) ?? id }
}
extension WeeklyRef: Decodable {
    init(from decoder: Decoder) throws {
        if let single = try? decoder.singleValueContainer(), let s = try? single.decode(String.self) {
            self = Self.make(id: s, file: s); return
        }
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let id = c.firstString(["week", "id", "date", "key"]) ?? c.firstString(["file", "path"]) else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "weekly id"))
        }
        var r = Self.make(id: id, file: c.firstString(["file", "path"]) ?? id)
        r.title = c.opt("title"); r.from = c.opt("from"); r.to = c.opt("to")
        if let n: Int = c.opt("days") { r.dayCount = n } else if let a: [String] = c.opt("days") { r.dayCount = a.count }
        self = r
    }

    private static func make(id: String, file: String) -> WeeklyRef {
        var p = file
        if !p.contains("/") && !p.hasSuffix(".json") { p = "weekly/\(p).json" }
        else if !p.contains("/") { p = "weekly/\(p)" }
        let cleanID = (id as NSString).lastPathComponent.replacingOccurrences(of: ".json", with: "")
        return WeeklyRef(id: cleanID, title: nil, path: p)
    }
}

struct DayIndex: Sendable {
    var schema: Int = 1
    var days: [DayEntry] = []
    var weeklies: [WeeklyRef] = []

    /// Newest first.
    var dates: [String] { days.map(\.date).sorted(by: >) }
}
extension DayIndex: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        schema = c.int("schema", default: 1)
        days = c.list("days")
        weeklies = c.list("weeklies")
    }
}

// MARK: Weekly summary (pipeline/weekly.mjs): data/weekly/<week>.json
// { week, from, to, days[], takeaways{engineering[],ai[]}, concepts[], mustRemember[], words[], grammar[], quiz[], links[] }

/// One revision line. Different sections fill different fields.
struct WeeklyEntry: Hashable, Identifiable, Sendable {
    var title: String?     // concept title, word, grammar topic, or the source item's title for takeaways
    var text: String       // text / recap / meaning / rule
    var url: String?
    var pos: String?
    var level: String?
    var date: String?
    var id: String { (title ?? "") + "|" + text }

    var linkURL: URL? {
        guard let u = url.flatMap(URL.init(string:)), let s = u.scheme?.lowercased(), s == "http" || s == "https" else { return nil }
        return u
    }
}
extension WeeklyEntry: Decodable {
    init(from decoder: Decoder) throws {
        if let single = try? decoder.singleValueContainer(), let s = try? single.decode(String.self) {
            title = nil; text = s; return
        }
        let c = try decoder.container(keyedBy: AnyKey.self)
        title = c.firstString(["word", "topic", "title", "term", "name", "heading"])
        text = c.firstString(["text", "recap", "rule", "meaning", "summary", "explanation", "body", "fact"]) ?? ""
        url = c.firstString(["url", "link"])
        pos = c.opt("pos"); level = c.opt("level"); date = c.opt("date")
        if title == nil && text.isEmpty { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "empty")) }
    }
}

struct WeeklyQuizItem: Hashable, Identifiable, Sendable {
    var question: String
    var answer: String
    var source: String?
    var url: String?
    var id: String { question }

    var linkURL: URL? {
        guard let u = url.flatMap(URL.init(string:)), let s = u.scheme?.lowercased(), s == "http" || s == "https" else { return nil }
        return u
    }
}
extension WeeklyQuizItem: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let q = c.firstString(["question", "q", "prompt"]) else { throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "q")) }
        question = q
        answer = c.firstString(["answer", "a"]) ?? ""
        source = c.firstString(["title", "source"])
        url = c.firstString(["url", "link"])
    }
}

struct WeeklySummary: Sendable {
    var id = ""
    var from: String?
    var to: String?
    var engineering: [WeeklyEntry] = []
    var ai: [WeeklyEntry] = []
    var concepts: [WeeklyEntry] = []
    var mustRemember: [WeeklyEntry] = []
    var words: [WeeklyEntry] = []
    var grammar: [WeeklyEntry] = []
    var quiz: [WeeklyQuizItem] = []

    var isEmpty: Bool {
        engineering.isEmpty && ai.isEmpty && concepts.isEmpty && mustRemember.isEmpty && words.isEmpty && grammar.isEmpty && quiz.isEmpty
    }
}
extension WeeklySummary: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.firstString(["week", "id"]) ?? ""
        from = c.opt("from"); to = c.opt("to")
        if let t = try? c.nestedContainer(keyedBy: AnyKey.self, forKey: "takeaways") {
            engineering = t.list("engineering")
            ai = t.list("ai")
        } else {
            engineering = c.list("takeaways")   // flat list from an older shape
        }
        concepts = c.list("concepts")
        mustRemember = c.list("mustRemember")
        if mustRemember.isEmpty { mustRemember = c.list("facts") }
        words = c.list("words")
        grammar = c.list("grammar")
        if grammar.isEmpty { grammar = c.list("grammarRules") }
        quiz = c.list("quiz")
    }
}
