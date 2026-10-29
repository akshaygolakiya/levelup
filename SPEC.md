# LevelUp — personal daily learning app (working name)

Personal use only. No ads, no paywall, no analytics, no App Store release.

## 1. Goal

Get better every day at two things, for as long or as little time as the day allows:

1. **Engineering** — how large systems really work, and what is new in AI, at the level of a working SDE.
2. **English** — vocabulary, grammar and speaking, for meetings, interviews and everyday use.

Principles:
- **Quality over volume.** Fewer, better, verified items beat a firehose.
- **Depth on demand.** A small core you can finish in 20 minutes, with enough extra material behind it to fill a two-hour day. Skipping the extra never costs anything.
- **Nothing to run.** No server code. One job on the Mac, static files online.

Non-goals: live AI chat inside the app, accounts, social features, multi-user.

## 2. Architecture

```
 Mac (LaunchAgent, once per day)
   1. fetch sources (RSS + full article text)
   2. generate with Claude Code (`claude -p`, best model, personal Claude account)
   3. verify pass, validate JSON
   4. write site/data/YYYY-MM-DD.json + update index.json
   5. deploy site/ to Cloudflare Pages (wrangler, no git)
                         │
                         ▼
        Cloudflare Pages  ──►  iOS app (SwiftUI)   reads JSON
        (static files)    ──►  Web app (Mac/phone) reads JSON
```

State that is personal stays on the device: streaks, saved words, spaced-repetition schedule, highlights, notes, recordings. Content is public-style (summaries and lessons) and carries no personal data.

## 3. Daily job

**Trigger** (LaunchAgent in `~/Library/LaunchAgents/`):
- `RunAtLoad`: runs at login.
- `StartCalendarInterval` 06:00: launchd runs it on wake if the Mac was asleep.
- Guard: exits at once if today's file already exists and validates.
- Waits and retries for the network on start. On any failure the day is not marked done, so the next wake or login retries.
- macOS notification when ready. Log file per run.

**Execution:**
- Headless `claude -p` with `CLAUDE_CONFIG_DIR=~/.claude-personal` (Pro plan), best available model.
- About 12–15 calls a day, not one per item: Select (1); Write batched by type (deep reads ~1 each, quick reads and AI news in groups); Verify per batch; Concepts, Words, Grammar and Prompts (1 each). Fewer, larger calls use fewer of the Pro limits, but each call stays small enough that output is not truncated and one failure does not lose the day.
- Locked down: a tool allowlist limited to reading fetched sources and writing the output folder.
- Overall timeout, and a hard stop on repeated failures.
- Pro usage limits apply (rolling window plus weekly cap). Best-model generation draws from them heavily, so the job is split into small stages (below). If a limit is hit, completed stages are kept and the rest resume at the next trigger.

## 4. Content quality system

This is the part that decides whether the app is worth opening.

**Sources** (editable `pipeline/sources.json`, 55 feeds, graded A/B, each with its own look-back window so rare posters are not missed). Chosen from what experienced engineers actually recommend (Hacker News "what blogs do you read" threads, engineering-newsletter roundups), keeping only feeds that were tested live and post real substance. Reddit blocks automated reading, so it was not used.
- Company engineering blogs (how real systems work): Netflix, Cloudflare, Meta, GitHub, Stripe, Discord, Shopify, Figma, Spotify, Slack, Dropbox, Airbnb, PlanetScale, AWS Architecture, Google Cloud SRE, Fly.io.
- Senior individual voices: Dan Luu, Marc Brooker, Murat Demirbas, Martin Kleppmann, Aphyr, Brendan Gregg, Hillel Wayne, Will Larson, Charity Majors, Phil Eaton, matklad, Eli Bendersky, Julia Evans, Martin Fowler; Pragmatic Engineer, Neo Kim's System Design, ByteByteGo, Refactoring.
- Security: Krebs, Schneier, Troy Hunt. Frontend and web: web.dev, Josh Comeau, Dan Abramov, Go Blog.
- AI: Simon Willison, Latent Space, Interconnects, Sebastian Raschka, Hamel Husain, Eugene Yan, Lilian Weng, Karpathy, Hugging Face, OpenAI, DeepMind, Import AI, Google Research.
- Community curation, which link out to the original article: Hacker News (score 150+) and Lobsters.
- Not yet covered: Anthropic's blog and Uber Engineering (no usable feed; need a small page scraper), High Scalability and Jepsen (feeds gone). Roundup newsletters such as TLDR are excluded on purpose because their items are link lists, not articles.
- Evergreen classics (later): papers (Dynamo, Raft, Spanner, MapReduce, Kafka, etc.) and a curated case-study series list.

**Pipeline stages (each a separate small `claude -p` call):**
1. **Collect.** Pull feeds, fetch full text with a readability extractor, drop duplicates, anything already served, and anything under a minimum length.
2. **Select.** Rank candidates against the goals and pick the day's items, with a short reason for each pick. Rotate topic tracks so the mix stays balanced.
3. **Write.** Per item, summarize strictly from the fetched text: TL;DR, key ideas, "why it matters", "how this applies to your work", and 2 recall questions. Never add facts that are not in the source.
4. **Verify.** A second pass checks each item against its source text, flags unsupported claims, and rewrites or drops them. Every item keeps its original URL.
5. **Validate.** Schema check on the JSON. Anything malformed is regenerated, not shipped.

