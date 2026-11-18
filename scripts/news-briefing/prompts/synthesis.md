Use the selected hydrated stories to write the final briefing JSON. Write all headlines and story bodies in English, translating source material when needed. Each story body must be one paragraph of plain text with no markdown. Use the extracted article bodies in the hydrated selection rather than headline text alone.

Recheck each selected section against the full article bodies and correct it when needed. Classify by the story's subject and geographic relevance, regardless of the publisher's location or language. Barcelona & Catalunya requires a substantive connection to that place; global stories belong in World even when reported by a Catalan outlet.

Return only valid JSON matching this TypeScript type:

```ts
type Briefing = {
  sections: Array<{
    title: "World" | "US" | "Spain" | "Barcelona & Catalunya"
    stories: Array<{
      headline: string
      body: string
      sources: Array<{
        name: string
        url: string
      }>
    }>
  }>
}
```
