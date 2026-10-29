import Foundation
import Testing
import SwiftData
@testable import LevelUp

struct DecodingTests {
    @Test func decodesRealDayOne() async throws {
        let day = try await BundledDataService().fetchDay("2026-10-29")
        #expect(day.date == "2026-10-29")
        #expect(day.tech.deepReads.count == 3)
        #expect(day.tech.quickReads.count == 8)
        #expect(day.tech.aiNews.count == 4)
        #expect(day.tech.concepts.count == 1)          // "concept" is a single object in the file
        #expect(day.english.words.count == 18)
        #expect(day.english.grammar.count == 1)        // "grammar" is a single object in the file
        #expect(day.english.grammar[0].exercises.count == 6)
        #expect(day.english.speaking.count == 6)
        #expect(day.english.speaking[0].usefulPhrases.count == 3)
        // Every article keeps its original link (hard requirement).
        let all = day.tech.deepReads + day.tech.quickReads + day.tech.aiNews
        #expect(all.allSatisfy { $0.linkURL != nil && !$0.source.isEmpty })
        #expect(day.tech.deepReads[0].beforeYouRead.count == 7)
        #expect(day.tech.quickReads[0].keyIdeas.count == 1)   // singular keyIdea is folded into keyIdeas
    }

    @Test func decodesIndex() async throws {
        let idx = try await BundledDataService().fetchIndex()
        #expect(idx.dates.contains("2026-10-29"))
        #expect(idx.weeklies.isEmpty)
    }

    @Test func toleratesMissingAndUnknownFields() throws {
        let json = """
        {"schema": 9, "date": "2030-01-01", "futureField": {"a": 1},
         "tech": {"deepReads": [{"title": "T", "url": "https://x.test/a", "newThing": [1,2]}, {"nope": true}],
                  "quickReads": "oops", "concept": [{"title": "C"}]},
         "english": {"words": [{"word": "Alpha"}, {"meaning": "no word"}], "grammar": [{"topic": "G", "exercises": [{"prompt": "p"}]}]}}
        """
        let day = try JSONDecoder().decode(DayContent.self, from: Data(json.utf8))
        #expect(day.tech.deepReads.count == 1)          // malformed element dropped, not fatal
        #expect(day.tech.deepReads[0].tldr == "")
        #expect(day.tech.quickReads.isEmpty)
        #expect(day.tech.concepts.count == 1)
        #expect(day.english.words.map(\.id) == ["alpha"])
        #expect(day.english.grammar[0].exercises.isEmpty)
        #expect(day.english.speaking.isEmpty)
    }

    @Test func futureSchemaVersionDegradesGracefully() throws {
        let json = #"{"schema":2,"date":"2031-01-01","brandNew":{"x":1},"tech":{"deepReads":[{"title":"T","url":"https://x.test","kind":"hologram","minutes":"12","tags":"single"}]}}"#
        let day = try JSONDecoder().decode(DayContent.self, from: Data(json.utf8))
        #expect(day.schema == 2 && day.tech.deepReads.count == 1 && day.tech.deepReads[0].minutes == 12)
        #expect(day.tech.deepReads[0].tags == ["single"])
    }

    @Test func emptyObjectIsAValidDay() throws {
        let day = try JSONDecoder().decode(DayContent.self, from: Data("{}".utf8))
        #expect(day.tech.deepReads.isEmpty && day.english.words.isEmpty)
    }

    @Test func weeklyIndexUsesRealEntryShape() throws {
        let json = #"{"days":["2026-10-29",{"date":"2026-10-28"}],"weeklies":[{"week":"2026-W44","from":"2026-10-26","to":"2026-11-01","days":7},"2026-W43"]}"#
        let idx = try JSONDecoder().decode(DayIndex.self, from: Data(json.utf8))
        #expect(idx.dates == ["2026-10-29", "2026-10-28"])
        #expect(idx.weeklies.map(\.path) == ["weekly/2026-W44.json", "weekly/2026-W43.json"])
        #expect(idx.weeklies[0].dayCount == 7 && idx.weeklies[0].from == "2026-10-26" && idx.weeklies[0].weekNumber == "44")
    }

