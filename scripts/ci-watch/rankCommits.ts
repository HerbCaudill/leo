import { readFailureEvidence } from "./readFailureEvidence.ts"
import type { Commit } from "./types.ts"

/*
 * Picks the likeliest cause of a red run without a model. Each clue is shared among the commits
 * that match it, so a file only one commit changed says more than one that ten did. The woken
 * thread checks the pick and passes it on when it's wrong.
 */

/** Rank the commits since the last green run by how well they explain a failure. */
export function rankCommits(
  /** The commits, newest first. */
  commits: Commit[],
  /** The log from `gh run view --log-failed`. */
  log: string,
): Array<Commit & { score: number }> {
  const { files, articles, texts } = readFailureEvidence(log)
  const directories = new Set(files.filter(file => file.includes("/")).map(getFeatureDirectory))

  const clues: Clue[] = [
    ...articles.map(slug => ({
      weight: ARTICLE_WEIGHT,
      matches: (commit: Commit) => commit.files.includes(`packages/help/articles/${slug}/en-US.md`),
    })),
    ...files.map(file => ({
      weight: FILE_WEIGHT,
      matches: (commit: Commit) =>
        commit.files.some(changed => changed === file || changed.endsWith(`/${file}`)),
    })),
    ...[...directories].map(directory => ({
      weight: DIRECTORY_WEIGHT,
      matches: (commit: Commit) =>
        commit.files.some(changed => getFeatureDirectory(changed) === directory),
    })),
    ...texts.map(text => ({
      weight: TEXT_WEIGHT,
      matches: (commit: Commit) => commit.patch.includes(text),
    })),
  ]

  const scores = commits.map(() => 0)
  for (const { weight, matches } of clues) {
    const matched = commits.flatMap((commit, index) => (matches(commit) ? [index] : []))
    for (const index of matched) scores[index]! += weight / matched.length
  }
  // Sorting is stable, so the newer commit wins a tie.
  return commits
    .map((commit, index) => ({ ...commit, score: scores[index]! }))
    .sort((a, b) => b.score - a.score)
}

/** The directory of a file and its tests. */
function getFeatureDirectory(
  /** A repository path. */
  file: string,
) {
  return file.slice(0, file.lastIndexOf("/")).replace(/\/tests$/, "")
}

const ARTICLE_WEIGHT = 20
const FILE_WEIGHT = 5
const DIRECTORY_WEIGHT = 1
const TEXT_WEIGHT = 2

/** Something in the log that commits can match. */
type Clue = {
  /** How much it says. */
  weight: number
  /** Whether a commit matches it. */
  matches: (commit: Commit) => boolean
}
