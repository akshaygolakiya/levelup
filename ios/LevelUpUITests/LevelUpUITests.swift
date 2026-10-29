import XCTest

/// End-to-end checks driven by launch arguments (see LaunchConfig in the app).
/// Env (via TEST_RUNNER_ prefix): LU_TAG screenshot prefix, LU_ARGS extra launch args, LU_LANDSCAPE=1.
final class LevelUpUITests: XCTestCase {
    let shotDir = "/Users/akshaygolakiya/Documents/native-apps/levelup/tests/screens/ios"
    var app: XCUIApplication!
    var tag: String { ProcessInfo.processInfo.environment["LU_TAG"] ?? "run" }

    override func setUp() {
        continueAfterFailure = true
        try? FileManager.default.createDirectory(atPath: shotDir, withIntermediateDirectories: true)
    }

    // MARK: helpers

    @discardableResult
    func launch(_ args: [String], terminateFirst: Bool = true) -> XCUIApplication {
        if app != nil, terminateFirst { app.terminate() }
        let a = XCUIApplication()
        var all = args
        if let extra = ProcessInfo.processInfo.environment["LU_ARGS"], !extra.isEmpty { all += extra.split(separator: " ").map(String.init) }
        a.launchArguments = all
        if ProcessInfo.processInfo.environment["LU_LANDSCAPE"] == "1" { XCUIDevice.shared.orientation = .landscapeLeft }
        else { XCUIDevice.shared.orientation = .portrait }
        a.launch()
        app = a
        return a
    }

    func shot(_ name: String) {
        let s = XCUIScreen.main.screenshot()
        try? s.pngRepresentation.write(to: URL(fileURLWithPath: "\(shotDir)/\(tag)-\(name).png"))
        let att = XCTAttachment(screenshot: s); att.name = name; att.lifetime = .keepAlways; add(att)
    }

