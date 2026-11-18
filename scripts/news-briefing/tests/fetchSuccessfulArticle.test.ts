import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { fetchSuccessfulArticle } from "../fetchSuccessfulArticle.ts"
import { HttpService } from "../runtimeServices.ts"
import type { RawBriefingArticle } from "../types.ts"

describe("fetchSuccessfulArticle", () => {
  test("returns articles that already have bodies without fetching", async () => {
    const article: RawBriefingArticle = {
      body: "Existing body",
      headline: "Headline",
      source: "Source",
      url: "https://example.com/story",
    }

    const result = await fetchSuccessfulArticle(article).pipe(
      Effect.provide(
        HttpService.LiveFromFetcher(async () => {
          throw new Error("should not fetch")
        }),
      ),
      Effect.runPromise,
    )

    expect(result).toEqual(article)
  })

  test("retries temporary fetch failures and returns extracted article text", async () => {
    let attempts = 0

    const result = await fetchSuccessfulArticle(baseArticle).pipe(
      Effect.provide(
        HttpService.LiveFromFetcher(async () => {
          attempts += 1

          if (attempts < 2) throw new Error("temporary failure")

          return `<article><p>The fetched article paragraph is long enough to keep after extraction.</p></article>`
        }),
      ),
      Effect.runPromise,
    )

    expect(result).toEqual({
      ...baseArticle,
      body: "The fetched article paragraph is long enough to keep after extraction.",
    })
    expect(attempts).toBe(2)
  })

  test("returns null when fetching never succeeds", async () => {
    await expect(
      fetchSuccessfulArticle(baseArticle).pipe(
        Effect.provide(
          HttpService.LiveFromFetcher(async () => {
            throw new Error("blocked")
          }),
        ),
        Effect.runPromise,
      ),
    ).resolves.toBeNull()
  })

  test("returns null when no article text can be extracted", async () => {
    await expect(
      fetchSuccessfulArticle(baseArticle).pipe(
        Effect.provide(
          HttpService.LiveFromFetcher(async () => `<article><p>Too short.</p></article>`),
        ),
        Effect.runPromise,
      ),
    ).resolves.toBeNull()
  })
})

const baseArticle: RawBriefingArticle = {
  headline: "Headline",
  source: "Source",
  url: "https://example.com/story",
}
