import SwiftUI
import SwiftData

@main
struct LevelUpApp: App {
    private let container: ModelContainer
    @State private var model: AppModel

    init() {
        LaunchConfig.current.prepare()
        let c = AppSchema.makeContainer()
        container = c
        _model = State(initialValue: AppModel(container: c))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(model.prefs)
                .modelContainer(container)
        }
    }
}
