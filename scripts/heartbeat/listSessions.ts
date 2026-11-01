import { homedir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { runT3 } from "./runT3.ts"

/** Read this machine's project IDs. The T3 CLI can only list threads one project at a time. */
function readProjectIds(): string[] {
  const database = new DatabaseSync(join(homedir(), ".t3/userdata/statev2.sqlite"), {
    readOnly: true,
  })
  try {
    return database
      .prepare("select project_id from projection_projects where deleted_at is null")
      .all()
      .map(row => String(row.project_id))
  } finally {
    database.close()
  }
}

/** Print every thread on this machine as JSON, for the heartbeat on the mini to filter. */
async function main(): Promise<void> {
  const threads = await Promise.all(
    readProjectIds().map(async projectId =>
      JSON.parse(
        await runT3(["thread", "list", "--project", projectId, "--json", "--log-level", "error"]),
      ),
    ),
  )
  console.log(JSON.stringify(threads.flat()))
}

await main()
