import UserNotifications

/// Optional daily local reminder. Nothing leaves the device.
enum ReminderService {
    private static let id = "levelup.daily"

    /// Returns false when notifications are not allowed.
    @discardableResult
    static func enable(minutesAfterMidnight: Int) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return false }
        center.removePendingNotificationRequests(withIdentifiers: [id])
        let content = UNMutableNotificationContent()
        content.title = "Today's LevelUp is ready"
        content.body = "A few minutes is plenty."
        var comps = DateComponents()
        comps.hour = minutesAfterMidnight / 60
        comps.minute = minutesAfterMidnight % 60
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)
        try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
        return true
    }

    static func disable() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }
}
