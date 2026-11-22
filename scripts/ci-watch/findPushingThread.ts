import type { Commit, CommitSources } from "./types.ts"

/** Find the thread responsible for a commit, if one on this Mac can still be woken. */
export function findPushingThread(
  /** The commit. */
  { sha, subject }: Pick<Commit, "sha" | "subject">,
  /** Where commits came from. */
  sources: CommitSources,
): string | undefined {
  const { pushes, reflogs, threadsByWorktree, threadsByPullRequest, liveThreads } = sources
  // The hook's record is exact. A refused push is recorded again when it's retried, so the last wins.
  const recorded = pushes.filter(push => push.commits.includes(sha)).at(-1)?.threadId
  const made = reflogs
    .filter(({ text }) => text.split("\n").some(line => madeCommit(line, sha)))
    .map(({ worktree }) => threadsByWorktree.get(worktree))
  const pullRequest = /\(#(\d+)\)$/.exec(subject)?.[1]
  const linked = pullRequest ? threadsByPullRequest.get(Number(pullRequest)) : undefined

  return [recorded, ...made, linked].find(id => id !== undefined && liveThreads.has(id))
}

/** Whether a reflog line records the commit being made, rather than moved onto. */
function madeCommit(
  /** The line: old SHA, new SHA, who and when, then a tab and the action. */
  line: string,
  /** The commit. */
  sha: string,
) {
  const [header, action = ""] = line.split("\t")
  return header?.split(" ")[1] === sha && CREATING_ACTION.test(action)
}

const CREATING_ACTION =
  /^(commit( \((amend|merge|cherry-pick|initial)\))?|cherry-pick|rebase \((pick|continue|reword|squash|fixup)\)):/
