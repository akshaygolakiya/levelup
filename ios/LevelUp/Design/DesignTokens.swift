import SwiftUI
import UIKit

// Mirrors site/css/tokens.css (same names, same values). Keep in sync by hand.

private extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
                  blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
    }
    static func dynamic(light: UIColor, dark: UIColor) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? dark : light }
    }
}

enum DT {
    // MARK: spacing (4pt grid), radii, sizes
    static let space1: CGFloat = 4, space2: CGFloat = 8, space3: CGFloat = 12, space4: CGFloat = 16
    static let space5: CGFloat = 24, space6: CGFloat = 32, space7: CGFloat = 48
    static let gutter: CGFloat = 16
    static let radiusSm: CGFloat = 10, radiusMd: CGFloat = 16, radiusLg: CGFloat = 24, radiusXl: CGFloat = 32
    static let tapMin: CGFloat = 44
    static let readingWidth: CGFloat = 680

    // MARK: motion
    static let durFast = 0.14, durBase = 0.28, durSlow = 0.52, durMesh = 48.0
    static let spring = Animation.spring(response: 0.42, dampingFraction: 0.82)
    static let springSnappy = Animation.spring(response: 0.3, dampingFraction: 0.78)

    // MARK: UIKit colours (dynamic) so UIKit-backed views follow the theme
    static let uiBgBase = UIColor.dynamic(light: UIColor(hex: 0xeceffa), dark: UIColor(hex: 0x0a0d19))
    static let uiReadingText = UIColor.dynamic(light: UIColor(hex: 0x161a22), dark: UIColor(hex: 0xeceff7))

    // MARK: surfaces
    static let bgBase = Color(uiColor: uiBgBase)
    static let surfaceSolid = Color(uiColor: .dynamic(light: UIColor(hex: 0xf6f7fc), dark: UIColor(hex: 0x151a2b)))
    static let glassBg = Color(uiColor: .dynamic(light: UIColor(hex: 0xffffff, alpha: 0.52), dark: UIColor(hex: 0x1c2138, alpha: 0.50)))
    static let glassBgStrong = Color(uiColor: .dynamic(light: UIColor(hex: 0xffffff, alpha: 0.72), dark: UIColor(hex: 0x181d32, alpha: 0.72)))
    static let glassBgReading = Color(uiColor: .dynamic(light: UIColor(hex: 0xffffff, alpha: 0.90), dark: UIColor(hex: 0x111526, alpha: 0.90)))
    static let glassBorder = Color(uiColor: .dynamic(light: UIColor(hex: 0xffffff, alpha: 0.75), dark: UIColor(hex: 0xffffff, alpha: 0.14)))
    static let borderSubtle = Color(uiColor: .dynamic(light: UIColor(hex: 0x141828, alpha: 0.10), dark: UIColor(hex: 0xffffff, alpha: 0.10)))
    static let glassHighlight = Color(uiColor: .dynamic(light: UIColor(hex: 0xffffff, alpha: 0.85), dark: UIColor(hex: 0xffffff, alpha: 0.10)))
    static let scrim = Color(uiColor: .dynamic(light: UIColor(hex: 0x0f1220, alpha: 0.38), dark: UIColor(hex: 0x000000, alpha: 0.55)))

    // MARK: mesh blobs
    static let meshA = Color(uiColor: .dynamic(light: UIColor(hex: 0x6366f1, alpha: 0.38), dark: UIColor(hex: 0x4f46e5, alpha: 0.48)))
    static let meshB = Color(uiColor: .dynamic(light: UIColor(hex: 0xf472b6, alpha: 0.30), dark: UIColor(hex: 0xbe185d, alpha: 0.30)))
    static let meshC = Color(uiColor: .dynamic(light: UIColor(hex: 0x2dd4bf, alpha: 0.26), dark: UIColor(hex: 0x0d9488, alpha: 0.28)))
    static let meshD = Color(uiColor: .dynamic(light: UIColor(hex: 0xfbbf24, alpha: 0.20), dark: UIColor(hex: 0x1e40af, alpha: 0.34)))

    // MARK: text
    static let text = Color(uiColor: .dynamic(light: UIColor(hex: 0x14181f), dark: UIColor(hex: 0xeef1f8)))
    static let textMuted = Color(uiColor: .dynamic(light: UIColor(hex: 0x4a5263), dark: UIColor(hex: 0xb7bfd1)))
    static let textFaint = Color(uiColor: .dynamic(light: UIColor(hex: 0x646d7e), dark: UIColor(hex: 0x98a2b8)))
    static let readingText = Color(uiColor: uiReadingText)
    static let onAccent = Color.white

    // MARK: accents (Tech = indigo, English = rose)
    static let techAccent = Color(uiColor: UIColor(hex: 0x4a57e0))
    static let englishAccent = Color(uiColor: UIColor(hex: 0xc2255f))
    static let techInk = Color(uiColor: .dynamic(light: UIColor(hex: 0x3640b8), dark: UIColor(hex: 0xaeb7ff)))
    static let englishInk = Color(uiColor: .dynamic(light: UIColor(hex: 0xa81c52), dark: UIColor(hex: 0xffa3c2)))
    static let techSoft = Color(uiColor: .dynamic(light: UIColor(hex: 0x4a57e0, alpha: 0.14), dark: UIColor(hex: 0x818cf8, alpha: 0.20)))
    static let englishSoft = Color(uiColor: .dynamic(light: UIColor(hex: 0xc2255f, alpha: 0.12), dark: UIColor(hex: 0xf472b6, alpha: 0.18)))

    static let success = Color(uiColor: .dynamic(light: UIColor(hex: 0x12794a), dark: UIColor(hex: 0x5fd9a0)))
    static let successSoft = Color(uiColor: .dynamic(light: UIColor(hex: 0x12794a, alpha: 0.14), dark: UIColor(hex: 0x5fd9a0, alpha: 0.16)))
    static let fillerBg = Color(uiColor: .dynamic(light: UIColor(hex: 0xf59e0b, alpha: 0.32), dark: UIColor(hex: 0xfbbf24, alpha: 0.34)))
    static let flame = Color(uiColor: .dynamic(light: UIColor(hex: 0xf97316), dark: UIColor(hex: 0xfb923c)))

    static func accent(_ t: Track) -> Color { t == .tech ? techAccent : englishAccent }
    static func ink(_ t: Track) -> Color { t == .tech ? techInk : englishInk }
    static func soft(_ t: Track) -> Color { t == .tech ? techSoft : englishSoft }
}
