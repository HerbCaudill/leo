import { existsSync } from "node:fs"
import { join } from "node:path"

import { CHECKOUT_PATH, REPOSITORY, STATE_DIRECTORY_PATH } from "./constants.ts"
import { runCommand } from "./runCommand.ts"
import type { Commit } from "./types.ts"

/*
 * The watcher has its own bare clone, so it never fetches in, locks or changes the checkout and
 * refs that the agents share.
 */

/** Read the commits that came after a green run up to a red one, newest first. */
export async function readCommits(
  /** The last green run's commit, if there is one. */
  base: string | undefined,
  /** The red run's commit. */
  head: string,
): Promise<Commit[]> {
  const repository = join(STATE_DIRECTORY_PATH, "repository.git")
  const git = (...args: string[]) => runCommand("git", ["-C", repository, ...args])
  if (!existsSync(join(repository, "HEAD")))
    await runCommand("git", [
      "clone",
      "--quiet",
      "--bare",
      "--reference-if-able",
      CHECKOUT_PATH,
      "--dissociate",
      `https://github.com/${REPOSITORY}.git`,
      repository,
    ])
  await git("fetch", "--quiet", "origin", "+refs/heads/main:refs/heads/main")

  const range = base ? [`${base}..${head}`] : ["-1", head]
  const list = await git("log", "--no-merges", "--format=%H%x09%s", `-${MAX_COMMITS}`, ...range)
  const commits: Commit[] = []
  for (const line of list.split("\n").filter(Boolean)) {
    const [sha, ...subject] = line.split("\t")
    const show = (...args: string[]) => git("show", "--no-renames", "--format=", ...args, sha!)
    commits.push({
      sha: sha!,
      subject: subject.join("\t"),
      files: (await show("--name-only")).split("\n").filter(Boolean),
      patch: (await show("--no-ext-diff")).slice(0, MAX_PATCH_LENGTH),
    })
  }
  return commits
}

const MAX_COMMITS = 150
const MAX_PATCH_LENGTH = 2_000_000
