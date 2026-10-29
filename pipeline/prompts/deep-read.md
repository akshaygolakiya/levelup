{{profile}}

Rules: use ONLY facts stated in the source text. Do not invent numbers, names or claims. If the text does not support a point, leave it out.

For each article below return a JSON array with one object per article in this exact shape:
{"id":"<same id>","tldr":"at most 2 sentences","beforeYouRead":[{"term":"","explain":"one or two sentences"}],"keyIdeas":["5-7 specific points with numbers/names from the article"],"seniorLens":"what a very experienced engineer would notice: trade-offs, risks, what the article glosses over","whyItMatters":"1-2 sentences","forYou":"how a full-stack engineer can use or learn from this","questions":["2 recall questions"],"tags":["3-4 lowercase tags"]}

Return ONLY JSON.

{{articles}}
