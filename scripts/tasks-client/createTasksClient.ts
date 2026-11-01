import { runTasks } from "./runTasks.ts"
import type { BoardRecord, TasksClient, TasksRunner, TasksResponse } from "./types.ts"

/** Bind all reads and writes to one enrolled space; never fall back to another provider. */
export function createTasksClient(
  /** Explicit binding and optional isolated transport. */
  options: { spaceId?: string; run?: TasksRunner } = {},
): TasksClient {
  const spaceId =
    options.spaceId ?? process.env.TASKS_SPACE_ID ?? "B7CSO2L6KYNN4HZBSBNHP3LC3SA7PYNJO"
  if (!spaceId.trim()) throw new Error("Tasks space is required")
  const run = options.run ?? runTasks
  /** Check the actual peer on every successful response. */
  function check(response: TasksResponse) {
    if (response.status !== "ok" && response.status !== "saved")
      throw new Error(`Tasks ${response.status}`)
    if (
      response.metadata?.spaceId !== spaceId ||
      response.metadata.timezone !== "Europe/Madrid" ||
      !Number.isFinite(Date.parse(response.metadata.observedAt))
    )
      throw new Error("Tasks serving space or observation mismatch")
    if (
      !response.result ||
      (response.result.status && !["ok", "saved"].includes(response.result.status))
    )
      throw new Error("Invalid Tasks result")
    const { items, records } = response.result
    return {
      ...response.result,
      ...(items ? { items: items.map(withCanonicalUrl) } : {}),
      ...(records ? { records: records.map(withCanonicalUrl) } : {}),
    }
  }
  /** Require one available identity; absence does not mean completion. */
  async function identity(command: string, input: Record<string, unknown>): Promise<BoardRecord> {
    const result = check(await run(command, input))
    const promoted = result.items?.length === 1 && result.items[0]?.promotedToProjectId
    if (command === "get" && input.kind === "task" && result.resolution === "deleted" && promoted)
      return identity("get", { kind: "project", id: promoted })
    if (result.resolution !== "available" || result.items?.length !== 1)
      throw new Error(`Tasks target ${result.resolution ?? "invalid"}`)
    const item = result.items[0]!
    if (item.deleted || item.availability !== "available")
      throw new Error("Tasks target unavailable")
    return item
  }
  return {
    spaceId,
    async list(kind) {
      const items: BoardRecord[] = []
      const seen = new Set<string>()
      let continuation: string | undefined
      do {
        const result = check(
          await run("list", { kind, limit: 200, ...(continuation ? { continuation } : {}) }),
        )
        if (!Array.isArray(result.items)) throw new Error("Invalid Tasks page")
        items.push(...result.items)
        continuation = result.continuation ?? undefined
        if (continuation && seen.has(continuation)) throw new Error("Repeated Tasks continuation")
        if (continuation) seen.add(continuation)
      } while (continuation)
      return items
    },
    get: (kind, id) => identity("get", { kind, id }),
    async write(command, input, requestId) {
      const status = await run("status", {})
      if (status.status !== "ok" || status.metadata?.spaceId !== spaceId)
        throw new Error("Tasks serving space unavailable or mismatched before write")
      let response: TasksResponse
      try {
        response = await run(command, input, requestId)
      } catch {
        await run("inspect", {}, requestId).catch(() => undefined)
        throw new Error(`Tasks reply lost; inspect request ${requestId}`)
      }
      if (response.status === "unconfirmed") {
        await run("inspect", {}, requestId)
        throw new Error(`Tasks write uncertain; inspect request ${requestId}`)
      }
      if (response.status !== "saved")
        throw new Error(`Tasks ${response.status}; request ${requestId}`)
      return check(response)
    },
  }
}

/** Link tasks and projects through the public origin; never expose a deployment hostname. */
function withCanonicalUrl(record: BoardRecord): BoardRecord {
  return record.kind === "task" || record.kind === "project"
    ? { ...record, url: `https://tasks.herbcaudill.com/?${record.kind}=${record.id}` }
    : record
}
