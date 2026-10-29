# LevelUp: edge cases and test plan

Every case has an ID. Tests report PASS / FAIL / NOT RUN per ID, with the evidence (command, output, or screenshot path). A case that cannot be run in this environment must say why. Results live in `TEST-RESULTS.md`.

Levels: **U** unit/logic (offline, fast), **I** integration (real files, fake `claude`), **E** end to end (real app surface or one real Claude run).

## A. Pipeline: collection

| ID | Case | Expected |
|---|---|---|
| A1 | Feed returns RSS 2.0 / Atom / RSS with CDATA / HTML entities in titles | Titles and links parsed correctly, entities decoded |
| A2 | Feed is empty, has zero items, or is not XML (HTML error page with HTTP 200) | Source skipped, others continue, reported in the run log |
| A3 | Feed HTTP 404 / 406 / 410 / 429 / 500 / timeout / DNS failure | Source skipped with reason; run continues |
| A4 | Item has no date, a future date, or a malformed date | Not treated as fresh unless date is valid; no crash |
| A5 | Relative links, tracking params (`?utm_`), `#fragment`, trailing slash | Normalised to the same fingerprint as the canonical URL |
| A6 | Same article arrives from two sources (HN plus the blog) | Served once (URL fingerprint) |
| A7 | Same story, different URL, near-identical title | Dropped by the title check against the last 14 days |
| A8 | Hacker News API down or returns nulls/deleted items | Continues without HN |
| A9 | Fewer than 20 fresh candidates in total | Run aborts cleanly, nothing published, state untouched |
| A10 | Article page: paywall, login wall, JS-only page, huge page, non-HTML (PDF), redirect loop | Item dropped and replaced from reserves; no hang (timeouts) |
| A11 | Article text extraction returns navigation/cookie text only | Detected as too thin and dropped |
| A12 | Non-UTF-8 or very long titles | No crash; truncated sensibly |

## B. Pipeline: Claude calls

| ID | Case | Expected |
|---|---|---|
| B1 | Reply wrapped in code fences / with chatter before and after JSON | JSON extracted |
| B2 | Reply is invalid JSON, truncated mid-object, empty, or not JSON at all | One retry, then that chain fails without killing others |
| B3 | Reply has the right shape but missing/extra/wrongly-typed fields | Validation catches it or tolerant handling; no bad item published |
| B4 | Model returns ids not in the candidate list, duplicate ids, or fewer items than asked | Invalid ids ignored, reserves backfill, thresholds still checked |
| B5 | Rate-limit / overloaded error | Backoff retry (30s, 90s), slot released while waiting |
| B6 | Usage limit reached (account out of allowance) | Run stops cleanly; day not marked done; clear message; retried at next trigger |
| B7 | Not logged in / auth error / `claude` binary missing or not executable | Clear error, no crash, nothing published |
| B8 | A call hangs | Per-call timeout kills the process; overall 45-minute cap |
| B9 | Concurrency | Never more than 4 `claude` processes at once, even with a high setting |
| B10 | Ctrl-C or SIGTERM mid-run | Child processes killed, no partial day file, state untouched |
| B11 | Verify step rewrites an item | Corrected text used; `verifyNotes` kept; ids preserved |
| B12 | Verify step drops or reorders items | Items matched by id, none lost silently |
| B13 | Source text contains prompt-injection text ("ignore previous instructions...") | Output is still just a summary; instruction in the article is not followed. Test with a fake source and a real call |
| B14 | Source text is in another language or mostly code | Summary still sensible or the item is dropped |

## C. Pipeline: state, dedupe, curriculum, weekly

| ID | Case | Expected |
|---|---|---|
| C1 | Run twice on the same day | Second run exits immediately |
| C2 | `--force` rerun | Regenerates today without duplicating history entries |
| C3 | Failed validation | `history.json`, `state.json`, `index.json` unchanged (byte-identical) |
| C4 | Words already served | Never repeated, case-insensitive, also across plural/inflection where obvious |
| C5 | Curriculum pointer | Advances only after a successful publish; wraps cleanly past the end |
| C6 | Word level mix by day (0, 6, 7, 28, 60, 200) | Matches the documented ramp; counts add up to the target |
| C7 | `history.json` or `state.json` missing, empty, or corrupt | Starts fresh or aborts with a clear message; never silently wipes good data |
| C8 | Two runs at once (scheduled run plus manual) | Lock prevents overlap |
| C9 | Day crosses midnight during a run | Uses the date at start consistently |
| C10 | Output folder not writable or disk full | Clear failure, no partial file |
| C11 | Weekly with 0, 1, 3 and 7 daily files | Behaves sensibly; 0 days produces nothing and no crash |
| C12 | Weekly on Sunday, missing Sunday, rerun, and week boundary (ISO week 52/53/1) | Right week id, no duplicate, Monday catch-up works |
| C13 | Weekly quiz/takeaway references an item id that does not exist | Dropped in code, not shown |
| C14 | `index.json` after many days | Sorted newest first, no duplicates, `weeklies` valid |

## D. Ops and scheduling