    func el(_ label: String, in q: XCUIElementQuery? = nil, prefix: Bool = false) -> XCUIElement {
        let pred = NSPredicate(format: prefix ? "label BEGINSWITH %@" : "label == %@", label)
        return (q ?? app.descendants(matching: .any)).matching(pred).firstMatch
    }
    func button(_ label: String, prefix: Bool = false) -> XCUIElement { el(label, in: app.buttons, prefix: prefix) }
    func text(_ contains: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", contains)).firstMatch
    }
    @discardableResult func tapIf(_ e: XCUIElement, wait: TimeInterval = 4) -> Bool {
        if e.waitForExistence(timeout: wait) { e.tap(); return true }
        return false
    }
    func tab(_ name: String) { app.tabBars.buttons[name].tap() }
    func back() { app.navigationBars.buttons.element(boundBy: 0).tap() }
    func waitToday() {
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start' OR label BEGINSWITH 'Continue'")).firstMatch.waitForExistence(timeout: 15)
                      || app.staticTexts["Nothing here yet"].exists, "Today did not render")
    }

    // MARK: F1 / F2 / F4

    func testF1_emptyStoreBundled() {
        launch(["-resetState", "-memoryStore"])
        waitToday()
        XCTAssertTrue(text("October 29").waitForExistence(timeout: 5) || text("29 October").exists)
        XCTAssertTrue(app.otherElements.matching(NSPredicate(format: "label BEGINSWITH 'Tech:'")).firstMatch.exists)
        XCTAssertTrue(text("Your plan").exists)
        shot("f1-today")
    }

    func testF2_badRemoteFallsBackToBundled() {
        for (i, url) in ["http://127.0.0.1:9", "ht!tp://not a url", "https://example.invalid"].enumerated() {
            launch(["-resetState", "-memoryStore", "-mockBaseURL", url])
            waitToday()
            XCTAssertTrue(text("Your plan").waitForExistence(timeout: 8), "bundled fallback failed for \(url)")
            if i == 0 { shot("f2-badremote-today") }
        }
        // Settings explains the source.
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 4))
        shot("f2-settings-source")
    }

    func testF4_missingSectionsDoNotCrash() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "missing"])
        waitToday()
        shot("f4-missing-today")
        // The bare quick read still shows (no url => no link, but no crash).
        if tapIf(el("Quick read:", in: app.buttons, prefix: true)) {
            XCTAssertTrue(text("Original link unavailable").waitForExistence(timeout: 4) || button("Read full article").exists)
            shot("f4-missing-card")
            back()
        }
        // The empty and the 404 days.
        for d in ["28", "27"] where app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "\(d) October")).firstMatch.exists {
            app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "\(d) October")).firstMatch.tap()
            sleep(1)
            XCTAssertTrue(app.staticTexts["Today"].exists || app.navigationBars["Today"].exists, "app alive on day \(d)")
            shot("f4-missing-day\(d)")
        }
        XCTAssertEqual(app.state, .runningForeground)
    }

    func testF4_largeDayRenders() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "large"])
        waitToday()
        shot("f4-large-today")
        if tapIf(el("Deep read:", in: app.buttons, prefix: true)) {
            sleep(1); shot("f4-large-reader"); app.swipeUp(); app.swipeUp(); shot("f4-large-reader-2")
        }
        XCTAssertEqual(app.state, .runningForeground)
    }

    // MARK: F3 offline after a fetched day (run with a local server up for part 1, down for part 2)

    func testF3_offline_part1_fetch() {
        launch(["-resetState", "-memoryStore", "-mockBaseURL", "http://127.0.0.1:8791"])
        waitToday()
        XCTAssertTrue(text("REMOTE-ONLY Deep Read").waitForExistence(timeout: 8), "remote content not shown")
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Wed' AND label CONTAINS '28'")).firstMatch.tap()
        XCTAssertTrue(text("REMOTE-ONLY Yesterday Deep Read").waitForExistence(timeout: 8), "remote day 28 not shown")
        shot("f3-online")
    }

    func testF3_offline_part2_cached() {
        launch(["-memoryStore", "-mockBaseURL", "http://127.0.0.1:8791"], terminateFirst: false)   // server is down now
        waitToday()
        let day28 = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Wed' AND label CONTAINS '28'")).firstMatch
        XCTAssertTrue(day28.waitForExistence(timeout: 8), "cached index lost (day strip missing)")
        day28.tap()
        XCTAssertTrue(text("REMOTE-ONLY Yesterday Deep Read").waitForExistence(timeout: 8), "cached remote-only day did not open offline")
        shot("f3-offline")
    }

    // MARK: F5 / F6 cards

    func openQuickStack() {
        waitToday()
        XCTAssertTrue(tapIf(el("Quick read:", in: app.buttons, prefix: true), wait: 8), "no quick read row")
        XCTAssertTrue(button("Keep").waitForExistence(timeout: 6), "card stack did not open")
    }

    func testF5_readFullArticleOpensInAppBrowser() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        openQuickStack()
        let link = button("Read full article")
        XCTAssertTrue(link.exists)
        link.tap()
        // SFSafariViewController runs in its own process (SafariViewService).
        let safari = XCUIApplication(bundleIdentifier: "com.apple.SafariViewService")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 12), "Safari view did not appear")
        sleep(3)
        shot("f5-safari")
        let close = safari.buttons.matching(NSPredicate(format: "label IN {'Close','Done'}")).firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 5), "no Done/Close button in the in-app browser")
        close.tap()
        XCTAssertTrue(button("Keep").waitForExistence(timeout: 5), "did not return to the stack")
    }

    func testF6_keepSkipUndoSavedTrayUnread() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        openQuickStack()
        shot("f6-stack")
        button("Keep").tap()                       // card 1 kept
        sleep(1)
        button("Skip").tap()                       // card 2 skipped
        sleep(1)
        XCTAssertTrue(button("Undo last").isEnabled)
        button("Undo last").tap()                  // card 2 back
        sleep(1)
        button("Skip").tap()                       // skip again
        sleep(1)
        shot("f6-after")
        back()
        // Skipped tray on Today
        let tray = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Skipped'")).firstMatch
        XCTAssertTrue(tray.waitForExistence(timeout: 5), "no Skipped tray")
        tray.tap()
        let bring = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bring back'")).firstMatch
        XCTAssertTrue(bring.waitForExistence(timeout: 3))
        shot("f6-tray")
        bring.tap()
        sleep(1)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bring back'")).firstMatch.exists, "bring back did not remove from tray")
        // Saved
        tab("Saved")
        XCTAssertTrue(button("Read full article").waitForExistence(timeout: 5), "kept card not in Saved")
        shot("f6-saved")
        let remove = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Remove'")).firstMatch
        remove.tap()
        XCTAssertTrue(app.staticTexts["Nothing saved yet"].waitForExistence(timeout: 4), "Remove did not empty Saved")
        shot("f6-saved-empty")
    }

    func testF6_markAsUnreadFromExpandedCard() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        openQuickStack()
        button("Keep").tap()
        sleep(1)
        button("Expand").tap()
        XCTAssertTrue(button("Mark as unread").waitForExistence(timeout: 4))
        shot("f6-expanded")
        button("Mark as unread").tap()
        sleep(1)
        XCTAssertTrue(button("Keep").exists)
    }

    // MARK: F7 catch up

    func testF7_ringsAndCatchUp() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        waitToday()
        let catchUp = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Catch up'")).firstMatch
        app.swipeUp()
        XCTAssertTrue(catchUp.waitForExistence(timeout: 6), "no Catch up section")
        catchUp.tap()
        sleep(1)
        shot("f7-catchup")
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'overdue' OR label CONTAINS[c] 'missed' OR label CONTAINS[c] 'behind'")).firstMatch.exists)
    }

    // MARK: F8 / F9 words and persistence

    func testF9_relaunchPersistence_part1() {
        launch(["-resetState", "-mockScenario", "multiday"])
        waitToday()
        // keep a card
        XCTAssertTrue(tapIf(el("Quick read:", in: app.buttons, prefix: true), wait: 8))
        button("Keep").tap(); sleep(1); back()
        // rate a word
        tab("Words")
        let show = app.staticTexts["Tap to reveal the meaning"]
        XCTAssertTrue(show.waitForExistence(timeout: 6))
        show.tap()
        XCTAssertTrue(button("Good", prefix: true).waitForExistence(timeout: 4))
        shot("f8-word-back")
        button("Good", prefix: true).tap()
        sleep(1)
        // read a deep read part-way
        tab("Today")
        XCTAssertTrue(tapIf(el("Deep read:", in: app.buttons, prefix: true), wait: 6))
        sleep(1)
        app.swipeUp(); app.swipeUp(); app.swipeUp()
        sleep(1)
        shot("f9-reader-scrolled")
        let bar = app.otherElements["Reading progress"]
        XCTAssertTrue(bar.exists)
        XCTAssertNotEqual(bar.value as? String, "0 percent", "reader did not record progress")
    }

    func testF9_relaunchPersistence_part2() {
        launch(["-mockScenario", "multiday"], terminateFirst: false)   // no reset: same store
        waitToday()
        tab("Saved")
        XCTAssertTrue(button("Read full article").waitForExistence(timeout: 6), "kept card lost after relaunch")
        tab("Words")
        // saved words list
        app.segmentedControls.buttons["Saved"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'nuance'")).firstMatch.waitForExistence(timeout: 4)
                      || app.staticTexts.count > 3, "rated word not in Saved after relaunch")
        shot("f9-words-saved")
        tab("Today")
        XCTAssertTrue(tapIf(el("Deep read:", in: app.buttons, prefix: true), wait: 6))
        sleep(2)
        shot("f9-reader-restored")
        let v = app.otherElements["Reading progress"].value as? String
        XCTAssertNotEqual(v, "0 percent", "scroll position not restored (\(v ?? "nil"))")
    }

    // MARK: F10 speaking permissions

    func testF10_micDenied() {
        addUIInterruptionMonitor(withDescription: "perm") { alert in
            let deny = alert.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Don'")).firstMatch
            if deny.exists { deny.tap(); return true }
            return false
        }
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        waitToday()
        tab("Speak")
        let start = button("Start recording")
        XCTAssertTrue(start.waitForExistence(timeout: 6))
        shot("f10-speak-idle")
        start.tap()
        for _ in 0..<4 { sleep(1); app.tap() } // lets the interruption monitor run
        XCTAssertTrue(text("Microphone access is off").waitForExistence(timeout: 8), "no denied message")
        XCTAssertTrue(button("Open Settings").exists)
        shot("f10-mic-denied")
    }

    func testF10_speechDeniedAudioOnly() {
        addUIInterruptionMonitor(withDescription: "perm") { alert in
            let allow = alert.buttons.matching(NSPredicate(format: "label == 'Allow' OR label == 'OK' OR label CONTAINS 'Allow While'")).firstMatch
            let deny = alert.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Don'")).firstMatch
            if alert.label.localizedCaseInsensitiveContains("speech") { if deny.exists { deny.tap(); return true } }
            if allow.exists { allow.tap(); return true }
            if deny.exists { deny.tap(); return true }
            return false
        }
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        waitToday()
        tab("Speak")
        let start = button("Start recording")
        XCTAssertTrue(start.waitForExistence(timeout: 6))
        start.tap(); app.tap(); sleep(2); app.tap()
        shot("f10-after-prompts")
        let stop = button("Stop")
        if stop.waitForExistence(timeout: 8) {
            XCTAssertTrue(text("Live transcript is unavailable").waitForExistence(timeout: 4) || text("Listening").exists)
            sleep(3)
            stop.tap()
            sleep(2)
            shot("f10-speech-denied-result")
        } else {
            XCTFail("recording did not start after allowing mic")
        }
    }

    // MARK: F15 weekly

    func testF15_weeklyRealShapeAndEmpty() {
        launch(["-resetState", "-memoryStore"])
        waitToday()
        tab("Weekly")
        XCTAssertTrue(text("first weekly summary").waitForExistence(timeout: 5), "no kind empty state")
        shot("f15-weekly-empty")
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        waitToday()
        tab("Weekly")
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Week 44'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 6))
        shot("f15-weekly-list")
        row.tap()
        XCTAssertTrue(text("Takeaways: Engineering").waitForExistence(timeout: 6))
        shot("f15-weekly-top")
        XCTAssertTrue(button("Read full article").exists, "takeaway link missing")
        app.swipeUp(); app.swipeUp()
        shot("f15-weekly-mid")
        let reveal = app.buttons.matching(NSPredicate(format: "label == 'Reveal answer'")).firstMatch
        for _ in 0..<4 where !reveal.exists { app.swipeUp() }
        if reveal.exists { reveal.tap(); XCTAssertTrue(text("bottleneck").waitForExistence(timeout: 3)); shot("f15-weekly-quiz") } else { XCTFail("no quiz") }
    }

    // MARK: F16 reminder denied

    func testF16_reminderDenied() {
        addUIInterruptionMonitor(withDescription: "notif") { alert in
            let deny = alert.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Don'")).firstMatch
            if deny.exists { deny.tap(); return true }
            return false
        }
        launch(["-resetState", "-memoryStore"])
        waitToday()
        app.buttons["Settings"].tap()
        let toggle = app.switches["Daily reminder"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()   // the switch is at the row's trailing edge
        let alert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if alert.waitForExistence(timeout: 8) {
            alert.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Don'")).firstMatch.tap()
        }
        sleep(1)
        app.swipeUp()
        XCTAssertTrue(text("Notifications are off").waitForExistence(timeout: 8), "no explanation after denying")
        shot("f16-reminder-denied")
    }

    // MARK: F17 50 cards

    func testF17_fiftyCardSession() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "large"])
        waitToday()
        XCTAssertTrue(tapIf(el("Quick read:", in: app.buttons, prefix: true), wait: 8))
        XCTAssertTrue(button("Keep").waitForExistence(timeout: 6))
        var handled = 0
        for i in 0..<50 {
            XCTAssertEqual(app.state, .runningForeground, "app died at card \(i)")
            switch i % 5 {
            case 0: button("Keep").tap()
            case 1: button("Skip").tap()
            case 2:
                let card = app.otherElements.matching(NSPredicate(format: "label CONTAINS 'Card'")).firstMatch
                if card.exists { card.swipeRight() } else { button("Keep").tap() }
            case 3: button("Keep").tap(); if i % 10 == 3 { button("Undo last").tap(); usleep(400_000); button("Keep").tap() }
            default: button("Skip").tap()
            }
            handled += 1
            usleep(450_000)
            if i == 25 { shot("f17-mid") }
        }
        shot("f17-end")
        XCTAssertTrue(button("Keep").exists || text("All handled").exists || app.staticTexts["All handled"].exists)
        XCTAssertEqual(handled, 50)
    }

    // MARK: screens walk for F11 / F12 / F13

    func testScreensWalk() {
        launch(["-resetState", "-memoryStore", "-mockScenario", "multiday"])
        waitToday()
        sleep(1)
        shot("01-today")
        app.swipeUp(); sleep(1); shot("02-today-scrolled"); app.swipeDown()
        try? app.debugDescription.write(toFile: "\(shotDir)/\(tag)-a11y-today.txt", atomically: true, encoding: .utf8)

        if tapIf(el("Deep read:", in: app.buttons, prefix: true), wait: 5) {
            sleep(1); shot("03-reader"); app.swipeUp(); sleep(1); shot("04-reader-2"); back()
        }
        if tapIf(el("Quick read:", in: app.buttons, prefix: true), wait: 5) {
            sleep(1); shot("05-cards")
            try? app.debugDescription.write(toFile: "\(shotDir)/\(tag)-a11y-cards.txt", atomically: true, encoding: .utf8)
            if tapIf(button("Expand"), wait: 3) { sleep(1); shot("06-card-expanded"); tapIf(button("Close"), wait: 2) }
            back()
        }
        if tapIf(el("Grammar:", in: app.buttons, prefix: true), wait: 5) { sleep(1); shot("07-grammar"); app.swipeUp(); sleep(1); shot("08-grammar-2"); back() }
        tab("Words"); sleep(1); shot("09-words-front")
        if tapIf(app.staticTexts["Tap to reveal the meaning"], wait: 3) { sleep(1); shot("10-words-back") }
        tab("Speak"); sleep(1); shot("11-speaking")
        tab("Saved"); sleep(1); shot("12-saved")
        tab("Weekly"); sleep(1); shot("13-weekly")
        if tapIf(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Week 44'")).firstMatch, wait: 3) { sleep(1); shot("14-weekly-detail"); back() }
        tab("Today")
        if tapIf(app.buttons["Archive"], wait: 3) { sleep(1); shot("15-archive"); back() }
        if tapIf(app.buttons["Settings"], wait: 3) { sleep(1); shot("16-settings") }
        XCTAssertEqual(app.state, .runningForeground)
    }
}
