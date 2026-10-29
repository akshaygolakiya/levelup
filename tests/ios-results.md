# iOS app: test results (F cases, some G)

Date: 2026-10-29. Build: Xcode 26.6, iOS 26.5 simulators. Debug builds, `CODE_SIGNING_ALLOWED=NO`, `-jobs 2`, one xcodebuild at a time.
Devices: iPhone 17 Pro (main), UITEST-SE (iPhone SE 3rd gen, small size), iPhone 17 Pro Max. Only one device was booted at any time; all were shut down at the end.

How the tests run
- Unit tests: `LevelUpTests` (Swift Testing). Final run: **26 tests, 5 suites, all passed** (`-only-testing:LevelUpTests`, log `scratchpad/final-unit.log`).
- UI tests: `LevelUpUITests/LevelUpUITests.swift` (XCUITest), driven by launch arguments (debug only, see `App/LaunchConfig.swift`): `-mockScenario multiday|missing|large`, `-mockBaseURL`, `-resetState`, `-memoryStore`, `-corruptStore`. Scenario data lives in `ios/LevelUp/Resources/Mock/`.
- Screenshots: `levelup/tests/screens/ios/<device>-<mode>-<step>.png` (`pm` = iPhone 17 Pro, `pmax` = Pro Max, `se` = SE; `ax` = Accessibility XXXL text; `land` = landscape, **the PNGs from XCUITest are unrotated, the image is sideways**).
- `levelup/tests/fixtures/real-day.json` did not exist, so **G1 used synthetic days** (day 1 plus new fields `level`, `whySelected`, `minutes: 40`; and a 60-card large day).

Summary: F1..F17: **PASS 10, PARTIAL 7, FAIL 0, NOT RUN 0** (partial = main path verified, listed sub-cases not run). G: PASS 2, NOT RUN 2 (G1, G3). Also see the Weekly-row flake under bugs not fixed.

## F cases