**Level calibration:** a `profile.yaml` (role, 1.5–2 years of experience, stack, current focus, weak areas) is part of every prompt. The *content* is deliberately pitched at senior-engineer depth (trade-offs, failure modes, scale numbers, "what would you do differently"), because the goal is to close the gap to 10 years of experience. The *explanation* stays accessible: any prerequisite concept a junior might lack is defined in a short "Before you read" note, so depth never turns into confusion.

**Feedback loop:** a "useful / not useful" mark in the app is saved on-device and can be exported as a small file that the job reads, so the selection step learns your taste over time.

## 5. Daily content

| Section | Per day | Purpose |
|---|---|---|
| Deep reads | 3–4 | Long, high-value engineering write-ups with full takeaways |
| Quick reads | 10–15 | Short summaries, for breadth |
| AI news | 5–8 | New models, papers, tools, with practical implications |
| Concept / series part | 1–2 | Ordered curriculum: system design, distributed systems, databases, AI engineering |
| Paper breakdown | 0–1 | Plain-language walkthrough of a classic or new paper |
| Words | 15–20 | Never repeated; meaning, pronunciation, examples, synonyms, etymology, a work-context sentence |
| Grammar | 2–3 | Short lesson plus exercises, ordered by a curriculum |
| Speaking and writing prompts | 5+ | Meetings, interviews, everyday talk, tech explanations |

The app shows a light core first (roughly 20 minutes) and everything else under "More for today".

**Original article link (hard requirement):** every article, AI news item and paper carries its original `url` and `source`. The reader always shows a clear "Read full article" button (opens in the in-app Safari view on iOS, a new tab on web) next to the summary, plus the source name and publish date. Summaries are a shortcut to the original, never a replacement. The pipeline drops any item whose URL it cannot keep.

## 5b. Missed days, catch-up and no repeats

**Day-wise archive.** Every day is its own file and stays available, so you can open yesterday, 3 days ago or last week exactly as it was. The app has a date strip (swipe or tap a day) and a calendar view. Nothing expires.

**Read state is per item, on your device.** Each article, word, lesson and prompt is marked unread, in progress (with scroll position) or done. A day shows as "3 of 12 done", and a half-read article resumes where you stopped.

**Catch-up view.** A "Catch up" section on Today lists unfinished items from the last 3 days (adjustable), grouped by day, newest first, with time estimates. It is an optional shortcut and never shown as a debt: no red badges, no guilt counters, and the streak only counts the light core.

**Skipped items do not come back as repeats.** Today's job generates new material; yesterday's unread items stay in yesterday's file, where Catch up and the archive find them. Spaced repetition for words you already studied is separate and happens on the device.

**No repeats across days, enforced in four ways:**
1. Articles: every item is fingerprinted by its normalised URL, and the job never selects a fingerprint it has served before (`history.json`).
2. Same story, different link: the select step is also given the last 14 days of served titles and told to skip anything covering the same story or topic.
3. Words: every served word is stored in lowercase; the generator is given the list and told not to reuse any, and the validate step rejects the day if a duplicate slips through.
4. Lessons: concepts, grammar topics and series parts follow an ordered curriculum with a pointer that only advances after a day is published successfully.

History is written only after a day passes validation, so a failed run repeats nothing and loses no curriculum position.

## 6. English module

- **Vocabulary:** a mix of everyday, advanced, and work/interview vocabulary. The job keeps its own history of served words, so none repeat. In the app, any word in a tech article can be tapped and saved. Spaced repetition runs on-device.
- **Grammar:** an ordered curriculum with exercises. Mistakes you record in the app are kept on-device and can be exported to steer later lessons.
- **Speaking** (all on-device, no live AI):
  - prompt of the day (e.g. "explain a system outage to a manager", "answer: tell me about a challenge");
  - record and play back yourself, with Apple speech-to-text transcribing it;
  - a local check for filler words, pace and length;
  - shadowing: listen to a model sentence read by text-to-speech, then repeat it.
- **Writing:** a daily 3-sentence entry. Corrections are not live; you can paste entries into a Claude chat if you want feedback.
- **Bridge:** "explain today's article out loud in one minute".

## 7. Data format

`site/data/index.json`: list of available dates with counts and the schema version.
`site/data/YYYY-MM-DD.json`:

