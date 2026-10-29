import SwiftUI

enum GlassLevel { case chrome, card, reading }

/// Frosted surface. Reading level is much more opaque to keep long text at AA contrast.
/// Reduce Transparency gives flat solid surfaces; iOS 26 uses the system glass for chrome and cards.
struct GlassModifier: ViewModifier {
    var level: GlassLevel
    var radius: CGFloat
    var tint: Color?
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        if reduceTransparency {
            content
                .background(shape.fill(DT.surfaceSolid))
                .overlay(shape.strokeBorder(DT.borderSubtle, lineWidth: 1))
        } else if level != .reading, #available(iOS 26, *) {
            content.glassEffect(tint.map { Glass.regular.tint($0.opacity(0.18)) } ?? .regular, in: shape)
        } else {
            let material: Material = level == .reading ? .regularMaterial : .ultraThinMaterial
            content
                .background {
                    shape.fill(material)
                    shape.fill(level == .reading ? DT.glassBgReading : (level == .chrome ? DT.glassBgStrong : DT.glassBg))
                    if let tint { shape.fill(tint.opacity(0.10)) }
                }
                .overlay(shape.strokeBorder(DT.glassBorder, lineWidth: 1))
                .overlay(alignment: .top) {
                    shape.strokeBorder(LinearGradient(colors: [DT.glassHighlight, .clear], startPoint: .top, endPoint: .center), lineWidth: 1)
                        .allowsHitTesting(false)
                }
                .shadow(color: .black.opacity(0.10), radius: 16, x: 0, y: 8)
        }
    }
}

extension View {
    func glass(_ level: GlassLevel = .card, radius: CGFloat = DT.radiusLg, tint: Color? = nil) -> some View {
        modifier(GlassModifier(level: level, radius: radius, tint: tint))
    }
}

/// Filled accent button, at least 44pt tall.
struct AccentButtonStyle: ButtonStyle {
    var accent: Color = DT.techAccent
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)   // wrap rather than truncate at large text sizes
            .foregroundStyle(DT.onAccent)
            .padding(.horizontal, DT.space5).padding(.vertical, DT.space3)
            .frame(minHeight: DT.tapMin)
            .background(Capsule().fill(accent))
            .opacity(enabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(DT.springSnappy, value: configuration.isPressed)
    }
}

/// Quiet glass button for secondary actions.
struct SoftButtonStyle: ButtonStyle {
    var tint: Color = DT.techInk
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(tint)
            .padding(.horizontal, DT.space4).padding(.vertical, DT.space2)
            .frame(minHeight: DT.tapMin)
            .glass(.card, radius: 22)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(DT.springSnappy, value: configuration.isPressed)
    }
}

struct Chip: View {
    var text: String
    var symbol: String?
    var track: Track?
    var body: some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol).imageScale(.small) }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(track.map(DT.ink) ?? DT.textMuted)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Capsule().fill(track.map(DT.soft) ?? DT.borderSubtle))
    }
}

struct ProgressRing: View {
    var progress: Double
    var track: Track
    var lineWidth: CGFloat = 12
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle().stroke(DT.soft(track), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, progress)))
                .stroke(DT.accent(track), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : DT.spring, value: progress)
        }
    }
}

enum Haptics {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warn() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}

struct EmptyStateView: View {
    var symbol: String
    var title: String
    var message: String
    var body: some View {
        VStack(spacing: DT.space3) {
            Image(systemName: symbol).font(.largeTitle).foregroundStyle(DT.textFaint)
            Text(title).font(.headline).foregroundStyle(DT.text)
            Text(message).font(.subheadline).foregroundStyle(DT.textMuted).multilineTextAlignment(.center)
        }
        .padding(DT.space5)
        .frame(maxWidth: .infinity)
        .glass(.card)
        .accessibilityElement(children: .combine)
    }
}
