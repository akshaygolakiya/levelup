import SwiftUI

struct ItemRow: View {
    var ref: ItemRef
    var status: ItemStatus

    var body: some View {
        HStack(spacing: DT.space3) {
            ZStack {
                Circle().fill(DT.soft(ref.track))
                Image(systemName: status.isResolved ? "checkmark" : (status.isSkipped ? "arrow.uturn.backward" : ref.kind.symbol))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(status.isResolved ? DT.success : DT.ink(ref.track))
            }
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(ref.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(DT.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text("\(ref.kind.label)  ·  \(ref.minutesLabel)" + (status == .inProgress ? "  ·  in progress" : ""))
                    .font(.caption)
                    .foregroundStyle(DT.textMuted)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(DT.textFaint)
        }
        .padding(.horizontal, DT.space4).padding(.vertical, DT.space3)
        .frame(minHeight: DT.tapMin)
        .contentShape(Rectangle())
        .opacity(status.isResolved || status.isSkipped ? 0.7 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(ref.kind.label): \(ref.title), \(ref.capped ? "over 20 minutes" : "\(ref.minutes) minutes")\(status.isResolved ? ", finished" : (status.isSkipped ? ", skipped" : ""))")
    }
}

/// Glass list container with dividers between rows.
struct RowGroup<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) { content }.glass(.card, radius: DT.radiusLg)
    }
}
