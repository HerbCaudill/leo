import { basename } from "node:path"
import { createTasksClient } from "../tasks-client/createTasksClient.ts"
import { saveDescription } from "../tasks-client/saveDescription.ts"
import type { BoardRecord } from "../tasks-client/types.ts"
import { VAULT_PATH } from "./constants.ts"

/** Link research and append ordered execution steps without inventing a subtask hierarchy. */
export async function publishResearch(
  task: BoardRecord,
  notePath: string,
  nextSteps: string[],
  client = createTasksClient(),
  eventKey = `research:${task.kind}:${task.id}`,
): Promise<void> {
  const link = notePath
    ? `obsidian://open?vault=${encodeURIComponent(basename(VAULT_PATH))}&file=${encodeURIComponent(notePath.replace(/\.md$/, ""))}`
    : ""
  const base = task.description ?? ""
  const additions = [
    link && !base.includes(link) ? `Research: ${link}` : "",
    ...[...new Set(nextSteps)]
      .filter(step => !base.includes(step))
      .map((step, index) => `${index + 1}. ${step}`),
  ].filter(Boolean)
  if (!additions.length) return
  await saveDescription(
    { record: task, text: [base, ...additions].filter(Boolean).join("\n\n"), eventKey },
    client,
  )
}