| ID | Result | Evidence |
|---|---|---|
| F1 | PASS | `testF1_emptyStoreBundled` (reset + memory store, bundled day only) passed after fixing a wrong assertion in the test (date text order); screenshot `pm-light-f1-today.png`. |
| F2 | PARTIAL | `testF2_badRemoteFallsBackToBundled` PASS for 3 bad base URLs (unreachable `127.0.0.1:9`, malformed `ht!tp://not a url`, `https://example.invalid`): Today renders from bundled, Settings says "Using bundled content." / invalid-address note (`pm-light-f2-badremote-today.png`, `pm-light-f2-settings-source.png`). NOT RUN: server returning 404 and server returning garbage JSON (decoding of garbage is covered by unit tests only). |
| F3 | PASS | Local server on :8791 serving a remote-only day (28 Oct, absent from bundle) and a retitled 29 Oct. `testF3_offline_part1_fetch` fetched both; server stopped; `testF3_offline_part2_cached` opened the cached remote-only day offline. Also repeated by hand with `simctl launch` (`pm-light-f3-offline-manual.png`: remote-only title and day strip shown with server down). First attempt failed once because port 8765 was already used by another agent's server (my test port changed to 8791); a second part-2 attempt failed once with the cache index overwritten by a one-day index, I could not reproduce or explain it (two clean reruns passed) so I rate it PASS with that caveat. |
| F4 | PASS | 26 unit tests (real day-1, missing/unknown/wrongly typed fields, empty object `{}`, schema 2 with unknown keys, string minutes, new fields, weekly tolerance). UI: `testF4_missingSectionsDoNotCrash` (scenario with missing sections, a day file that 404s, an empty day) and `testF4_largeDayRenders` (60 cards, 30 min deep read, long text, emoji, RTL) passed; screenshots `pm-light-f4-*.png`. |
| F5 | PASS | `testF5_readFullArticleOpensInAppBrowser`: tap "Read full article" opens SFSafariViewController (out-of-process `SafariViewService`), real page loaded (`pm-light-f5-safari.png`, brooker.co.za), Close returns to the stack. Unit test checks all 15 day-1 articles have valid http(s) urls. Only one article was opened by UI; links on every card, row and weekly takeaway are the same component. |
| F6 | PASS | `testF6_keepSkipUndoSavedTrayUnread`: Keep, Skip, Undo (re-skip), Skipped tray with Bring back, Saved lists kept item with Read full article, Remove empties Saved (`pm-light-f6-*.png`; the run labelled `se-dark-f6` also passed, but the dark appearance was not actually applied to it, so treat it as light). `testF6_markAsUnreadFromExpandedCard` passed. Unit tests: 70% rule (10 core: 7 passes, 6 fails; 13 core: 10 needed), kept counts, skipped does not, status flags. "Same results as the web app": the rule and statuses mirror `site/js/progress.js`; I did not run the web app, parity is by reading its code and shared boundary cases. |
| F7 | PARTIAL | `testF7_ringsAndCatchUp` passed: Catch up section present, optional wording, no guilt text (overdue/missed/behind absent), skipped items excluded (`pm-light-f7-catchup.png`). Rings counts, streak and the skipped-does-not-count rule: unit tests. NOT RUN in UI: catch-up window 0 and 7, finishing items inside catch-up. |
| F8 | PARTIAL | UI: flip card, Good grading, interval labels, Saved tab list (`pm-light-f8-word-back.png`, `pm-light-f9-words-saved.png`); SM-2 schedule in unit tests; SwiftData state across relaunch PASS (F9). NOT RUN: saving a word from selected text via the edit menu (menu action not automated; `WordSaving` helpers are untested), Review due queue with real elapsed time. |
| F9 | PASS | `testF9_relaunchPersistence_part1/part2`: kept card, rated word, reader scroll position kept after kill and relaunch (reading progress value non-zero after reopen, `pm-light-f9-reader-scrolled.png`, `pm-light-f9-reader-restored.png`). Found and fixed: scroll was only saved on disappear, so a killed app lost it. |
| F10 | PARTIAL | `testF10_micDenied` PASS (denied message and "Open Settings" button, `pm-light-f10-mic-denied.png` taken at the permission prompt). `testF10_speechDeniedAudioOnly` PASS: mic allowed, speech denied, audio-only banner "Live transcript is unavailable here..." and typed-transcript fallback (`pm-light-f10-speech-denied-result.png`). Recording with a real recognizer and audio interruption: NOT RUN (no speech input in the simulator). |
| F11 | PARTIAL | Dark mode PASS (`pm-dark-*`, readable, AA looks fine). Accessibility XXXL PASS on Pro and SE after fixes (`pm-ax-*`, `se-ax-*`). Reduce Transparency PASS: solid flat surfaces (`pm-reduce-01-today.png`, set via `com.apple.Accessibility` defaults and a simulator restart). Reduce Motion was enabled in the same run but only static appearance checked. Bold Text: NOT RUN. |
| F12 | PARTIAL | iPhone SE (`se-light-*`), Pro (`pm-light-*`), Pro Max (`pmax-dark-*`) portrait PASS, no clipped or overlapping UI after fixes. Landscape: the app had been portrait-only; enabled landscape and fixed the cards screen (action bar was squeezed to 16x16), screenshots `pm-land-*`, `se-land-*` (rotate 90 degrees to read). The walk script failed in landscape (Pro) and on Pro Max at the Weekly detail step: the row tap did not push the detail (see Bugs). |
| F13 | PASS | Accessibility tree dumps `pm-light-a11y-today.txt`, `pm-light-a11y-cards.txt` (also `se-*`, `pm-ax-*`): rings "Tech: 0 of 6 finished", rows "Quick read: ..., over 20 minutes", Skip/Keep/Undo/Expand buttons, Settings, Archive. Not a live VoiceOver session. Noted: nav-bar buttons Archive/Settings report frames of 39x36 and 31x36 pt (system toolbar hit areas are larger, not fixed). |
| F14 | PARTIAL | Unit tests (`TransferTests`): web format 2 import (items, scroll, words with srs, coreDays, writing, useful), format 1, garbage rejected (empty, text, `[]`, wrong app, missing/invalid state, format 9) with messages, export then import round trip, export is `{app, format: 2, state}`. NOT RUN: share sheet/file picker UI, importing a file exported by the real web app (I only used a hand-built web-shaped file). |
| F15 | PASS | `testF15_weeklyRealShapeAndEmpty`: empty state ("Your first weekly summary appears after the first Sunday"), list with `{week, from, to, days}`, detail with takeaways engineering/AI with Read full article, concepts, must remember, words with level, grammar, quiz reveal (`pm-light-f15-weekly-*.png`). Unit tests for real shape and missing sections. Based on `pipeline/weekly.mjs`; no real weekly file existed. |
| F16 | PASS | `testF16_reminderDenied` (notification alert answered via springboard): footer explains "Notifications are off for LevelUp. Turn them on in iOS Settings...". Found and fixed: the message was previously below the fold of the list. Screenshot `pm-light-f16-reminder-denied.png`. |
| F17 | PASS | `testF17_fiftyCardSession` on the 60-card day: 50 mixed Keep / Skip / swipe / Undo actions, app stayed foreground, no hang (65 s). RSS sampled every ~3 s: 138 MB at launch, ~300 MB peak while loading the large day, then 258 to 273 MB for the whole session, no growth (`scratchpad/rss.log`). CPU not measured. |

