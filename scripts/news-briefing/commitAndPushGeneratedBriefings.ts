import { getGeneratedBriefingGitPaths } from "./briefingPaths.ts"
import { runProcessWithForwardedOutput } from "./runProcessWithForwardedOutput.ts"
import type { CommitAndPushGeneratedBriefingsArgs } from "./types.ts"

/** Commit and push the generated briefing files for the provided dates. */
export async function commitAndPushGeneratedBriefings(
  /** The generated briefing dates and optional command runner. */
  args: CommitAndPushGeneratedBriefingsArgs,
): Promise<void> {
  if (args.dates.length === 0) return

  const runCommand = args.runCommand ?? runProcessWithForwardedOutput
  const generatedPaths = getGeneratedBriefingGitPaths(args.dates)
  const commitMessage = `Briefing: add generated briefings for ${args.dates.join(", ")}`

  await runCommand("git", ["add", ...generatedPaths])
  await runCommand("git", ["commit", "-m", commitMessage])
  await runCommand("git", ["pull", "--rebase", "--autostash"])
  await runCommand("git", ["push"])
}
