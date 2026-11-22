import { describe, expect, it } from "vitest"

import { findPushingThread } from "../findPushingThread.ts"

const sha = "a".repeat(40)
const zero = "0".repeat(40)

/** A reflog line for the sha. */
const line = (action: string) =>
  `${zero} ${sha} Herb Caudill <herb@localhost> 1795348861 +0100\t${action}: A subject`

/** Where commits came from, with nothing known unless a test says so. */
const sources = {
  pushes: [],
  reflogs: [],
  threadsByWorktree: new Map([["/worktrees/review", "reviewer"]]),
  threadsByPullRequest: new Map([[103, "pr-author"]]),
  liveThreads: new Set(["reviewer", "pusher", "pr-author"]),
}

describe("findPushingThread", () => {
  it("prefers the thread that recorded the push", () => {
    const pushes = [{ threadId: "pusher", commits: [sha] }]
    const reflogs = [{ worktree: "/worktrees/review", text: line("commit") }]
    expect(findPushingThread({ sha, subject: "x" }, { ...sources, pushes, reflogs })).toBe("pusher")
  })

  it.each(["commit", "commit (amend)", "rebase (pick)", "cherry-pick"])(
    "finds the worktree that made the commit by %s",
    action => {
      const reflogs = [{ worktree: "/worktrees/review", text: line(action) }]
      expect(findPushingThread({ sha, subject: "x" }, { ...sources, reflogs })).toBe("reviewer")
    },
  )

  it.each(["rebase (start)", "checkout", "merge origin/main"])(
    "doesn't take a worktree that only moved onto the commit by %s for its author",
    action => {
      const reflogs = [{ worktree: "/worktrees/review", text: line(action) }]
      expect(findPushingThread({ sha, subject: "x" }, { ...sources, reflogs })).toBeUndefined()
    },
  )

  it("finds the thread linked to a merged pull request", () => {
    expect(findPushingThread({ sha, subject: "Raise a timeout (#103)" }, sources)).toBe("pr-author")
  })

  it("passes over a thread that's gone", () => {
    const pushes = [{ threadId: "archived", commits: [sha] }]
    expect(findPushingThread({ sha, subject: "x" }, { ...sources, pushes })).toBeUndefined()
  })
})
