import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { buildRawBriefing } from "../buildRawBriefing.ts"
import type { NewsSourceConfig } from "../types.ts"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directoryPath of temporaryDirectories.splice(0)) {
    rmSync(directoryPath, { force: true, recursive: true })
  }
})

describe("buildRawBriefing", () => {
  test("limits headlines per source, deduplicates by URL, and writes candidate JSON", async () => {
    const rawDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-raw-"))
    temporaryDirectories.push(rawDirectoryPath)

    const sourceConfigs: NewsSourceConfig[] = [
      {
        homepageUrl: "https://source-one.example/news",
        key: "source-one",
        name: "Source One",
      },
      {
        homepageUrl: "https://source-two.example/news",
        key: "source-two",
        name: "Source Two",
      },
    ]

    const fetchedUrls: string[] = []
    const messages: string[] = []
    const rawBriefing = await buildRawBriefing({
      date: "2026-04-20",
      fetchPageHtml: async url => {
        fetchedUrls.push(url)

        if (url === "https://source-one.example/news") {
          return `
            <h2><a href="/story-a">Story A headline with enough words to keep</a></h2>
            <h2><a href="/story-b">Story B headline with enough words to keep</a></h2>
            <h2><a href="/story-c">Story C headline with enough words to keep</a></h2>
          `
        }

        if (url === "https://source-two.example/news") {
          return `
            <h2><a href="https://source-one.example/story-b">Story B headline with enough words to keep</a></h2>
            <h2><a href="/story-d">Story D headline with enough words to keep</a></h2>
          `
        }

        return `
          <article>
            <p>This is the long article body for ${url}, and it is comfortably longer than forty characters.</p>
          </article>
        `
      },
      log: message => messages.push(message),
      maxHeadlinesPerSource: 2,
      rawDirectoryPath,
      sourceConfigs,
    })

    expect(rawBriefing.date).toBe("2026-04-20")
    expect(rawBriefing.articles).toHaveLength(3)
    expect(rawBriefing.articles[0]).toEqual({
      headline: "Story A headline with enough words to keep",
      source: "Source One",
      url: "https://source-one.example/story-a",
    })
    expect(rawBriefing.articles.map(article => article.url)).toEqual([
      "https://source-one.example/story-a",
      "https://source-one.example/story-b",
      "https://source-two.example/story-d",
    ])
    expect(fetchedUrls).not.toContain("https://source-one.example/story-c")
    expect(messages).toEqual([
      "✅ Source One                     2",
      "✅ Source Two                     2",
    ])
  })

  test("skips source homepages that fail to fetch", async () => {
    const rawDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-raw-"))
    temporaryDirectories.push(rawDirectoryPath)

    const rawBriefing = await buildRawBriefing({
      date: "2026-04-22",
      fetchPageHtml: async url => {
        if (url === "https://broken-source.example/news") throw new Error("homepage failed")

        if (url === "https://working-source.example/news") {
          return `
            <h2><a href="/story-success">Successful story headline with enough words to keep</a></h2>
          `
        }

        return `
          <article>
            <p>This article body is comfortably longer than forty characters and should be kept.</p>
          </article>
        `
      },
      rawDirectoryPath,
      sourceConfigs: [
        {
          homepageUrl: "https://broken-source.example/news",
          key: "broken-source",
          name: "Broken Source",
        },
        {
          homepageUrl: "https://working-source.example/news",
          key: "working-source",
          name: "Working Source",
        },
      ],
    })

    expect(rawBriefing.articles.map(article => article.url)).toEqual([
      "https://working-source.example/story-success",
    ])
  })

  test("uses fallback listing pages when primary pages have too few candidates", async () => {
    const rawDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-raw-"))
    temporaryDirectories.push(rawDirectoryPath)

    const fetchedUrls: string[] = []
    const rawBriefing = await buildRawBriefing({
      date: "2026-04-23",
      fetchPageHtml: async url => {
        fetchedUrls.push(url)

        if (url === "https://blocked-source.example/news")
          return `<h2><a href="/thin-story">Only primary headline with enough words</a></h2>`

        if (url === "https://blocked-source.example/rss") {
          return `
            <rss>
              <channel>
                <item>
                  <title>Fallback RSS headline with enough words to keep</title>
                  <link>https://blocked-source.example/story-from-rss</link>
                  <description>RSS description body that is comfortably longer than forty characters and should be kept.</description>
                </item>
              </channel>
            </rss>
          `
        }

        if (url === "https://blocked-source.example/story-from-rss")
          throw new Error("article blocked")

        return `
          <article>
            <p>This fallback article body is comfortably longer than forty characters and should be kept.</p>
          </article>
        `
      },
      rawDirectoryPath,
      sourceConfigs: [
        {
          fallbackUrls: ["https://blocked-source.example/rss"],
          homepageUrl: "https://blocked-source.example/news",
          key: "blocked-source",
          name: "Blocked Source",
        },
      ],
    })

    expect(fetchedUrls).toContain("https://blocked-source.example/rss")
    expect(rawBriefing.articles.map(article => article.url)).not.toContain(
      "https://blocked-source.example/thin-story",
    )
    expect(rawBriefing.articles[0]).toEqual({
      body: "RSS description body that is comfortably longer than forty characters and should be kept.",
      headline: "Fallback RSS headline with enough words to keep",
      source: "Blocked Source",
      url: "https://blocked-source.example/story-from-rss",
    })
  })

  test("excludes candidates already cited by recent final briefings and stale RSS items", async () => {
    const rawDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-raw-"))
    const briefingDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-final-"))
    temporaryDirectories.push(rawDirectoryPath, briefingDirectoryPath)

    writeFileSync(
      path.join(briefingDirectoryPath, "2026-07-11.json"),
      JSON.stringify({
        sections: [
          {
            stories: [
              {
                body: "Already covered story body",
                headline: "Already covered story",
                sources: [{ name: "Source", url: "https://source.example/already-covered" }],
              },
            ],
            title: "World",
          },
        ],
      }),
    )

    const rawBriefing = await buildRawBriefing({
      briefingDirectoryPath,
      date: "2026-07-12",
      fetchPageHtml: async url => {
        if (url === "https://source.example/feed") {
          return `
            <rss>
              <channel>
                <item>
                  <title>Already covered headline with enough words to keep</title>
                  <link>https://source.example/already-covered</link>
                  <pubDate>Sat, 11 Jul 2026 08:00:00 GMT</pubDate>
                </item>
                <item>
                  <title>Stale item headline with enough words to keep</title>
                  <link>https://source.example/stale-item</link>
                  <pubDate>Thu, 04 Jun 2026 14:40:48 GMT</pubDate>
                </item>
                <item>
                  <title>Fresh item headline with enough words to keep</title>
                  <link>https://source.example/fresh-item</link>
                  <pubDate>Sun, 12 Jul 2026 06:00:00 GMT</pubDate>
                </item>
              </channel>
            </rss>
          `
        }

        throw new Error(`unexpected fetch: ${url}`)
      },
      rawDirectoryPath,
      sourceConfigs: [
        {
          fallbackUrls: ["https://source.example/feed"],
          homepageUrl: "https://source.example/news",
          key: "source",
          name: "Source",
          preferFallbackUrls: true,
        },
      ],
    })

    expect(rawBriefing.articles).toEqual([
      {
        date: "2026-07-12",
        headline: "Fresh item headline with enough words to keep",
        source: "Source",
        url: "https://source.example/fresh-item",
      },
    ])
  })

  test("can prefer fallback listing pages over primary pages", async () => {
    const rawDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-raw-"))
    temporaryDirectories.push(rawDirectoryPath)

    const fetchedUrls: string[] = []
    const rawBriefing = await buildRawBriefing({
      date: "2026-04-24",
      fetchPageHtml: async url => {
        fetchedUrls.push(url)

        if (url === "https://source.example/feed") {
          return `
            <rss>
              <channel>
                <item>
                  <title>Preferred feed headline with enough words to keep</title>
                  <link>https://source.example/feed-story</link>
                  <description>Preferred feed body that is comfortably longer than forty characters and should be kept.</description>
                </item>
              </channel>
            </rss>
          `
        }

        return `<h2><a href="/primary-story">Primary homepage headline with enough words to keep</a></h2>`
      },
      rawDirectoryPath,
      sourceConfigs: [
        {
          fallbackUrls: ["https://source.example/feed"],
          homepageUrl: "https://source.example/news",
          key: "source",
          name: "Source",
          preferFallbackUrls: true,
        },
      ],
    })

    expect(fetchedUrls[0]).toBe("https://source.example/feed")
    expect(rawBriefing.articles).toEqual([
      {
        body: "Preferred feed body that is comfortably longer than forty characters and should be kept.",
        headline: "Preferred feed headline with enough words to keep",
        source: "Source",
        url: "https://source.example/feed-story",
      },
    ])
  })
})