    @Test func weeklySummaryRealShape() throws {
        let json = """
        {"schema":1,"week":"2026-W44","from":"2026-10-26","to":"2026-11-01","days":["2026-10-26"],
         "takeaways":{"engineering":[{"text":"T1","itemId":"a","title":"Title A","url":"https://x.test/a"}],"ai":[{"text":"T2","itemId":"b","title":"B","url":"https://x.test/b"}]},
         "concepts":[{"date":"2026-10-26","title":"C","recap":"R"}],
         "mustRemember":[{"text":"M","itemId":null,"url":null}],
         "words":[{"word":"nuance","pos":"noun","level":"B2","meaning":"m","date":"2026-10-26"}],
         "grammar":[{"date":"2026-10-26","topic":"G","rule":"rule"}],
         "quiz":[{"ref":"Q1","question":"Q?","answer":"A","itemId":"a","title":"Title A","url":"https://x.test/a"}],
         "links":[{"id":"a"}], "future":1}
        """
        let w = try JSONDecoder().decode(WeeklySummary.self, from: Data(json.utf8))
        #expect(w.engineering.count == 1 && w.ai.count == 1 && w.engineering[0].linkURL != nil)
        #expect(w.concepts[0].text == "R" && w.mustRemember.count == 1)
        #expect(w.words[0].level == "B2" && w.grammar[0].text == "rule")
        #expect(w.quiz[0].answer == "A" && w.quiz[0].linkURL != nil)
        #expect(!w.isEmpty)
    }

