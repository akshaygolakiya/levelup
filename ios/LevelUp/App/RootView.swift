import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var app
    @Environment(Preferences.self) private var prefs
    @Environment(\.dynamicTypeSize) private var systemType

    var body: some View {
        @Bindable var app = app
        ZStack {
            MeshBackground()
            TabView(selection: $app.tab) {
                NavigationStack { TodayView() }
                    .tabItem { Label("Today", systemImage: "sun.max") }.tag(AppTab.today)
                NavigationStack { WordsView(focus: nil) }
                    .tabItem { Label("Words", systemImage: "textformat.abc") }.tag(AppTab.words)
                NavigationStack { SpeakingView(focusID: nil) }
                    .tabItem { Label("Speak", systemImage: "mic") }.tag(AppTab.speaking)
                NavigationStack { SavedView() }
                    .tabItem { Label("Saved", systemImage: "bookmark") }.tag(AppTab.saved)
                NavigationStack { WeeklyView() }
                    .tabItem { Label("Weekly", systemImage: "calendar.badge.clock") }.tag(AppTab.weekly)
            }
        }
        .tint(DT.techAccent)
        .preferredColorScheme(prefs.theme.scheme)
        .dynamicTypeSize(prefs.adjusted(systemType))
        .sheet(isPresented: $app.showSettings) { SettingsView() }
        .task { await app.start() }
    }
}
