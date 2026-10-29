import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var app
    @Environment(Preferences.self) private var prefsEnv
    @State private var catchDays: [DayContent] = []
    @State private var catchOpen = false
    @State private var moreOpen = false
    @State private var skippedOpen = false

    private var day: DayContent? { app.repo.days[app.selectedDate] }

    var body: some View {
        @Bindable var prefs = prefsEnv
        ScrollView {
            VStack(alignment: .leading, spacing: DT.space4) {
                header
                DayStrip()
                if let day {
                    let plan = Planner.plan(day)
                    let split = Planner.split(plan, box: prefs.timebox)
                    ringsCard(plan)
                    continueCard(split)
                    Picker("Time available", selection: $prefs.timebox) {
                        ForEach(Timebox.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityLabel("Time available")
                    section("Your plan", split.today)
                    if !split.more.isEmpty { moreSection(split.more) }
                    skippedTray(plan)
                    catchUpSection
                } else if app.repo.isLoading || app.repo.dates.isEmpty && app.selectedDate.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(DT.space6)
                } else {
                    EmptyStateView(symbol: "tray", title: "Nothing here yet",
                                   message: app.repo.statusMessage ?? "Pull down to refresh. New content appears once the daily job has run.")
                }
            }
            .padding(.horizontal, DT.gutter)
            .padding(.bottom, DT.space6)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await app.start() }
        .background(MeshBackground())
        .navigationTitle("Today")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink { ArchiveView() } label: { Image(systemName: "calendar") }
                    .accessibilityLabel("Archive")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { app.showSettings = true } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Settings")
            }
        }
        .navigationDestination(for: ItemRef.self) { ItemDestination(ref: $0) }
        .task(id: "\(app.selectedDate)|\(prefsEnv.catchUpDays)|\(app.repo.dates.count)") {
            guard !app.selectedDate.isEmpty else { return }
            if let d = await app.repo.day(app.selectedDate) { app.progress.recompute(date: d.date) }
            await loadCatchUp()
        }
    }

    // MARK: pieces

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titleDate).font(.title2.weight(.bold)).foregroundStyle(DT.text)
                if app.selectedDate != AppModel.todayKey, !app.selectedDate.isEmpty {
                    Text("From the archive").font(.footnote).foregroundStyle(DT.textMuted)
                }
            }
            Spacer()
            if app.streak > 0 {
                Label("\(app.streak)", systemImage: "flame.fill")
                    .font(.headline).foregroundStyle(DT.flame)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .glass(.card, radius: 20)
                    .accessibilityLabel("Streak: \(app.streak) days")
            }
        }
        .padding(.top, DT.space2)
    }

    private var titleDate: String {
        guard let d = DateText.date(fromKey: app.selectedDate) else { return "Today" }
        return d.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    private func ringsCard(_ plan: DayPlan) -> some View {
        let c = Planner.counts(plan) { app.progress.status($0) }
        return HStack(spacing: DT.space4) {
            ringBlock(.tech, "Tech", c.techDone, c.techTotal, c.techProgress)
            ringBlock(.english, "English", c.englishDone, c.englishTotal, c.englishProgress)
        }
        .padding(DT.space4)
        .glass(.card, radius: DT.radiusXl)
    }

    private func ringBlock(_ t: Track, _ name: String, _ done: Int, _ total: Int, _ p: Double) -> some View {
        VStack(spacing: DT.space2) {
            ZStack {
                ProgressRing(progress: p, track: t, lineWidth: 12)
                VStack(spacing: 0) {
                    Text("\(done)/\(total)").font(.title3.weight(.bold)).foregroundStyle(DT.text)
                    Text("done").font(.caption2).foregroundStyle(DT.textMuted)
                }
            }
            .frame(width: 104, height: 104)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)   // text inside a fixed ring cannot grow without overflowing
            Text(name).font(.subheadline.weight(.semibold)).foregroundStyle(DT.ink(t))
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name): \(done) of \(total) finished")
    }

    @ViewBuilder
    private func continueCard(_ split: (today: [ItemRef], more: [ItemRef])) -> some View {
        let next = (split.today + split.more).first { app.progress.status($0).isPending }
        if let next {
            let hasStarted = (split.today + split.more).contains { app.progress.status($0) != .unread }
            NavigationLink(value: next) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hasStarted ? "Continue" : "Start").font(.headline)
                        Text(next.title).font(.footnote).lineLimit(1).opacity(0.9)
                    }
                    Spacer()
                    Image(systemName: "arrow.right.circle.fill").font(.title2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(AccentButtonStyle(accent: DT.accent(next.track)))
            .accessibilityHint("Opens \(next.kind.label): \(next.title)")
        } else {
            Label("All done for today. Nice work.", systemImage: "checkmark.seal.fill")
                .font(.headline).foregroundStyle(DT.success)
                .frame(maxWidth: .infinity).padding(DT.space4)
                .glass(.card, radius: DT.radiusLg)
        }
    }

    private func section(_ title: String, _ items: [ItemRef]) -> some View {
        VStack(alignment: .leading, spacing: DT.space2) {
            Text(title).font(.headline).foregroundStyle(DT.text).accessibilityAddTraits(.isHeader)
            RowGroup {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, ref in
                    NavigationLink(value: ref) { ItemRow(ref: ref, status: app.progress.status(ref)) }
                        .buttonStyle(.plain)
                    if i < items.count - 1 { Divider().padding(.leading, 60) }
                }
            }
        }
    }

    /// Skipped items wait here, collapsed, until brought back. They count for nothing and never nag.
    @ViewBuilder
    private func skippedTray(_ plan: DayPlan) -> some View {
        let skipped = plan.all.filter { app.progress.status($0).isSkipped }
        if !skipped.isEmpty {
            DisclosureGroup(isExpanded: $skippedOpen) {
                RowGroup {
                    ForEach(Array(skipped.enumerated()), id: \.element.id) { i, ref in
                        HStack(spacing: 0) {
                            NavigationLink(value: ref) { ItemRow(ref: ref, status: .skipped) }.buttonStyle(.plain)
                            Button("Bring back") {
                                Haptics.tap()
                                app.progress.markUnread(ref)
                            }
                            .font(.footnote.weight(.semibold))
                            .padding(.trailing, DT.space3)
                            .frame(minHeight: DT.tapMin)
                            .accessibilityLabel("Bring back \(ref.title)")
                        }
                        if i < skipped.count - 1 { Divider().padding(.leading, 60) }
                    }
                }
                .padding(.top, DT.space2)
            } label: {
                Text("Skipped (\(skipped.count))").font(.headline).foregroundStyle(DT.text)
            }
            .tint(DT.textMuted)
        }
    }

    private func moreSection(_ items: [ItemRef]) -> some View {
        DisclosureGroup(isExpanded: $moreOpen) {
            RowGroup {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, ref in
                    NavigationLink(value: ref) { ItemRow(ref: ref, status: app.progress.status(ref)) }
                        .buttonStyle(.plain)
                    if i < items.count - 1 { Divider().padding(.leading, 60) }
                }
            }
            .padding(.top, DT.space2)
        } label: {
            Text("More for today").font(.headline).foregroundStyle(DT.text)
        }
        .tint(DT.textMuted)
    }

    // MARK: catch up

    private var catchUpGroups: [(day: DayContent, items: [ItemRef])] {
        catchDays.compactMap { d in
            let items = Planner.plan(d).core.filter { app.progress.status($0).isPending }
            return items.isEmpty ? nil : (d, items)
        }
    }

    @ViewBuilder
    private var catchUpSection: some View {
        let groups = catchUpGroups
        if !groups.isEmpty {
            DisclosureGroup(isExpanded: $catchOpen) {
                VStack(alignment: .leading, spacing: DT.space3) {
                    ForEach(groups, id: \.day.date) { g in
                        VStack(alignment: .leading, spacing: DT.space2) {
                            Text("\(dayLabel(g.day.date))  ·  about \(g.items.map(\.minutes).reduce(0, +)) min")
                                .font(.subheadline.weight(.semibold)).foregroundStyle(DT.textMuted)
                            RowGroup {
                                ForEach(Array(g.items.enumerated()), id: \.element.id) { i, ref in
                                    NavigationLink(value: ref) { ItemRow(ref: ref, status: app.progress.status(ref)) }
                                        .buttonStyle(.plain)
                                    if i < g.items.count - 1 { Divider().padding(.leading, 60) }
                                }
                            }
                        }
                    }
                }
                .padding(.top, DT.space2)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Catch up").font(.headline).foregroundStyle(DT.text)
                    Text("Optional. Skipping costs nothing.").font(.caption).foregroundStyle(DT.textMuted)
                }
            }
            .tint(DT.textMuted)
        }
    }

    private func dayLabel(_ date: String) -> String {
        guard let d = DateText.date(fromKey: date) else { return date }
        if let diff = DateText.daysBetween(date, app.selectedDate), diff == 1 { return "Yesterday" }
        return d.formatted(.dateTime.weekday(.wide).day().month(.abbreviated))
    }

    private func loadCatchUp() async {
        let n = prefsEnv.catchUpDays
        guard n > 0 else { catchDays = []; return }
        var out: [DayContent] = []
        for d in app.repo.dates where d < app.selectedDate {
            guard let diff = DateText.daysBetween(d, app.selectedDate), diff >= 1, diff <= n else { continue }
            if let day = await app.repo.day(d) { out.append(day) }
        }
        catchDays = out
    }
}

