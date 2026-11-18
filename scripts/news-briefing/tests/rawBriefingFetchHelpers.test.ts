import { describe, expect, test } from "vitest"
import { createBriefingArticlesFromHeadlineCandidates } from "../createBriefingArticlesFromHeadlineCandidates.ts"
import { getSourceListingPageUrls } from "../getSourceListingPageUrls.ts"
import { shouldUseHeadlineCandidates } from "../shouldUseHeadlineCandidates.ts"
import type { HeadlineCandidate, NewsSourceConfig } from "../types.ts"

describe("raw briefing fetch helpers", () => {
  test("orders listing page URLs with optional fallback preference", () => {
    const sourceConfig: NewsSourceConfig = {
      fallbackUrls: ["https://source.example/rss", "https://source.example/feed"],
      homepageUrl: "https://source.example/news",
      key: "source",
      name: "Source",
    }

    expect(getSourceListingPageUrls(sourceConfig)).toEqual([
      "https://source.example/news",
      "https://source.example/rss",
      "https://source.example/feed",
    ])
    expect(getSourceListingPageUrls({ ...sourceConfig, preferFallbackUrls: true })).toEqual([
      "https://source.example/rss",
      "https://source.example/feed",
      "https://source.example/news",
    ])
  })

  test("uses fallback candidate sets only when the current set is acceptable", () => {
    expect(
      shouldUseHeadlineCandidates({
        candidateCount: 1,
        isFinalListingPage: false,
        maxHeadlinesPerSource: 10,
        preferFallbackUrls: false,
      }),
    ).toBe(false)
    expect(
      shouldUseHeadlineCandidates({
        candidateCount: 5,
        isFinalListingPage: false,
        maxHeadlinesPerSource: 10,
        preferFallbackUrls: false,
      }),
    ).toBe(true)
    expect(
      shouldUseHeadlineCandidates({
        candidateCount: 1,
        isFinalListingPage: false,
        maxHeadlinesPerSource: 10,
        preferFallbackUrls: true,
      }),
    ).toBe(true)
    expect(
      shouldUseHeadlineCandidates({
        candidateCount: 0,
        isFinalListingPage: true,
        maxHeadlinesPerSource: 10,
        preferFallbackUrls: false,
      }),
    ).toBe(true)
  })

  test("converts headline candidates to deduplicated briefing articles", () => {
    const existingArticleUrls = new Set(["https://source.example/already-seen"])
    const candidates: HeadlineCandidate[] = [
      {
        body: "RSS body text that is long enough to preserve in the raw briefing article.",
        headline: "First headline with enough words to keep",
        position: 0,
        url: "https://source.example/story-a",
      },
      {
        headline: "Duplicate headline with enough words to keep",
        position: 1,
        url: "https://source.example/already-seen",
      },
      {
        headline: "Duplicate within candidate set with enough words",
        position: 2,
        url: "https://source.example/story-a",
      },
      {
        headline: "Missing URL headline with enough words to keep",
        position: 3,
        url: "",
      },
    ]

    expect(
      createBriefingArticlesFromHeadlineCandidates({
        candidates,
        existingArticleUrls,
        sourceName: "Source",
      }),
    ).toEqual([
      {
        body: "RSS body text that is long enough to preserve in the raw briefing article.",
        headline: "First headline with enough words to keep",
        source: "Source",
        url: "https://source.example/story-a",
      },
    ])
  })
})
