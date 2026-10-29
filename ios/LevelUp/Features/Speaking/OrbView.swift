import SwiftUI

/// Glass orb that swells with the microphone level and breathes gently while listening.
struct OrbView: View {
    var level: CGFloat
    var active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @State private var breathe = false

    var body: some View {
        let scale = 1 + (reduceMotion ? 0 : level * 0.45) + (active && breathe && !reduceMotion ? 0.04 : 0)
        ZStack {
            Circle()
                .fill(LinearGradient(colors: [DT.englishAccent, DT.techAccent], startPoint: .topLeading, endPoint: .bottomTrailing))
                .opacity(reduceTransparency ? 1 : (active ? 0.85 : 0.55))
            if !reduceTransparency {
                Circle().fill(.ultraThinMaterial).opacity(0.35)
                Circle().strokeBorder(DT.glassBorder, lineWidth: 1.5)
            }
            Image(systemName: active ? "waveform" : "mic.fill")
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(DT.onAccent)
                .symbolEffect(.variableColor.iterative, isActive: active && !reduceMotion)
        }
        .frame(width: 148, height: 148)
        .scaleEffect(scale)
        .shadow(color: DT.englishAccent.opacity(active ? 0.35 : 0.15), radius: 24 + level * 20, y: 8)
        .animation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.6), value: level)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) { breathe = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(active ? "Listening" : "Microphone")
        .frame(height: 190)
    }
}