/// Horizontal strip of the most recent days; tap one to open it.
struct DayStrip: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let dates = Array(app.repo.dates.prefix(21))
        if dates.count > 1 {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: DT.space2) {
                        ForEach(dates.reversed(), id: \.self) { d in chip(d).id(d) }
                    }
                    .padding(.vertical, 2)
                }
                .onAppear { proxy.scrollTo(app.selectedDate, anchor: .trailing) }
            }
        }
    }

    private func chip(_ d: String) -> some View {
        let date = DateText.date(fromKey: d) ?? Date()
        let selected = d == app.selectedDate
        let complete = app.progress.stat(d).isComplete
        return Button {
            Haptics.tap()
            withAnimation(DT.springSnappy) { app.selectedDate = d }
        } label: {
            VStack(spacing: 2) {
                Text(date.formatted(.dateTime.weekday(.abbreviated))).font(.caption2)
                Text(date.formatted(.dateTime.day())).font(.headline)
                Image(systemName: complete ? "checkmark.circle.fill" : "circle.fill")
                    .font(.system(size: 6)).opacity(complete ? 1 : 0.25)
            }
            .foregroundStyle(selected ? DT.onAccent : DT.text)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .frame(minWidth: 48, minHeight: 64)
            .background(RoundedRectangle(cornerRadius: DT.radiusMd, style: .continuous).fill(selected ? DT.techAccent : Color.clear))
            .glass(.card, radius: DT.radiusMd, tint: selected ? DT.techAccent : nil)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(date.formatted(.dateTime.weekday(.wide).day().month(.wide)) + (complete ? ", completed" : ""))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
