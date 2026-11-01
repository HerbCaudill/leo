import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { writeTextAtomically } from "../morning-briefing/atomicWrite.ts"
import { createTasksClient } from "./createTasksClient.ts"
import { journalFileName } from "./journalFileName.ts"
import type { BoardRecord } from "./types.ts"

/** Save an immutable description intention before dispatch so retries preserve the observed base. */
export async function saveDescription(
  args: {
    /** Fresh target to edit. */
    record: BoardRecord
    /** Complete proposed text. */
    text: string
    /** Identity of this source publication, retained across retries. */
    eventKey: string
    /** Optional isolated journal directory. */
    statePath?: string
  },
  client = createTasksClient(),
): Promise<void> {
  const requestId = `briefings-description:${createHash("sha256").update(args.eventKey).digest("hex")}`
  const path = join(
    args.statePath ?? join(homedir(), ".local/state/tasks-client/descriptions"),
    journalFileName(requestId),
  )
  const intention = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : {
        spaceId: client.spaceId,
        input: {
          target: args.record.kind,
          id: args.record.id,
          base: args.record.description ?? "",
          text: args.text,
          editorId: "briefings",
          submissionId: requestId,
        },
        saved: false,
      }
  if (
    intention.spaceId !== client.spaceId ||
    intention.input.id !== args.record.id ||
    intention.input.target !== args.record.kind
  )
    throw new Error("Description journal binding mismatch")
  if (intention.saved) return
  writeTextAtomically(path, JSON.stringify(intention))
  const result = await client.write("save-description", intention.input, requestId)
  if (!result.affectedIds?.includes(args.record.id))
    throw new Error("Description target not acknowledged")
  // A replay acknowledges the original edit; never overwrite a later human change.
  await client.get(args.record.kind as "task" | "project", args.record.id)
  writeTextAtomically(path, JSON.stringify({ ...intention, saved: true }))
}
