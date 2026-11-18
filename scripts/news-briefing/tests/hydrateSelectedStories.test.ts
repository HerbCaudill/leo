import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { ARTICLE_FETCH_CONCURRENCY } from "../constants.ts"
import { hydrateSelectedStories } from "../hydrateSelectedStories.ts"
import { HttpService, LoggingService } from "../runtimeServices.ts"
import type { BriefingSelection, RawBriefing } from "../types.ts"

describe("hydrateSelectedStories", () => {
  test("preserves existing RSS bodies without fetching article pages", async () => {
    const hydratedSelection = await hydrateSelectedStories(
      {
        articles: [
          {
            body: "RSS body text that is long enough to preserve during selected story hydration.",
            headline: "RSS story",
            source: "RSS Source",
            url: "https://rss.example/story",
          },
        ],
        date: "2026-06-04",
      },
      {
        stories: [
          {
            headline: "RSS story",
            section: "World",
            sourceUrls: ["https://rss.example/story"],
          },
        ],
      },
    ).pipe(
      Effect.provide(
        makeTestServices(async url => {
          throw new Error(`Existing RSS body should not be fetched: ${url}`)
        }),
      ),
      Effect.runPromise,
    )

    expect(hydratedSelection.stories[0]?.sources).toEqual([
      {
        body: "RSS body text that is long enough to preserve during selected story hydration.",
        headline: "RSS story",
        source: "RSS Source",
        url: "https://rss.example/story",
      },
    ])
  })

  test("limits selected article fetch concurrency", async () => {
    let activeFetches = 0
    let maxActiveFetches = 0
    const articles = Array.from({ length: ARTICLE_FETCH_CONCURRENCY + 2 }, (_, index) => ({
      headline: `Selected story ${index}`,
      source: "Source",
      url: `https://source.example/story-${index}`,
    }))

    await hydrateSelectedStories(
      { articles, date: "2026-06-04" },
      {
        stories: [
          {
            headline: "Selected stories",
            section: "World",
            sourceUrls: articles.map(article => article.url),
          },
        ],
      },
    ).pipe(
      Effect.provide(
        makeTestServices(async () => {
          activeFetches += 1
          maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
          await new Promise(resolve => setTimeout(resolve, 0))
          activeFetches -= 1

          return `<article><p>The fetched selected story body is long enough to keep as article text.</p></article>`
        }),
      ),
      Effect.runPromise,
    )

    expect(maxActiveFetches).toBe(ARTICLE_FETCH_CONCURRENCY)
  })

  test("fetches and adds full article bodies only for selected source urls", async () => {
    const fetchedUrls: string[] = []
    const hydratedSelection = await hydrateSelectedStories(rawBriefing, selection).pipe(
      Effect.provide(
        makeTestServices(async url => {
          fetchedUrls.push(url)
          return `<article><p>The fetched selected story body is long enough to keep as article text.</p></article>`
        }),
      ),
      Effect.runPromise,
    )

    expect(fetchedUrls).toEqual(["https://bbc.example/ceasefire"])
    expect(hydratedSelection).toEqual({
      date: "2026-06-04",
      stories: [
        {
          headline: "Ceasefire story",
          section: "World",
          sources: [
            {
              body: "The fetched selected story body is long enough to keep as article text.",
              headline: "Israel and Lebanon agree to implement ceasefire",
              source: "BBC News",
              url: "https://bbc.example/ceasefire",
            },
          ],
        },
      ],
    })
  })
})

/** Create test services for selected-story hydration. */
function makeTestServices(
  /** The page fetcher to expose through HttpService. */
  fetchPageHtml: (url: string) => Promise<string>,
) {
  return Layer.mergeAll(HttpService.LiveFromFetcher(fetchPageHtml), LoggingService.LiveFromLogger())
}

const rawBriefing: RawBriefing = {
  articles: [
    {
      headline: "Israel and Lebanon agree to implement ceasefire",
      source: "BBC News",
      url: "https://bbc.example/ceasefire",
    },
    {
      headline: "Celebrity birthday story",
      source: "BBC News",
      url: "https://bbc.example/celebrity",
    },
  ],
  date: "2026-06-04",
}

const selection: BriefingSelection = {
  stories: [
    {
      headline: "Ceasefire story",
      section: "World",
      sourceUrls: ["https://bbc.example/ceasefire"],
    },
  ],
}
