import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { buildRawBriefing } from "../buildRawBriefing.ts"

describe("buildRawBriefing selection-only fetch", () => {
  test("writes candidate metadata without fetching article bodies", async () => {
    const rawDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-raw-selection-only-"))
    const fetchedUrls: string[] = []

    const rawBriefing = await buildRawBriefing({
      date: "2026-06-05",
      fetchPageHtml: async url => {
        fetchedUrls.push(url)

        if (url === "https://source.example/news")
          return `<h2><a href="/story-a">Story A headline with enough words to keep</a></h2>`

        throw new Error(`Article body should not be fetched: ${url}`)
      },
      rawDirectoryPath,
      sourceConfigs: [
        {
          homepageUrl: "https://source.example/news",
          key: "source",
          name: "Source",
        },
      ],
    })

    expect(fetchedUrls).toEqual(["https://source.example/news"])
    expect(rawBriefing.articles).toEqual([
      {
        headline: "Story A headline with enough words to keep",
        source: "Source",
        url: "https://source.example/story-a",
      },
    ])
    expect(
      JSON.parse(readFileSync(path.join(rawDirectoryPath, "2026-06-05.json"), "utf8")),
    ).toEqual(rawBriefing)
  })
})