    @Test func weeklySummaryToleratesMissingSections() throws {
        let w = try JSONDecoder().decode(WeeklySummary.self, from: Data(#"{"takeaways":[{"text":"flat"}],"quiz":[{"nope":1}]}"#.utf8))
        #expect(w.engineering.count == 1 && w.quiz.isEmpty)
        #expect(try JSONDecoder().decode(WeeklySummary.self, from: Data("{}".utf8)).isEmpty)
    }

    @Test func newFieldsAndMinutesCap() throws {
        let json = """
        {"date":"2030-02-02","tech":{"quickReads":[{"id":"q1","title":"Long","url":"https://x.test","minutes":40,"whySelected":"Because"}],
          "deepReads":[{"title":"No id","url":"https://x.test/d","minutes":30}]},
         "english":{"words":[{"word":"Lucid","level":"C1","meaning":"clear"}]}}
        """
        let day = try JSONDecoder().decode(DayContent.self, from: Data(json.utf8))
        #expect(day.tech.quickReads[0].capped && day.tech.quickReads[0].minutes == 20)
        #expect(!day.tech.deepReads[0].capped && day.tech.deepReads[0].minutes == 30)
        #expect(day.tech.quickReads[0].whySelected == "Because")
        #expect(day.english.words[0].level == "C1")
        let plan = Planner.plan(day)
        #expect(plan.all.first { $0.kind == .quick }?.minutesLabel == "20+ min")
        // Stored keys match the web app's item ids.
        #expect(plan.all.first { $0.kind == .quick }?.key == "q1")
        #expect(plan.all.first { $0.kind == .deep }?.key == "2030-02-02:deep:0")
        #expect(plan.all.first { $0.kind == .word }?.key == "2030-02-02:w:lucid")
    }
}

struct SM2Tests {
    @Test func schedulesIncreaseOnGood() {
        let now = Date()
        var s = SRSState()
        s = SM2.review(s, grade: .good, now: now)
        #expect(s.interval == 1 && s.reps == 1)
        s = SM2.review(s, grade: .good, now: now)
        #expect(s.interval == 3 && s.reps == 2)
        s = SM2.review(s, grade: .good, now: now)
        #expect(s.interval == 8 && s.reps == 3)   // round(3 * 2.5) = 8 (7.5 rounds away from zero)
    }

    @Test func againResetsAndLowersEase() {
        let now = Date()
        let s = SRSState(ease: 2.5, interval: 10, reps: 4, lapses: 0, due: now)
        let r = SM2.review(s, grade: .again, now: now)
        #expect(r.reps == 0 && r.interval == 0 && r.lapses == 1)
        #expect(abs(r.ease - 2.3) < 0.0001)
        #expect(r.due > now && r.due.timeIntervalSince(now) <= 11 * 60)
    }

    @Test func easyJumpsAndEaseNeverBelowFloor() {
        let now = Date()
        let e = SM2.review(SRSState(), grade: .easy, now: now)
        #expect(e.interval == 4 && abs(e.ease - 2.65) < 0.0001)
        var s = SRSState()
        for _ in 0..<20 { s = SM2.review(s, grade: .again, now: now) }
        #expect(s.ease >= 1.3)
    }
}

struct FillerTests {
    @Test func countsFillersAndPace() {
        let text = "Um, so I think, you know, the cache is like really fast and uh simple."
        let s = SpeechAnalysis.analyze(transcript: text, duration: 6)
        #expect(s.fillers["um"] == 1)
        #expect(s.fillers["you know"] == 1)
        #expect(s.fillers["like"] == 1)
        #expect(s.fillers["uh"] == 1)
        #expect(s.fillerCount == 4)
        #expect(s.wordCount == 15)
        #expect(s.wpm == 150)
    }

    @Test func doesNotMatchInsideWords() {
        let s = SpeechAnalysis.analyze(transcript: "The umbrella is likely under the bumper", duration: 10)
        #expect(s.fillerCount == 0)
    }

    @Test func emptyAndShortDurations() {
        #expect(SpeechAnalysis.analyze(transcript: "", duration: 0).wpm == 0)
        #expect(SpeechAnalysis.similarity(model: "I have shipped it", spoken: "i have shipped") == 0.75)
    }
}

struct ReadStateTests {
    @Test func lightCoreMatchesTheSpec() async throws {
        let day = try await BundledDataService().fetchDay("2026-10-29")
        let plan = Planner.plan(day)
        #expect(plan.techCore.count == 6)       // 1 deep + 3 quick + 1 AI + concept
        #expect(plan.englishCore.count == 7)    // 5 words + grammar + 1 speaking
        #expect(plan.core.filter { $0.kind == .quick }.count == 3)
        #expect(plan.more.contains { $0.kind == .deep })       // extra deep reads live under More
        #expect(Set(plan.all.map(\.key)).count == plan.all.count) // keys are unique
    }

    @Test func timeboxNeverHidesAnything() async throws {
        let day = try await BundledDataService().fetchDay("2026-10-29")
        let plan = Planner.plan(day)
        for box in Timebox.allCases {
            let s = Planner.split(plan, box: box)
            #expect(s.today.count + s.more.count == plan.all.count)
        }
        #expect(Planner.split(plan, box: .quick).today.first?.kind == .word)
    }

    @Test func settledCountsDoneAndSkippedButNotInProgress() async throws {
        let day = try await BundledDataService().fetchDay("2026-10-29")
        let plan = Planner.plan(day)
        let doneKey = plan.core[0].key, skipKey = plan.core[1].key, progKey = plan.core[2].key
        let c = Planner.counts(plan) { ref in
            switch ref.key {
            case doneKey: .done
            case skipKey: .skipped
            case progKey: .inProgress
            default: .unread
            }
        }
        #expect(c.coreDone == 1 && c.coreTotal == 13 && !c.isComplete)   // skipped and in-progress do not count
    }

    @Test func streakIgnoresUnfinishedTodayAndStopsAtGaps() {
        let done: Set<String> = ["2026-10-27", "2026-10-28"]
        #expect(StreakCalculator.current(completed: done, today: "2026-10-29") == 2)       // today not done yet
        #expect(StreakCalculator.current(completed: done.union(["2026-10-29"]), today: "2026-10-29") == 3)
        #expect(StreakCalculator.current(completed: ["2026-10-20", "2026-10-28"], today: "2026-10-29") == 1)
        #expect(StreakCalculator.current(completed: ["2026-10-20"], today: "2026-10-29") == 0)
    }

    @Test func seventyPercentBoundary() {
        #expect(DayStatValue.required(forCore: 10) == 7)
        #expect(DayStatValue(coreTotal: 10, coreDone: 7).isComplete)
        #expect(!DayStatValue(coreTotal: 10, coreDone: 6).isComplete)
        #expect(DayStatValue.required(forCore: 13) == 10)
        #expect(DayStatValue(coreTotal: 13, coreDone: 10).isComplete && !DayStatValue(coreTotal: 13, coreDone: 9).isComplete)
        #expect(DayStatValue.required(forCore: 1) == 1 && DayStatValue.required(forCore: 3) == 3 && DayStatValue.required(forCore: 20) == 14)
        #expect(!DayStatValue().isComplete)
    }

    @Test func keptCountsSkippedDoesNot() async throws {
        let day = try await BundledDataService().fetchDay("2026-10-29")
        let plan = Planner.plan(day)
        let c = Planner.counts(plan) { ref in plan.core.prefix(10).contains(ref) ? .kept : .skipped }
        #expect(c.coreDone == 10 && c.coreTotal == 13 && c.isComplete)   // ceil(0.7 * 13) = 10
        let c2 = Planner.counts(plan) { ref in plan.core.prefix(9).contains(ref) ? .done : .skipped }
        #expect(!c2.isComplete)
    }

    @Test func statusFlags() {
        #expect(ItemStatus.kept.isResolved && ItemStatus.done.isResolved)
        #expect(!ItemStatus.skipped.isResolved && !ItemStatus.skipped.isPending)
        #expect(ItemStatus.unread.isPending && ItemStatus.inProgress.isPending)
    }

    @Test func answerCheckerIsLenient() {
        #expect(AnswerChecker.matches("have worked", "Have / worked"))
        #expect(AnswerChecker.matches("  Merged. ", "merged"))
        #expect(!AnswerChecker.matches("", ""))
        #expect(!AnswerChecker.matches("merge", "merged"))
    }
}

@MainActor
struct TransferTests {
    private func context() -> ModelContext { ModelContext(AppSchema.makeContainer(inMemory: true)) }

    @Test func acceptsWebFormat2() throws {
        let json = """
        {"app":"levelup","format":2,"exportedAt":"2026-10-29T00:00:00Z","state":{"v":2,"prefs":{"theme":"dark"},
         "items":{"abc":{"s":"kept","at":1788000000000,"day":"2026-10-29"},"2026-10-29:w:nuance":{"s":"done","at":1788000000000,"day":"2026-10-29"},"bad":{"s":"weird"}},
         "scroll":{"abc":{"p":0.4,"at":1788000000000}},
         "words":{"nuance":{"word":"nuance","key":"nuance","meaning":"subtle difference","examples":["e"],"upd":1788000000000,"savedAt":1788000000000,
                  "srs":{"ease":2.5,"reps":2,"interval":6,"due":1788500000000,"lapses":0,"last":1788000000000}}},
         "coreDays":{"2026-10-29":1788000000000},"notes":{},"useful":{"abc":true},
         "writing":[{"id":"w1","itemId":null,"date":"2026-10-29","at":1788000000000,"prompt":"p","text":"hello"}]}}
        """
        let ctx = context()
        let n = try ProgressTransfer.importData(Data(json.utf8), context: ctx)
        #expect(n >= 5)
        let items = try ctx.fetch(FetchDescriptor<ItemProgress>())
        #expect(items.first { $0.key == "abc" }?.status == ItemStatus.kept.rawValue)
        #expect(items.first { $0.key == "abc" }?.scroll == 0.4)
        #expect(items.first { $0.key == "bad" } == nil)
        let w = try ctx.fetch(FetchDescriptor<SavedWord>())
        #expect(w.count == 1 && w[0].interval == 6 && w[0].reps == 2)
        #expect(try ctx.fetch(FetchDescriptor<WritingEntry>()).count == 1)
    }

    @Test func acceptsFormat1AndRejectsGarbage() throws {
        let ctx = context()
        _ = try ProgressTransfer.importData(Data(#"{"app":"levelup","format":1,"state":{"items":{"x":{"s":"done","at":1,"day":"2026-10-01"}}}}"#.utf8), context: ctx)
        #expect(try ctx.fetch(FetchDescriptor<ItemProgress>()).count == 1)
        for bad in ["", "not json", "[]", #"{"app":"other","state":{}}"#, #"{"app":"levelup"}"#, #"{"app":"levelup","state":"x"}"#] {
            #expect(throws: TransferError.self) { try ProgressTransfer.importData(Data(bad.utf8), context: ctx) }
        }
        #expect(throws: TransferError.self) { try ProgressTransfer.importData(Data(#"{"app":"levelup","format":9,"state":{}}"#.utf8), context: ctx) }
    }

    @Test func exportRoundTrip() throws {
        let a = context()
        let r = ItemProgress(key: "2026-10-29:quick:0", date: "2026-10-29", kind: "quick", itemID: "k", status: ItemStatus.kept.rawValue)
        a.insert(r)
        let w = SavedWord(card: WordCardData(id: "lucid", word: "Lucid", meaning: "clear"), origin: "day")
        a.insert(w)
        a.insert(WritingEntry(date: "2026-10-29", prompt: "p", text: "my text"))
        try a.save()
        let data = try ProgressTransfer.export(context: a, prefs: Preferences(defaults: UserDefaults(suiteName: "test-export")!))
        let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(root["app"] as? String == "levelup" && root["format"] as? Int == 2)
        let state = try #require(root["state"] as? [String: Any])
        #expect(((state["items"] as? [String: Any])?["2026-10-29:quick:0"] as? [String: Any])?["s"] as? String == "kept")
        let b = context()
        _ = try ProgressTransfer.importData(data, context: b)
        #expect(try b.fetch(FetchDescriptor<ItemProgress>()).first?.status == ItemStatus.kept.rawValue)
        #expect(try b.fetch(FetchDescriptor<SavedWord>()).first?.word == "lucid")
        #expect(try b.fetch(FetchDescriptor<WritingEntry>()).first?.text == "my text")
    }
}
