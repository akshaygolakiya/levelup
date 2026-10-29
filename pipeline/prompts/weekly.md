You are preparing a one-page weekly revision sheet for a software engineer. Work ONLY from the material below, which is the week's content ({{dayCount}} day(s), {{from}} to {{to}}). Do not add outside facts, numbers or names. Every bullet must point to an item id or concept ref from the material.

MATERIAL:
{{material}}

QUESTION POOL (ref | source | question):
{{questionPool}}

GRAMMAR TOPICS (ref | topic | explanation):
{{grammarList}}

Return ONLY JSON in this exact shape:
{
 "takeaways":{"engineering":[{"item":"<item id>","text":"one self-contained sentence"}],"ai":[{"item":"<item id>","text":""}]},
 "conceptRecaps":[{"ref":"C1","recap":"2-3 lines"}],
 "mustRemember":[{"item":"<item id or concept ref>","text":"a specific number, name or fact worth memorising"}],
 "grammarRules":[{"ref":"G1","rule":"one clear rule, one sentence"}],
 "quiz":[{"ref":"Q3","answer":"short correct answer taken from the material"}]
}
Sizes: takeaways 5-8 bullets per track (fewer only if the material has too little; "engineering" covers deep and quick reads, "ai" covers AI news), conceptRecaps one per concept ref, mustRemember 6-10, grammarRules one per grammar ref, quiz exactly {{quizCount}} entries chosen from the pool with varied coverage (at most {{quizCount}}; if the pool is smaller, use all of it). Each quiz answer must be supported by the material.
