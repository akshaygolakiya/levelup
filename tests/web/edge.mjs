// Fixture: hostile and awkward content (HTML/script, missing fields, huge, RTL, emoji, non-ASCII).
const DATE = '2026-10-28';
export const HUGE = 'Lorem ipsum dolor sit amet, '.repeat(2200); // ~60k chars
export const LONGWORD = 'Supercalifragilistic'.repeat(20);
export function edgeDay(base) {
  const deep = (o) => ({ keyIdeas: ['Idea one <b>bold</b>', 'Idea two'], whyItMatters: 'Because.', forYou: 'You.', questions: ['What is <i>this</i>?'], tags: ['t'], minutes: 10, kind: 'deep', publishedAt: '2026-10-27T10:00:00Z', beforeYouRead: [{ term: 'Café <u>term</u>', explain: 'A naïve explanation.' }], ...o });
  const quick = (o) => ({ tldr: 'Short.', keyIdea: 'Idea.', whyItMatters: 'Why.', tags: ['x'], minutes: 3, kind: 'quick', publishedAt: '2026-10-26T10:00:00Z', ...o });
  return {
    schema: 1, date: DATE, generatedAt: '2026-10-28T04:00:00Z',
    tech: {
      deepReads: [
        deep({ id: 'e-deep-1', title: '<script>window.__pwned=1</script>Title <b>html</b> & "quotes"', source: '<img src=x onerror="window.__pwned=2">Src', url: 'https://example.com/a?x=1&y=<2>', tldr: '<script>window.__pwned=3</script>The café serves naïve, résumé-driven engineers. Metastable, idempotent; load balancer.' }),
        deep({ id: 'e-deep-2', title: LONGWORD + ' ' + 'x'.repeat(300), tldr: HUGE, keyIdeas: [HUGE.slice(0, 5000)], minutes: 999 }),
        deep({ id: 'e-deep-3', title: 'Missing url and source', tldr: 'No link here.' }),
      ],
      quickReads: [
        quick({ id: 'e-q-1', title: 'مرحبا بالعالم: عنوان طويل جدا للاختبار في اتجاه من اليمين إلى اليسار', source: 'مصدر', url: 'https://example.com/rtl', tldr: 'نص تجريبي بالعربية لاختبار اتجاه الكتابة ' + 'كلمة '.repeat(40) }),
        quick({ id: 'e-q-2', title: '🚀🔥 Deploying on Friday 🎉👩🏽‍💻', source: 'Emoji Weekly', url: 'https://example.com/emoji' }),
        quick({ id: 'e-q-3', title: 'javascript: url must not become a link', source: 'Bad', url: 'javascript:alert(1)' }),
        quick({ id: 'e-q-4', title: 'No url at all', source: 'None', minutes: 40 }),
        quick({ id: 'e-q-5', title: 'Long minutes capped', source: 'S', url: 'https://example.com/long', minutes: 60 }),
      ],
      aiNews: [quick({ id: 'e-ai-1', title: 'AI <img src=x onerror=window.__pwned=4>', source: 'AI', url: 'https://example.com/ai', kind: 'ai', whySelected: 'Chosen because it is <b>relevant</b>.' })],
      concept: { track: 'System <b>Design</b>', title: 'Concept with <script>window.__pwned=5</script> html', minutes: 10, intro: 'Intro paragraph with café and naïve. Load balancer, metastable; idempotent.', sections: [{ heading: 'Section <i>1</i>', body: 'Body one.\n\nBody two with <script>window.__pwned=6</script>.' }], diagram: 'A -> B\n  |\n  v\n  C', commonMistakes: ['m1'], interviewQuestions: ['iq1'], questions: ['q1', 'q2'] },
    },
    english: {
      words: [
        { word: '<b>bold</b>', pos: 'noun', ipa: '/x/', meaning: 'meaning <script>window.__pwned=7</script>', examples: ['ex'], synonyms: ['s'], level: 'advanced' },
        { word: 'naïve', pos: 'adjective', ipa: '/naɪˈiːv/', meaning: 'lacking experience', examples: ['A naïve plan.'], synonyms: [], level: 'basic' },
        { word: '🙂', pos: 'emoji', meaning: 'smile', examples: [], synonyms: [] },
        { word: 'w4', meaning: 'm' }, { word: 'w5', meaning: 'm' }, { word: 'w6', meaning: 'm' },
      ],
      grammar: { topic: 'Topic <b>html</b>', minutes: 4, explanation: 'Explain <script>window.__pwned=8</script>.', commonErrors: [{ wrong: 'w <b>', right: 'r', why: 'y' }], exercises: [{ type: 'fill-blank', prompt: 'I ___ <b>x</b> it.', answer: 'did', explanation: 'e' }, { type: 'weird-type', prompt: 'Unknown type prompt', answer: 'a' }, { prompt: '', answer: 'skip me' }] },
      speaking: [{ prompt: 'Speak about <script>window.__pwned=9</script>', context: 'meeting', tips: ['t'], usefulPhrases: ['phrase <b>1</b>'] }],
      writing: [{ prompt: 'Write <b>this</b>', tip: 'tip' }],
    },
  };
}
