import Foundation
import SwiftData

/// Import/export in the web app's format 2 (site/js/store.js exportJson/importJson):
/// { app: "levelup", format: 2, exportedAt, state: { v, prefs, items, scroll, words, coreDays, notes, writing, useful } }
/// Item ids are the web ids, so progress moves between the two apps. Format 1 files (same state shape) load too.
enum TransferError: LocalizedError {
    case notLevelUp
    case tooNew(Int)
    var errorDescription: String? {
        switch self {
        case .notLevelUp: "This file is not a LevelUp export."
        case .tooNew(let f): "This export uses format \(f), which this version of the app does not understand."
        }
    }
}

@MainActor
enum ProgressTransfer {
    static let formatVersion = 2
    private static func ms(_ d: Date) -> Int { Int((d.timeIntervalSince1970 * 1000).rounded()) }
    private static func date(ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }

    // MARK: export

    static func export(context: ModelContext, prefs: Preferences) throws -> Data {
        var items: [String: Any] = [:], scroll: [String: Any] = [:], useful: [String: Any] = [:]
        for p in try context.fetch(FetchDescriptor<ItemProgress>()) {
            let status = ItemStatus(rawValue: p.status) ?? .unread
            if status != .unread { items[p.key] = ["s": status.exportName, "at": ms(p.updatedAt), "day": p.date] }
            if p.scroll > 0 { scroll[p.key] = ["p": p.scroll, "at": ms(p.updatedAt)] }
            if let u = p.useful { useful[p.key] = u }
        }
        var words: [String: Any] = [:]
        for w in try context.fetch(FetchDescriptor<SavedWord>()) {
            var d: [String: Any] = [
                "word": w.display, "key": w.word, "meaning": w.meaning, "examples": w.examples, "synonyms": w.synonyms,
                "savedAt": ms(w.addedAt), "upd": ms(w.updatedAt ?? w.addedAt),
                "srs": ["ease": w.ease, "reps": w.reps, "interval": w.interval, "lapses": w.lapses,
                        "due": ms(w.due), "last": ms(w.updatedAt ?? w.addedAt)] as [String: Any]
            ]
            if let v = w.pos { d["pos"] = v }
            if let v = w.ipa { d["ipa"] = v }
            if let v = w.commonMistake { d["commonMistake"] = v }
            if let v = w.etymology { d["etymology"] = v }
            if let v = w.workSentence { d["workSentence"] = v }
            if let v = w.context { d["context"] = v }
            words[w.word] = d
        }
        var coreDays: [String: Any] = [:]
        for s in try context.fetch(FetchDescriptor<DayStat>()) {
            let v = DayStatValue(coreTotal: s.coreTotal, coreDone: s.coreDone)
            if v.isComplete { coreDays[s.date] = (DateText.date(fromKey: s.date).map(ms) ?? 0) + 12 * 3_600_000 }
        }
        let writing: [[String: Any]] = try context.fetch(FetchDescriptor<WritingEntry>()).map {
            ["id": "w\(ms($0.createdAt))", "itemId": NSNull(), "date": $0.date, "at": ms($0.createdAt), "prompt": $0.prompt, "text": $0.text]
        }
        let state: [String: Any] = [
            "v": formatVersion,
            "prefs": ["theme": prefs.theme.rawValue, "textSize": 100 + prefs.textStep * 10, "serif": prefs.serifReading,
                      "catchupDays": prefs.catchUpDays, "motion": "system", "transparency": "system", "timebox": prefs.timebox.rawValue] as [String: Any],
            "items": items, "scroll": scroll, "words": words, "coreDays": coreDays, "notes": [String: Any](),
            "writing": writing, "useful": useful
        ]
        let root: [String: Any] = ["app": "levelup", "format": formatVersion,
                                   "exportedAt": ISO8601DateFormatter().string(from: Date()), "state": state]
        return try JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])
    }

    // MARK: import

    /// Merges an export into local data; the newer record wins per key. Returns the number of records changed.
    @discardableResult
    static func importData(_ data: Data, context: ModelContext) throws -> Int {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              root["app"] as? String == "levelup", let state = root["state"] as? [String: Any] else { throw TransferError.notLevelUp }
        if let f = root["format"] as? Int, f > formatVersion { throw TransferError.tooNew(f) }
        var count = 0
        let num = { (v: Any?) -> Double? in (v as? NSNumber)?.doubleValue }

        // items
        var records = Dictionary(((try? context.fetch(FetchDescriptor<ItemProgress>())) ?? []).map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        func record(_ key: String, day: String?) -> ItemProgress {
            if let r = records[key] { return r }
            let r = ItemProgress(key: key, date: day ?? datePrefix(key), kind: kind(of: key), itemID: key)
            r.updatedAt = Date(timeIntervalSince1970: 0)
            context.insert(r); records[key] = r
            return r
        }
        for (id, raw) in (state["items"] as? [String: Any]) ?? [:] {
            guard let v = raw as? [String: Any], let s = v["s"] as? String, ["done", "kept", "skipped", "prog"].contains(s) else { continue }
            let at = date(ms: num(v["at"]) ?? 0)
            let r = record(id, day: v["day"] as? String)
            guard at > r.updatedAt || r.status == 0 else { continue }
            r.status = ItemStatus(exportName: s).rawValue; r.updatedAt = at; count += 1
        }
        for (id, raw) in (state["scroll"] as? [String: Any]) ?? [:] {
            guard let v = raw as? [String: Any], let p = num(v["p"]), p > 0 else { continue }
            let r = record(id, day: nil)
            if r.scroll == 0 { r.scroll = min(1, p); count += 1 }
        }
        for (id, raw) in (state["useful"] as? [String: Any]) ?? [:] {
            guard let u = raw as? Bool else { continue }
            let r = record(id, day: nil)
            if r.useful == nil { r.useful = u; count += 1 }
        }

        // words
        var saved = Dictionary(((try? context.fetch(FetchDescriptor<SavedWord>())) ?? []).map { ($0.word, $0) }, uniquingKeysWith: { a, _ in a })
        for (key, raw) in (state["words"] as? [String: Any]) ?? [:] {
            guard let d = raw as? [String: Any], let display = d["word"] as? String else { continue }
            let k = key.trimmingCharacters(in: .whitespaces).lowercased()
            let upd = date(ms: num(d["upd"]) ?? 0)
            let w: SavedWord
            if let cur = saved[k] {
                guard upd > (cur.updatedAt ?? cur.addedAt) else { continue }
                w = cur
            } else {
                let card = WordCardData(id: k, word: display, meaning: "")
                w = SavedWord(card: card, origin: "import"); context.insert(w); saved[k] = w
            }
            w.display = display
            w.meaning = d["meaning"] as? String ?? w.meaning
            w.pos = d["pos"] as? String; w.ipa = d["ipa"] as? String
            w.examples = (d["examples"] as? [String]) ?? []
            w.synonyms = (d["synonyms"] as? [String]) ?? []
            w.commonMistake = d["commonMistake"] as? String; w.etymology = d["etymology"] as? String
            w.workSentence = d["workSentence"] as? String; w.context = d["context"] as? String
            if let t = num(d["savedAt"]) { w.addedAt = date(ms: t) }
            w.updatedAt = upd
            if let srs = d["srs"] as? [String: Any] {
                w.ease = max(1.3, num(srs["ease"]) ?? 2.5)
                w.reps = Int(num(srs["reps"]) ?? 0); w.interval = Int(num(srs["interval"]) ?? 0)
                w.lapses = Int(num(srs["lapses"]) ?? 0)
                w.due = date(ms: num(srs["due"]) ?? Date().timeIntervalSince1970 * 1000)
                w.reviewed = w.reps > 0 || num(srs["last"]).map { $0 > 0 } == true
            }
            count += 1
        }

        // writing
        let have = Set(((try? context.fetch(FetchDescriptor<WritingEntry>())) ?? []).map { "\(ms($0.createdAt))|\($0.text)" })
        for raw in (state["writing"] as? [[String: Any]]) ?? [] {
            guard let text = raw["text"] as? String, let at = num(raw["at"]), !have.contains("\(Int(at))|\(text)") else { continue }
            let e = WritingEntry(date: raw["date"] as? String ?? "", prompt: raw["prompt"] as? String ?? "", text: text)
            e.createdAt = date(ms: at); context.insert(e); count += 1
        }
        try context.save()
        return count
    }

    /// Dates of every imported item, so the caller can reload those days and recompute stats.
    static func kind(of id: String) -> String {
        if id.contains(":w:") { return "word" }
        if id.contains(":grammar:") { return "grammar" }
        if id.contains(":speak:") { return "speaking" }
        if id.contains(":concept:") { return "concept" }
        return ""
    }
    private static func datePrefix(_ key: String) -> String {
        let p = String(key.prefix(10))
        return DateText.date(fromKey: p) != nil ? p : ""
    }
}