| ID | Case | Expected |
|---|---|---|
| D1 | `run-daily.sh` when today's file already exists | Exits at once |
| D2 | No network at login | Waits up to ~2 minutes, then exits without marking the day done |
| D3 | Run fails | Next trigger retries; macOS notification says it failed |
| D4 | plist and scripts | `plutil -lint` and `bash -n` pass; paths are absolute and correct |
| D5 | Deploy script without wrangler login | Fails with a clear message and does not break the data |

## E. Web app

| ID | Case | Expected |
|---|---|---|
| E1 | First load with no storage, with storage blocked, with corrupted storage | Renders; falls back to memory/clean state |
| E2 | `index.json` missing, empty, or invalid; a day file 404; a day file with missing sections | Friendly error or partial render, never a blank page |
| E3 | Real day-1 data renders on Today, reader, cards, words, grammar, speaking | No console errors |
| E4 | Item with missing url, missing source, huge text, HTML/script in text | No crash; text is escaped (no injection) |
| E5 | Every article, quick and AI item shows "Read full article" with the right url and `rel=noopener` | Verified by scanning the DOM |
| E6 | Keep, skip, undo, bring back, mark as unread, remove from Saved | Status and counts correct; Saved list matches |
| E7 | Rings and streak math: all done, none, kept vs skipped, 70% rule boundary (exactly 70%, 69%) | Correct |
| E8 | Streak across a missed day, across timezone/midnight, with catch-up completions | Catch-up does not retroactively break or fake a streak |
| E9 | Catch up window 0, 3, 7 days; items done in catch-up disappear | Correct |
| E10 | Day strip and archive with 1 day, 30 days, a gap in dates | Correct |
| E11 | Words: flip, Again/Good/Easy sequences, due dates, review across days | SM-2 intervals as expected |
| E12 | Save word from reader text: single word, phrase, punctuation, duplicate, non-ASCII | Saved once, normalised |
| E13 | Grammar exercises: correct, wrong, extra spaces, case, punctuation | Lenient checking works |
| E14 | Speaking: mic denied, no recognition support, empty recording, very long recording, only fillers | Graceful messages; analysis correct (fillers, wpm) |
| E15 | Weekly list/sheet with real shape, missing sections, no weeklies | Correct and kind empty state |
| E16 | Export then import; import of old format, wrong file, empty file | Round-trips; bad input rejected with a message |
| E17 | Erase all | Clean state; no leftover keys |
| E18 | Theme light/dark/system, text size, serif, reduce motion, reduce transparency | Applied and persisted |
| E19 | Viewports 360, 390, 768, 1280 | No horizontal scroll, tab bar usable, 44px targets |
| E20 | Keyboard-only: tab order, focus visible, card arrow keys, flip with Space | Works |
| E21 | Long text, RTL text, emoji in titles | Layout holds |
| E22 | Two tabs open at once | State stays consistent (storage event) or documented limitation |

## F. iOS app

| ID | Case | Expected |
|---|---|---|
| F1 | Launch with empty store, bundled data only | Today renders from the bundled day |
| F2 | Remote Base URL: valid, invalid, unreachable, returns 404, returns garbage | Falls back to cache/bundled; no crash; message shown |
| F3 | Offline after a successful fetch | Previously fetched days open |
| F4 | Decoding: missing/unknown/wrongly typed fields; real day-1 file | No crash (unit tests exist; extend) |
| F5 | Every article opens its original link in the in-app browser | Link valid; sheet dismisses cleanly |
| F6 | Keep/skip/undo/bring back/mark unread/Saved list; same 70% rule as web | Same results as the web app for the same inputs |
| F7 | Rings, streak, catch-up | Same results as the web app |
| F8 | Words: flip, grading, due queue, save from selected text | SwiftData state correct across relaunch |
| F9 | Relaunch persistence (kill and reopen) | Progress, saved words, scroll position kept |
| F10 | Speaking: mic denied, speech denied, recognizer unavailable (simulator), interruption | Graceful UI; Open Settings button |
| F11 | Dynamic Type largest, Bold Text, dark mode, Reduce Motion, Reduce Transparency | Layout holds, readable |
| F12 | iPhone SE-size and large Pro Max-size layouts; landscape | No clipped or overlapping UI |
| F13 | VoiceOver labels on cards, rings, buttons (inspect accessibility tree) | Present and meaningful |
| F14 | Export/import progress; import of the web export | Documented compatibility; bad file rejected |
| F15 | Weekly with real shape and empty state | Correct |
| F16 | Reminder permission denied | Setting explains how to enable |
| F17 | Memory/CPU on a long session (swipe 50 cards) | No growth or hangs |

## G. Cross-cutting end to end

| ID | Case | Expected |
|---|---|---|
| G1 | Real pipeline output (a freshly generated day) loads in web and iOS with no errors | Both render all sections |
| G2 | Day file with the new fields (level, whySelected, minutes) vs day 1 without | Both clients handle both |
| G3 | Data served over HTTP with wrong content type or a caching proxy | Clients still parse |
| G4 | Schema version bump (`schema: 2`) | Clients degrade gracefully, not crash |
| G5 | One full real run: collect, Claude (real), validate, write, then load in both clients | Everything works; counts and links valid |
| G6 | Dead-link check: HEAD/GET every original URL in a day | Report any dead links (informational) |
| G7 | Summary faithfulness spot check: compare 3 summaries to their sources | No unsupported claims found, or listed |