## G cases
| ID | Result | Evidence |
|---|---|---|
| G1 | NOT RUN | no real pipeline day available; synthetic days used (see above). |
| G2 | PASS | Day with `level`, `whySelected`, `minutes: 40`, and day-1 without: "Why this is here" on cards and reader, level chip on word cards and weekly words, "20+ min" for quick/AI over 25 min (`pm-light-05-cards.png`, `pm-light-01-today.png`, `pm-light-10-words-back.png`). Unit test `newFieldsAndMinutesCap`. |
| G3 | NOT RUN | wrong content type / proxy not simulated. |
| G4 | PASS (unit) | schema 2 with unknown keys and odd types decodes (`futureSchemaVersionDegradesGracefully`). |

## Part 1 changes (web alignment)
- `kept` status (counts as finished), `skipped` no longer counts for rings, streak or Catch up; collapsed Skipped tray per day with Bring back; Undo in the card stack; Mark as unread (reader and expanded card); Saved tab (kept items across days, Read full article, Remove). Archive moved behind a calendar button on Today.
- Streak rule: a day counts when `coreDone >= ceil(0.7 * coreTotal)`, computed in integers as `(7 * n + 9) / 10`, where `coreDone` = done + kept. 10 core items: 7 passes, 6 fails. Documented in `Models/Domain.swift` (`DayStatValue.required(forCore:)`).
- Stored item keys now equal the web ids (`id`, or `date:deep:0`, `date:w:word`, `date:grammar:0`, `date:speak:0`, `date:concept:0`).
- Weekly decoder replaced with the real shape (`takeaways.engineering/ai`, `concepts`, `mustRemember`, `words`, `grammar`, `quiz`, `links`) and entries `{week, from, to, days}`, still tolerant.
- Word `level` chip, `whySelected` line, quick/AI over 25 min shown as "20+ min".
- Export/import use the web format 2 (older format 1 accepted, garbage rejected with a message).

## Bugs found and fixed
1. Today, Saved and Weekly root screens had no mesh background (flat white).
2. Card action bar: "Keep" wrapped to two lines at normal size (cramped); fixed with compact icon buttons.
3. Reading progress stayed at 0 (preference-based scroll tracking); now uses `onScrollGeometryChange` on iOS 18+ with the old method as fallback (the iOS 17 fallback is untested on a real iOS 17 runtime).
4. Reader scroll position was lost when the app was killed (saved only on disappear); now saved while scrolling, after the restore step.
5. Reminder denied message was off screen; now in the Reminder section footer.
6. At Accessibility XXXL: day strip and ring text truncated or overflowing, card text truncated with "...", buttons truncated; chips and rings are clamped, button labels wrap, cards scroll, action bar stacks vertically.
7. Landscape was disabled and the cards screen was unusable in landscape; landscape enabled, card scrolls, action bar fits.

## Bugs found and not fixed
- Weekly row in the screen walk did not navigate on 2 of 7 runs (Pro landscape, Pro Max portrait), passed on 5 runs and in the dedicated `testF15` run; not reproduced by hand, so it may be a tap/animation race in the test or a rare app issue. Unresolved.
- `testScreensWalk` therefore failed at the last steps in `pm-land` and `pmax-dark`; screenshots 01 to 14 exist for both.
- Nav-bar Archive and Settings buttons are small (reported 39x36 and 31x36 pt).
- iOS 17 runtime was never exercised (only iOS 26.5): MeshGradient fallback, scroll tracking fallback and Material fallback are compile-checked only.
- Not verified: Bold Text, Reduce Motion behaviour, live VoiceOver, speech recognition quality, real web export file, share sheet.

## Load averages (1-minute, from "load before" lines and checks)
Before each build or test run I waited for load < 6; logged values 3.35 to 5.91. Spikes of 28 to 38 occurred right after simulator boots and during other agents' work, and the scripts waited for them to fall before starting (they cap the wait at 5 minutes; no run was started above 6 as far as the logs show). A background test run took over 3 minutes on a busy machine.

## Cleanup
All simulators shut down; `ps` shows no xcodebuild, no http.server on :8791, no leftover scripts. The Simulator app window process was already open before this job.
