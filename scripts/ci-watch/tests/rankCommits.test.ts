import { describe, expect, it } from "vitest"

import { rankCommits } from "../rankCommits.ts"

/** A commit that changed the given files. */
const commit = (sha: string, files: string[], patch = "") => ({ sha, subject: sha, files, patch })

/** A failed step's log lines, as gh prints them. */
const log = (...lines: string[]) =>
  lines.map(line => `check\tTest\t2026-11-22T12:19:27.1880289Z ${line}`).join("\n")

/** The commits that the evidence points to, strongest first. */
const blamed = (...args: Parameters<typeof rankCommits>) =>
  rankCommits(...args)
    .filter(ranked => ranked.score > 0)
    .map(ranked => ranked.sha)

describe("rankCommits", () => {
  it("blames the English edit for stale help translations", () => {
    const commits = [
      commit("newer", ["packages/help/articles/visualizations/en-US.md"]),
      commit("culprit", [
        "packages/help/articles/enter-direct-entry-data/en-US.md",
        "packages/help/articles/enter-direct-entry-data/fr-FR.md",
      ]),
    ]
    const failure = log(
      '\u001b[31m+   "fr-FR article enter-direct-entry-data: stale",\u001b[39m',
      '^[[31m+   "ar article enter-direct-entry-data: stale",^[[39m',
    )
    expect(blamed(commits, failure)[0]).toBe("culprit")
    expect(blamed(commits, failure)).not.toContain("newer")
  })

  it("resolves a package's paths in a type error", () => {
    const commits = [
      commit("newer", ["apps/web/src/features/people/UserDetail.tsx"]),
      commit("culprit", ["apps/web/src/routing/routeManifest.ts"]),
    ]
    const failure = log(
      "##[error]apps/web typecheck: src/routing/routeManifest.ts(768,5): error TS2322: Type is wrong.",
    )
    expect(blamed(commits, failure)[0]).toBe("culprit")
  })

  it("blames a change beside a failing test", () => {
    const commits = [
      commit("newer", ["apps/web/src/App.tsx"]),
      commit("culprit", ["data/loura/scripts/model/auxiliary.ts"]),
    ]
    const failure = log(
      "data/loura test: ^[[41m FAIL ^[[49m scripts/model/tests/auxiliary.test.ts > auxiliary content",
    )
    expect(blamed(commits, failure)).toEqual(["culprit"])
  })

  it("blames the commit that wrote the text a stale catalog is missing", () => {
    const commits = [
      commit("newer", ["apps/web/src/Other.tsx"], '+  const label = "Something unrelated"'),
      commit(
        "culprit",
        ["apps/web/src/Periods.tsx"],
        "+  <Trans>No open reporting periods</Trans>",
      ),
    ]
    const failure = log('apps/web i18n:check: +      "source": "No open reporting periods"')
    expect(blamed(commits, failure)).toEqual(["culprit"])
  })

  it("blames the commit that changed a message whose translation doesn't match", () => {
    const commits = [
      commit("newer", ["apps/web/src/Other.tsx"]),
      commit("culprit", ["apps/web/src/Page.tsx"], "+#. js-lingui-id: Zh91Ob"),
    ]
    const failure = log("apps/web i18n:check: Error: ICU contract mismatch for Zh91Ob in zh-CN.")
    expect(blamed(commits, failure)).toEqual(["culprit"])
  })

  it("doesn't blame a commit for a test that passed", () => {
    const commits = [commit("bystander", ["packages/help/src/buildHelp.ts"]), commit("other", [])]
    const failure = log("packages/help test:  ✓ src/tests/buildHelp.test.ts (12 tests) 80ms")
    expect(blamed(commits, failure)).toEqual([])
  })

  it("blames nobody when a failure gives no evidence", () => {
    const commits = [commit("one", ["a.ts"]), commit("two", ["b.ts"])]
    expect(blamed(commits, log("##[error]Process completed with exit code 1."))).toEqual([])
  })
})
