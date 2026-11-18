import { Either, Schema } from "effect"
import { describe, expect, test } from "vitest"

import {
  BriefingSelectionSchema,
  FinalBriefingSchema,
  HydratedBriefingSelectionSchema,
  NewsSourceConfigSchema,
  RawBriefingSchema,
} from "../schemas.ts"

describe("news briefing schemas", () => {
  test("decodes valid news briefing boundary data", () => {
    const sourceConfig = Schema.decodeUnknownSync(NewsSourceConfigSchema)({
      fallbackUrls: ["https://example.com/world"],
      homepageUrl: "https://example.com",
      key: "example",
      name: "Example News",
      preferFallbackUrls: true,
    })

    const rawBriefing = Schema.decodeUnknownSync(RawBriefingSchema)({
      articles: [
        {
          body: "A useful article body.",
          headline: "Major world story",
          source: "Example News",
          url: "https://example.com/story",
        },
      ],
      date: "2026-06-04",
    })

    const selection = Schema.decodeUnknownSync(BriefingSelectionSchema)({
      stories: [
        {
          headline: "Major world story",
          section: "World",
          sourceUrls: ["https://example.com/story"],
        },
      ],
    })

    const hydratedSelection = Schema.decodeUnknownSync(HydratedBriefingSelectionSchema)({
      date: "2026-06-04",
      stories: [
        {
          headline: "Major world story",
          section: "World",
          sources: [
            {
              body: "A useful article body.",
              headline: "Major world story",
              source: "Example News",
              url: "https://example.com/story",
            },
          ],
        },
      ],
    })

    const finalBriefing = Schema.decodeUnknownSync(FinalBriefingSchema)({
      sections: [
        {
          title: "World",
          stories: [
            {
              body: "A concise briefing paragraph.",
              headline: "Major world story",
              sources: [{ name: "Example News", url: "https://example.com/story" }],
            },
          ],
        },
      ],
    })
    expect(sourceConfig.name).toBe("Example News")
    expect(rawBriefing.articles[0]?.body).toBe("A useful article body.")
    expect(selection.stories[0]?.section).toBe("World")
    expect(hydratedSelection.date).toBe("2026-06-04")
    expect(finalBriefing.sections[0]?.title).toBe("World")
  })

  test("rejects malformed briefing boundary data", () => {
    const rawBriefingResult = Schema.decodeUnknownEither(RawBriefingSchema)({
      articles: [{ headline: "Missing required fields" }],
      date: "2026-06-04",
    })

    const selectionResult = Schema.decodeUnknownEither(BriefingSelectionSchema)({
      stories: [
        {
          headline: "Bad section",
          section: "Sports",
          sourceUrls: ["https://example.com/story"],
        },
      ],
    })

    const finalBriefingResult = Schema.decodeUnknownEither(FinalBriefingSchema)({
      sections: [
        {
          title: "Sports",
          stories: [],
        },
      ],
    })

    expect(Either.isLeft(rawBriefingResult)).toBe(true)
    expect(Either.isLeft(selectionResult)).toBe(true)
    expect(Either.isLeft(finalBriefingResult)).toBe(true)
  })
})
