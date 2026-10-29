import SwiftUI

/// Calendar of every available day. Tap a day to open it on Today.
struct ArchiveView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    private struct Month: Identifiable { var id: String; var first: Date; var days: Set<String> }

    private var months: [Month] {
        var map: [String: Month] = [:]
        for d in app.repo.dates {
            guard let date = DateText.date(fromKey: d) else { continue }
            let key = String(d.prefix(7))
            let comps = Calendar.current.dateComponents([.year, .month], from: date)
            let first = Calendar.current.date(from: comps) ?? date
            map[key, default: Month(id: key, first: first, days: [])].days.insert(d)
        }
        return map.values.sorted { $0.id > $1.id }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space5) {
                if months.isEmpty {
                    EmptyStateView(symbol: "calendar", title: "No days yet",
                                   message: "Every day stays here once it has been published. Nothing expires.")
                }
                ForEach(months) { month in monthView(month) }
            }
            .padding(DT.gutter)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Archive")
        .navigationBarTitleDisplayMode(.inline)
        .background(MeshBackground())
    }

    private func monthView(_ m: Month) -> some View {
        let cal = Calendar.current
        let range = cal.range(of: .day, in: .month, for: m.first) ?? 1..<31
        let lead = (cal.component(.weekday, from: m.first) - cal.firstWeekday + 7) % 7
        let symbols = (0..<7).map { cal.veryShortWeekdaySymbols[(cal.firstWeekday - 1 + $0) % 7] }
        return VStack(alignment: .leading, spacing: DT.space3) {
            Text(m.first.formatted(.dateTime.month(.wide).year())).font(.headline).foregroundStyle(DT.text)
                .accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(Array(symbols.enumerated()), id: \.offset) { _, s in
                    Text(s).font(.caption2).foregroundStyle(DT.textMuted)
                }
                ForEach(0..<lead, id: \.self) { _ in Color.clear.frame(height: DT.tapMin) }
                ForEach(Array(range), id: \.self) { day in
                    let key = m.id + "-" + String(format: "%02d", day)
                    cell(day, key, available: m.days.contains(key))
                }
            }
        }
        .padding(DT.space4)
        .glass(.card, radius: DT.radiusLg)
    }

    @ViewBuilder
    private func cell(_ day: Int, _ key: String, available: Bool) -> some View {
        if available {
            let stat = app.progress.stat(key)
            let selected = key == app.selectedDate
            Button {
                Haptics.tap()
                app.open(date: key)
                dismiss()
            } label: {
                VStack(spacing: 2) {
                    Text("\(day)").font(.subheadline.weight(.semibold))
                    Image(systemName: stat.isComplete ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 8)).opacity(stat.isComplete ? 1 : 0.35)
                }
                .foregroundStyle(selected ? DT.onAccent : DT.text)
                .frame(maxWidth: .infinity, minHeight: DT.tapMin)
                .background(RoundedRectangle(cornerRadius: DT.radiusSm, style: .continuous)
                    .fill(selected ? DT.techAccent : DT.techSoft))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(key)\(stat.isComplete ? ", completed" : "")")
        } else {
            Text("\(day)").font(.subheadline).foregroundStyle(DT.textFaint.opacity(0.7))
                .frame(maxWidth: .infinity, minHeight: DT.tapMin)
                .accessibilityHidden(true)
        }
    }
}
