import SwiftUI

enum ThemeChoice: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var scheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

/// User settings, persisted in UserDefaults. Empty baseURL means "use the bundled copy".
@Observable @MainActor
final class Preferences {
    private let defaults: UserDefaults

    var baseURL: String { didSet { defaults.set(baseURL, forKey: "baseURL") } }
    var theme: ThemeChoice { didSet { defaults.set(theme.rawValue, forKey: "theme") } }
    /// Offset in Dynamic Type steps applied on top of the system size (-2 ... +3).
    var textStep: Int { didSet { defaults.set(textStep, forKey: "textStep") } }
    var serifReading: Bool { didSet { defaults.set(serifReading, forKey: "serif") } }
    var catchUpDays: Int { didSet { defaults.set(catchUpDays, forKey: "catchUpDays") } }
    var timebox: Timebox { didSet { defaults.set(timebox.rawValue, forKey: "timebox") } }
    var reminderEnabled: Bool { didSet { defaults.set(reminderEnabled, forKey: "reminderOn") } }
    var reminderMinutes: Int { didSet { defaults.set(reminderMinutes, forKey: "reminderMin") } }  // minutes after midnight

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        baseURL = defaults.string(forKey: "baseURL") ?? ""
        theme = ThemeChoice(rawValue: defaults.string(forKey: "theme") ?? "") ?? .system
        textStep = defaults.object(forKey: "textStep") as? Int ?? 0
        serifReading = defaults.bool(forKey: "serif")
        catchUpDays = defaults.object(forKey: "catchUpDays") as? Int ?? 3
        timebox = Timebox(rawValue: defaults.string(forKey: "timebox") ?? "") ?? .standard
        reminderEnabled = defaults.bool(forKey: "reminderOn")
        reminderMinutes = defaults.object(forKey: "reminderMin") as? Int ?? 8 * 60
    }

    func adjusted(_ base: DynamicTypeSize) -> DynamicTypeSize {
        let all = DynamicTypeSize.allCases
        guard let i = all.firstIndex(of: base) else { return base }
        return all[min(max(i + textStep, 0), all.count - 1)]
    }
}
