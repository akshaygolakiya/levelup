import Foundation

/// Stable (non-randomised) id from text, used when the JSON has no id.
enum StableID {
    static func make(_ s: String) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        for b in s.utf8 { h ^= UInt64(b); h = h &* 0x100000001b3 }
        return String(h, radix: 16)
    }
}

/// Dynamic coding key so models can read any key without enums.
struct AnyKey: CodingKey, ExpressibleByStringLiteral {
    var stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
    init(stringLiteral value: String) { stringValue = value }
}

/// Element wrapper that turns a bad element into nil instead of failing the whole array.
struct Lossy<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

extension KeyedDecodingContainer where Key == AnyKey {
    /// Optional value; wrong type or missing key both give nil.
    func opt<T: Decodable>(_ key: AnyKey) -> T? {
        (try? decodeIfPresent(T.self, forKey: key)) ?? nil
    }

    /// Array that drops malformed elements and is empty when missing.
    func list<T: Decodable>(_ key: AnyKey) -> [T] {
        guard let items = try? decodeIfPresent([Lossy<T>].self, forKey: key) else { return [] }
        return items.compactMap(\.value)
    }

    /// Strings; also accepts a single string.
    func strings(_ key: AnyKey) -> [String] {
        let many: [String] = list(key)
        if !many.isEmpty { return many }
        if let one: String = opt(key), !one.isEmpty { return [one] }
        return []
    }

    func int(_ key: AnyKey, default def: Int) -> Int {
        if let i: Int = opt(key) { return i }
        if let d: Double = opt(key) { return Int(d) }
        if let s: String = opt(key), let i = Int(s) { return i }
        return def
    }

    /// Array under any of the keys, or a single object under the key.
    func oneOrMany<T: Decodable>(_ keys: [AnyKey]) -> [T] {
        for k in keys {
            let l: [T] = list(k)
            if !l.isEmpty { return l }
            if let one: T = opt(k) { return [one] }
        }
        return []
    }

    func firstString(_ keys: [AnyKey]) -> String? {
        for k in keys { if let s: String = opt(k), !s.isEmpty { return s } }
        return nil
    }
}

enum DateText {
    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let iso = ISO8601DateFormatter()
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    static func parse(_ s: String) -> Date? {
        isoFrac.date(from: s) ?? iso.date(from: s) ?? dayFormatter.date(from: String(s.prefix(10)))
    }

    /// "28 Oct 2026" from an ISO timestamp; nil if unparseable.
    static func short(_ s: String?) -> String? {
        guard let s, let d = parse(s) else { return nil }
        return d.formatted(.dateTime.day().month(.abbreviated).year())
    }

    static func dayKey(_ d: Date) -> String { dayFormatter.string(from: d) }
    static func date(fromKey k: String) -> Date? { dayFormatter.date(from: k) }

    static func daysBetween(_ a: String, _ b: String) -> Int? {
        guard let da = date(fromKey: a), let db = date(fromKey: b) else { return nil }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: da, to: db).day
    }
}
