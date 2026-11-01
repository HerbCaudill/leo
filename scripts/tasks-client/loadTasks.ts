import { createTasksClient } from "./createTasksClient.ts"

/** Read all available tasks and projects, retaining completed records for duplicate checks. */
export async function loadTasks(client = createTasksClient()) {
  return {
    spaceId: client.spaceId,
    tasks: await client.list("task"),
    projects: await client.list("project"),
  }
}
