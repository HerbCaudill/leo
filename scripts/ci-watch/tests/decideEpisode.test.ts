import { describe, expect, it } from "vitest"

import { decideEpisode } from "../decideEpisode.ts"
import type { CiRun, Conclusion } from "../types.ts"

/** A finished run on main, created at the given minute. */
const run = (minute: number, conclusion: Conclusion): CiRun => ({
  id: minute,
  sha: `sha-${minute}`,
  conclusion,
  createdAt: new Date(Date.UTC(2026, 10, 22, 12, minute)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 10, 22, 12, minute + 5)).toISOString(),
  url: `https://example.test/${minute}`,
})

/** The episode that a red run opened. */
const episode = (minute: number) => ({ runId: minute, createdAt: run(minute, "failure").createdAt })

describe("decideEpisode", () => {
  it("stays silent while main is green", () => {
    expect(decideEpisode([run(1, "success")], undefined)).toEqual({ kind: "quiet" })
  })

  it("stays silent when nothing has finished", () => {
    expect(decideEpisode([run(1, "cancelled")], undefined)).toEqual({ kind: "quiet" })
  })

  it.each(["failure", "timed_out", "startup_failure"] as const)(
    "wakes someone when main's newest result is %s",
    conclusion => {
      const red = run(2, conclusion)
      expect(decideEpisode([run(1, "success"), red], undefined)).toEqual({ kind: "wake", run: red })
    },
  )

  it("looks past superseded runs to the newest result", () => {
    const red = run(2, "failure")
    expect(decideEpisode([run(3, "cancelled"), red, run(1, "success")], undefined)).toEqual({
      kind: "wake",
      run: red,
    })
  })

  it("ignores a failure that a newer run has already got past", () => {
    expect(decideEpisode([run(1, "failure"), run(2, "success")], undefined)).toEqual({
      kind: "quiet",
    })
  })

  it("wakes once for each red episode", () => {
    expect(decideEpisode([run(4, "failure"), run(2, "failure")], episode(2))).toEqual({
      kind: "quiet",
    })
  })

  it("closes the episode on a newer green run", () => {
    expect(decideEpisode([run(3, "success"), run(2, "failure")], episode(2))).toEqual({
      kind: "close",
    })
  })

  it("closes the episode when the red run passes on a rerun", () => {
    expect(decideEpisode([run(2, "success")], episode(2))).toEqual({ kind: "close" })
  })

  it("keeps the episode open while the red run is being rerun", () => {
    // A run being rerun drops out of the finished runs, leaving an older green one the newest.
    expect(decideEpisode([run(1, "success")], episode(2))).toEqual({ kind: "quiet" })
  })
})
