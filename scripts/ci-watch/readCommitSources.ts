import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { runT3 } from "../heartbeat/runT3.ts"
import { CHECKOUT_PATH, REPOSITORY } from "./constants.ts"
import type { CommitSources } from "./types.ts"

/** Gather what this Mac knows about which threads made which commits. */
export async function readCommitSources(): Promise<CommitSources> {
  const threads: ListedThread[] = JSON.parse(
    await runT3(["thread", "list", "--project", CHECKOUT_PATH, "--json", "--log-level", "error"]),
  )
  const topLevel = threads.filter(thread => !thread.parentThreadId)
  return {
    pushes: readPushes(),
    reflogs: readReflogs(),
    threadsByWorktree: readThreadsByWorktree(),
    threadsByPullRequest: new Map(
      topLevel.flatMap(thread =>
        (thread.pullRequests ?? [])
          .filter(pr => pr.repository.toLowerCase() === REPOSITORY.toLowerCase())
          .map(pr => [pr.number, thread.threadId] as const),
      ),
    ),
    liveThreads: new Set(topLevel.map(thread => thread.threadId)),
  }
}

/** Read what the pre-push hook recorded, once it's installed. */
function readPushes(): CommitSources["pushes"] {
  const path = join(CHECKOUT_PATH, ".git/devresults-pushes.jsonl")
  if (!existsSync(path)) return []
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap(line => {
      try {
        return [JSON.parse(line)]
      } catch {
        // A line cut short by a killed push says nothing.
        return []
      }
    })
}

/** Read each linked worktree's HEAD reflog. The main checkout is everyone's, so it names nobody. */
function readReflogs(): CommitSources["reflogs"] {
  const directory = join(CHECKOUT_PATH, ".git/worktrees")
  return readdirSync(directory).flatMap(name => {
    try {
      const gitFile = readFileSync(join(directory, name, "gitdir"), "utf8").trim()
      const text = readFileSync(join(directory, name, "logs/HEAD"), "utf8")
      return [{ worktree: dirname(gitFile), text }]
    } catch {
      // It was removed meanwhile, or has no reflog.
      return []
    }
  })
}

/** Read the newest top-level thread in each worktree, which the T3 CLI doesn't list. */
function readThreadsByWorktree(): CommitSources["threadsByWorktree"] {
  const database = new DatabaseSync(join(homedir(), ".t3/userdata/statev2.sqlite"), {
    readOnly: true,
  })
  try {
    const rows = database
      .prepare(
        `select thread_id, json_extract(payload_json, '$.worktreePath') as worktree
         from orchestration_v2_projection_threads
         where json_extract(payload_json, '$.worktreePath') is not null
           and json_extract(payload_json, '$.lineage.parentThreadId') is null
           and deleted_at is null and archived_at is null
         order by updated_at`,
      )
      .all()
    return new Map(rows.map(row => [String(row.worktree), String(row.thread_id)]))
  } finally {
    database.close()
  }
}

/** A thread as `t3 thread list` gives it. */
type ListedThread = {
  /** Its ID. */
  threadId: string
  /** The thread that started it as a subagent. */
  parentThreadId: string | null
  /** Pull requests linked to it. */
  pullRequests?: Array<{ repository: string; number: number }>
}