```json
{
  "schema": 1, "date": "2026-10-30", "generatedAt": "...",
  "tech": {
    "deepReads":  [{ "id": "", "title": "", "source": "", "url": "", "minutes": 0,
                     "tldr": "", "keyIdeas": [""], "whyItMatters": "", "forYou": "",
                     "questions": [""], "tags": [""] }],
    "quickReads": [], "aiNews": [], "concepts": [], "papers": []
  },
  "english": {
    "words":    [{ "word": "", "pos": "", "ipa": "", "meaning": "", "examples": [""],
                   "synonyms": [""], "etymology": "", "workSentence": "" }],
    "grammar":  [{ "topic": "", "explanation": "", "exercises": [] }],
    "speaking": [{ "prompt": "", "context": "meeting|interview|daily", "tips": [""] }],
    "writing":  []
  }
}
```

A schema version lets older app builds keep working after format changes.

## 8. Apps

**iOS (SwiftUI, SwiftData):** Today screen, article reader with highlights and notes, word cards and review, speaking practice, archive by date, streak, optional morning notification and widget. Installed on your own device with your developer account; no release process.

**Web (static, no framework needed beyond a small bundle):** the same reading and word-review experience for Mac and phone browsers. Progress is stored in the browser. Because iOS and web progress are separate, an iCloud/CloudKit or export/import sync is a later phase.

## 8b. Design and UX

**Visual language: glassmorphism, done with restraint.**
- Frosted translucent cards (background blur plus a thin light border and soft shadow) floating over a slowly shifting gradient or mesh background. Native `Material` / `ultraThinMaterial` on iOS, `backdrop-filter: blur()` on web.
- Two themes, light and dark, each with its own tuned gradient. Reading surfaces get a more opaque glass so long text keeps strong contrast (WCAG AA); pure glass is used only for chrome, cards and controls.
- Colour by area: one accent family for Tech, another for English, so you always know where you are.
- Typography: a clean sans for UI, a readable serif option for long articles, generous line height, adjustable text size.

**Interaction and motion:**
- Today screen with two large glass "rings" (Tech and English) that fill as you finish items, plus a streak flame.
- Card stack for quick reads: swipe right to keep, left to skip; tap to expand into the full reader with a shared-element transition.
- Word cards flip to reveal the meaning; swipe for Again / Good / Easy (spaced repetition); tap the speaker for pronunciation.
- Reader: reading-progress bar, tap-a-word to save it, long-press to highlight, bottom sheet for notes, and a "recall questions" glass sheet at the end.
- Speaking screen: a pulsing glass orb that reacts to your voice level while recording, then a transcript with highlighted filler words.
- Spring animations, haptics on key actions (iOS), and Reduce Motion and Reduce Transparency respected (flat solid fallback).
- Widgets and a Lock Screen glance for streak and word of the day.

**UX principles:**
- One obvious next action on the Today screen ("Continue"), never a wall of lists.
- A time-box chip ("Quick 15 / Standard 45 / Deep 2h") that reorders what is shown, without hiding anything.
- No guilt mechanics: the streak counts the light core only; unread items are never shown as a backlog count.
- Everything resumable; offline reading of any downloaded day; fast cold start.
- Accessibility: Dynamic Type, VoiceOver labels, sufficient contrast, 44pt touch targets.
- The web app mirrors the same design system (shared tokens for colours, radii, blur, spacing) so the two feel like one product.

Design process: before building screens I will search Mobbin for reference patterns (reading apps, flashcards, daily-habit apps), propose the Today, reader, word-card and speaking screens as visual mockups for your approval, and only then implement.

## 9. Hosting

Cloudflare Pages, deployed with `wrangler pages deploy site` (no git). Default `*.pages.dev` address. Optional later: Cloudflare Access to put a login in front of it.

## 10. Build order

1. **Pipeline (first, everything depends on it):** sources, collect, select, write, verify, validate; run manually and review the output quality.
2. **Publish and schedule:** Cloudflare deploy, the LaunchAgent, the day guard, retry and notification.
3. **Web app:** read and review, to start using the content right away.
4. **iOS app:** Today, reader, words with spaced repetition, speaking practice.
5. **Depth:** learning tracks, series, paper breakdowns, widget, feedback export, sync.

Quality check at the end of step 1: I run it for a few days and we review real output together before building any UI.

## 11. Risks

- **Pro limits.** Best-model runs are heavy. Mitigation: staged calls, resume at the next trigger, and a settings switch to use a lighter model for the bulk word lists.
- **Mac off or asleep all day.** No new content; the app shows the previous unread items.
- **Source blocking or paywalls.** Such items fall back to the feed excerpt with a link out, or get dropped.
- **Summary accuracy.** Reduced by writing only from fetched text plus the verify pass, but not eliminated; every item links to the original.
- **Your Mac is fragile.** The job is one short process per day with a timeout. Builds and tests will be run carefully and one at a time.

## 12. Open questions

Resolved:
1. The job runs on the `claude-personal` profile (`CLAUDE_CONFIG_DIR=~/.claude-personal`).
1b. Stack/focus: full-stack, wants broad knowledge across everything in tech (frontend, backend, databases, infra/cloud, mobile, AI, system design, security). Tracks and the "for you" notes cover the whole stack, not one specialty.
2. About 1.5–2 years of experience; content is pitched at senior depth with prerequisites explained.
3. Name: LevelUp.

Still open:
- Any sources to add or exclude from the starter list.
