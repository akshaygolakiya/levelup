import SwiftUI

/// Slowly shifting mesh background. Solid colour under Reduce Transparency, static under Reduce Motion.
struct MeshBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ZStack {
            DT.bgBase
            if !reduceTransparency {
                if reduceMotion {
                    blobs(t: 0)
                } else {
                    TimelineView(.animation(minimumInterval: 1.0 / 15)) { ctx in
                        blobs(t: ctx.date.timeIntervalSinceReferenceDate)
                    }
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func blobs(t: TimeInterval) -> some View {
        let phase = t / DT.durMesh * 2 * .pi
        if #available(iOS 18, *) {
            MeshGradient(width: 3, height: 3, points: points(phase), colors: [
                DT.meshA, DT.meshB, DT.meshC,
                DT.meshD, DT.meshA, DT.meshB,
                DT.meshC, DT.meshD, DT.meshA
            ])
        } else {
            FallbackBlobs(phase: phase)
        }
    }

    private func points(_ p: Double) -> [SIMD2<Float>] {
        func w(_ base: Float, _ amp: Float, _ k: Double, _ off: Double) -> Float { base + amp * Float(sin(p * k + off)) }
        return [
            [0, 0], [0.5, 0], [1, 0],
            [0, w(0.5, 0.08, 1, 0)], [w(0.5, 0.12, 1, 1), w(0.5, 0.12, 2, 2)], [1, w(0.5, 0.08, 1, 3)],
            [0, 1], [0.5, 1], [1, 1]
        ]
    }
}

private struct FallbackBlobs: View {
    var phase: Double
    var body: some View {
        GeometryReader { g in
            let s = max(g.size.width, g.size.height)
            ZStack {
                blob(DT.meshA, x: 0.2 + 0.1 * sin(phase), y: 0.15 + 0.08 * cos(phase), s: s)
                blob(DT.meshB, x: 0.85 + 0.08 * cos(phase), y: 0.3 + 0.1 * sin(phase * 2), s: s)
                blob(DT.meshC, x: 0.25 + 0.1 * cos(phase * 2), y: 0.8 + 0.06 * sin(phase), s: s)
                blob(DT.meshD, x: 0.8 + 0.06 * sin(phase), y: 0.9 + 0.05 * cos(phase), s: s)
            }
        }
    }
    private func blob(_ c: Color, x: Double, y: Double, s: CGFloat) -> some View {
        RadialGradient(colors: [c, .clear], center: UnitPoint(x: x, y: y), startRadius: 0, endRadius: s * 0.55)
    }
}
