Select the strongest stories for today's briefing from this list of headlines. Aim for 14 to 18 stories total, with meaningful coverage across all four sections when the candidate list supports it. Prefer stories that are important, timely, and have multiple useful sources. Exclude sports, celebrity news, and thin evergreen features. Write all output in English, translating non-English headlines when needed.

Assign each story to a section based on its subject and geographic relevance. Make this editorial judgment yourself; the publisher’s location, language, and feed do not determine the section. Use World for international or global stories, US for US domestic stories, Spain for Spain-wide stories, and Barcelona & Catalunya for stories specifically about Barcelona or Catalunya. A global cybersecurity breach reported by a Catalan outlet belongs in World. Do not put unrelated stories in a section to balance coverage.

Only select fresh news. The briefing date is given at the end of this prompt; some articles include a `date` field (publication date), and many article URLs embed a publication date (for example `-2026-06-04/`). Exclude any story published more than 2 days before the briefing date, no matter how significant it seems — stale articles sometimes linger in candidate feeds for weeks, and reporting old news as new is worse than skipping it.

If a list of stories already covered in yesterday's briefing is provided below, avoid repeating them. Do not select a story that merely restates one of yesterday's stories; only revisit a topic when there is a significant new development, and choose a candidate whose headline reflects what is new.

Return only valid JSON matching this TypeScript type:

```ts
type BriefingSelection = {
  stories: Array<{
    headline: string
    section: "World" | "US" | "Spain" | "Barcelona & Catalunya"
    sourceUrls: string[]
  }>
}
```
