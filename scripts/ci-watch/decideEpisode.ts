import type { CiRun, Conclusion, Episode } from "./types.ts"

/** Decide whether to wake someone: once when main turns red, then not until it has been green. */
export function decideEpisode(
  /** Main's finished runs, in any order. */
  runs: CiRun[],
  /** The open episode, if main was already red. */
  episode: Episode | undefined,
): Decision {
  // Superseded runs are canceled before they start, so they say nothing about main.
  const newest = runs
    .filter(run => run.conclusion === "success" || RED_CONCLUSIONS.includes(run.conclusion))
    .reduce<CiRun | undefined>(
      (latest, run) => (latest && latest.createdAt >= run.createdAt ? latest : run),
      undefined,
    )
  if (!newest) return { kind: "quiet" }

  if (newest.conclusion !== "success")
    return episode ? { kind: "quiet" } : { kind: "wake", run: newest }
  if (!episode) return { kind: "quiet" }
  // While the red run is being rerun, an older green run is the newest finished one.
  return newest.id === episode.runId || newest.createdAt > episode.createdAt
    ? { kind: "close" }
    : { kind: "quiet" }
}

const RED_CONCLUSIONS: Conclusion[] = ["failure", "timed_out", "startup_failure"]

/** What the watcher should do. */
type Decision = { kind: "quiet" } | { kind: "close" } | { kind: "wake"; run: CiRun }
