import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(Preferences.self) private var prefsEnv
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var exportURL: ExportFile?
    @State private var importing = false
    @State private var message: String?
    @State private var applying = false
    @State private var reminderNote: String?

    var body: some View {
        @Bindable var prefs = prefsEnv
        NavigationStack {
            List {
                Section {
                    TextField("https://your-site.pages.dev", text: $prefs.baseURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .frame(minHeight: DT.tapMin)
                    Button(applying ? "Loading…" : "Apply and refresh") {
                        applying = true
                        Task { await app.applyBaseURL(); applying = false; message = sourceDescription }
                    }
                    .frame(minHeight: DT.tapMin)
                    Text(sourceDescription).font(.footnote).foregroundStyle(DT.textMuted)
                } header: { Text("Content source") } footer: {
                    Text("Leave empty to use the content bundled with the app. Days you open are cached for offline use.")
                }
                .listRowBackground(rowBackground)

                Section("Appearance") {
                    Picker("Theme", selection: $prefs.theme) {
                        ForEach(ThemeChoice.allCases) { Text($0.label).tag($0) }
                    }
                    Stepper(value: $prefs.textStep, in: -2...3) {
                        Text("Text size: \(sizeLabel)")
                    }
                    Toggle("Serif reading font", isOn: $prefs.serifReading)
                }
                .listRowBackground(rowBackground)

                Section {
                    Stepper(value: $prefs.catchUpDays, in: 0...7) {
                        Text(prefs.catchUpDays == 0 ? "Catch up: off" : "Catch up window: \(prefs.catchUpDays) days")
                    }
                } header: { Text("Catch up") } footer: {
                    Text("Unfinished light-core items from earlier days appear under Today. They are optional and never counted against you.")
                }
                .listRowBackground(rowBackground)

                Section {
                    Toggle("Daily reminder", isOn: Binding(get: { prefs.reminderEnabled }, set: { setReminder($0) }))
                    if prefs.reminderEnabled {
                        DatePicker("Time", selection: reminderTime, displayedComponents: .hourAndMinute)
                    }
                } header: { Text("Reminder") } footer: {
                    Text(reminderNote ?? "A local notification on this device. Nothing is sent anywhere.")
                }
                .listRowBackground(rowBackground)

                Section {
                    Button("Export progress as JSON") { export() }.frame(minHeight: DT.tapMin)
                    Button("Import progress from JSON") { importing = true }.frame(minHeight: DT.tapMin)
                } header: { Text("Progress") } footer: {
                    Text("Same file format as the web app, so progress can move between the two. Read state, kept cards, saved words and review schedule, and writing entries. Recordings are not included.")
                }
                .listRowBackground(rowBackground)

                if let message {
                    Section { Text(message).font(.footnote) }.listRowBackground(rowBackground)
                }
                Section("About") {
                    Text("LevelUp. Personal use. No ads, no analytics, no accounts. Progress stays on this device.")
                        .font(.footnote).foregroundStyle(DT.textMuted)
                }
                .listRowBackground(rowBackground)
            }
            .scrollContentBackground(.hidden)
            .background(MeshBackground())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(item: $exportURL) { f in ShareSheet(url: f.url).presentationDetents([.medium, .large]) }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in importFile(result) }
        }
    }

    // MARK: helpers

    private var rowBackground: some View { Rectangle().fill(.ultraThinMaterial) }

    private var sourceDescription: String {
        if app.repo.usingRemote, let host = URL(string: prefsEnv.baseURL)?.host { return "Reading from \(host)" }
        if !prefsEnv.baseURL.isEmpty { return "That is not a valid http(s) address. Using bundled content." }
        return "Using bundled content."
    }

    private var sizeLabel: String {
        switch prefsEnv.textStep {
        case ..<0: "Smaller"
        case 0: "System"
        default: "Larger"
        }
    }

    private var reminderTime: Binding<Date> {
        Binding {
            Calendar.current.date(bySettingHour: prefsEnv.reminderMinutes / 60, minute: prefsEnv.reminderMinutes % 60, second: 0, of: Date()) ?? Date()
        } set: { d in
            let c = Calendar.current.dateComponents([.hour, .minute], from: d)
            prefsEnv.reminderMinutes = (c.hour ?? 8) * 60 + (c.minute ?? 0)
            Task { await ReminderService.enable(minutesAfterMidnight: prefsEnv.reminderMinutes) }
        }
    }

    private func setReminder(_ on: Bool) {
        if on {
            Task {
                let ok = await ReminderService.enable(minutesAfterMidnight: prefsEnv.reminderMinutes)
                prefsEnv.reminderEnabled = ok
                reminderNote = ok ? nil : "Notifications are off for LevelUp. Turn them on in iOS Settings, then Notifications, then LevelUp."
            }
        } else {
            prefsEnv.reminderEnabled = false
            reminderNote = nil
            ReminderService.disable()
        }
    }

    private func export() {
        do {
            let data = try ProgressTransfer.export(context: context, prefs: prefsEnv)
            let name = "levelup-progress-\(DateText.dayKey(Date())).json"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try data.write(to: url, options: .atomic)
            exportURL = ExportFile(url: url)
        } catch {
            message = "Export failed: \(error.localizedDescription)"
        }
    }

    private func importFile(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let n = try ProgressTransfer.importData(Data(contentsOf: url), context: context)
            message = "Imported \(n) records."
            Task {
                for d in app.repo.dates { _ = await app.repo.day(d) }
                app.progress.reload()
            }
        } catch {
            message = "Import failed: \(error.localizedDescription)"
        }
    }
}

private struct ExportFile: Identifiable {
    let url: URL
    var id: String { url.path }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
