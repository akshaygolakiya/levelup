{{profile}}

Below are {{candidateCount}} fresh candidate links (id | source | track | title | snippet). Choose today's reading set:
- "deep": exactly {{deep}} items worth a 15-25 minute careful read. Prefer real engineering write-ups about how large systems work (architecture, scale, incidents, trade-offs) over announcements. Cover different areas of the stack.
- "quick": exactly {{quick}} items for breadth (mix of systems, backend, frontend, cloud, security, general), each worth a short summary.
- "ai": exactly {{ai}} AI items (models, tools, research, practical engineering with LLMs).
- "reserves": for each of deep, quick and ai, {{reserves}} further ranked backups (best first) of the same kind. Backups are used when a page cannot be downloaded, so pick equally good items, not leftovers.
No item may appear twice anywhere (primary or reserve). Skip pure marketing, hiring posts, event promos, and anything with too little substance. Use the snippet to judge.

Already served in the last 14 days (date | title). Do NOT pick the same story, the same release or the same narrow topic again, even from a different source or with a different title:
{{recentTitles}}

Return ONLY JSON: {"deep":["id",...],"quick":["id",...],"ai":["id",...],"reserves":{"deep":["id",...],"quick":["id",...],"ai":["id",...]},"reasons":{"id":"one short sentence on why it earns a place"}}
Give a reason for every id, reserves included.

CANDIDATES:
{{candidates}}
