import { expect, test, vi } from "vitest"
import { createTasksClient } from "../createTasksClient.ts"

const metadata = { spaceId: "space", timezone: "Europe/Madrid", observedAt: "2026-09-30T10:00:00Z" }
const response = (result: unknown) => ({ status: "ok", metadata, result })

test("follows every board page and rejects a wrong space before returning data", async () => {
  const run = vi
    .fn()
    .mockResolvedValueOnce(response({ items: [{ kind: "task", id: "one" }], continuation: "next" }))
    .mockResolvedValueOnce(response({ items: [{ kind: "task", id: "two" }], continuation: null }))
  const client = createTasksClient({ spaceId: "space", run })
  expect(await client.list("task")).toHaveLength(2)
  expect(run.mock.calls[1][1]).toMatchObject({ continuation: "next" })
  run.mockResolvedValueOnce({
    ...response({ items: [] }),
    metadata: { ...metadata, spaceId: "other" },
  })
  await expect(client.list("task")).rejects.toThrow("space")
})

test("does not turn unavailable or ambiguous reads into empty results", async () => {
  const run = vi
    .fn()
    .mockResolvedValueOnce({ status: "unavailable", metadata })
    .mockResolvedValueOnce(response({ resolution: "ambiguous", items: [] }))
  const client = createTasksClient({ spaceId: "space", run })
  await expect(client.list("task")).rejects.toThrow("unavailable")
  await expect(client.get("task", "old")).rejects.toThrow("ambiguous")
})

test("preserves the original write identity and inspects an uncertain receipt without blindly retrying", async () => {
  const run = vi
    .fn()
    .mockResolvedValueOnce({ status: "ok", metadata })
    .mockResolvedValueOnce({ status: "unconfirmed", metadata })
    .mockResolvedValueOnce({ status: "unconfirmed", metadata, receipt: { phase: "dispatched" } })
  const client = createTasksClient({ spaceId: "space", run })
  await expect(
    client.write("capture", { title: "Call", eventKey: "event" }, "request"),
  ).rejects.toThrow("request")
  expect(run.mock.calls.map(call => call[0])).toEqual(["status", "capture", "inspect"])
  expect(run.mock.calls[2][2]).toBe("request")
})

test("refuses a write before dispatch when the service is bound to another space", async () => {
  const run = vi
    .fn()
    .mockResolvedValue({ status: "ok", metadata: { ...metadata, spaceId: "other" } })
  const client = createTasksClient({ spaceId: "space", run })
  await expect(
    client.write("capture", { title: "Call", eventKey: "event" }, "request"),
  ).rejects.toThrow("before write")
  expect(run.mock.calls.map(call => call[0])).toEqual(["status"])
})

test("follows an explicit task promotion while leaving ordinary deletion actionable", async () => {
  const project = {
    kind: "project",
    id: "project",
    availability: "available",
    title: "Outcome",
    url: "url",
  }
  const run = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        resolution: "deleted",
        items: [{ kind: "task", id: "task", deleted: true, promotedToProjectId: "project" }],
      }),
    )
    .mockResolvedValueOnce(response({ resolution: "available", items: [project] }))
    .mockResolvedValueOnce(
      response({ resolution: "deleted", items: [{ kind: "task", id: "other", deleted: true }] }),
    )
  const client = createTasksClient({ spaceId: "space", run })
  expect(await client.get("task", "task")).toEqual({
    ...project,
    url: "https://tasks.herbcaudill.com/?project=project",
  })
  await expect(client.get("task", "other")).rejects.toThrow("deleted")
})

test("returns canonical public links instead of deployment hostnames", async () => {
  const deployment = (query: string) => `https://tasks-sigma-seven.vercel.app/?${query}`
  const run = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        items: [
          { kind: "task", id: "one", url: deployment("task=one") },
          { kind: "project", id: "two", url: deployment("project=two") },
        ],
      }),
    )
    .mockResolvedValueOnce({ status: "ok", metadata })
    .mockResolvedValueOnce({
      status: "saved",
      metadata,
      result: { records: [{ kind: "task", id: "three", url: deployment("task=three") }] },
    })
  const client = createTasksClient({ spaceId: "space", run })
  expect((await client.list("task")).map(record => record.url)).toEqual([
    "https://tasks.herbcaudill.com/?task=one",
    "https://tasks.herbcaudill.com/?project=two",
  ])
  expect(
    (await client.write("capture", { title: "Call", eventKey: "e" }, "r")).records?.[0]?.url,
  ).toBe("https://tasks.herbcaudill.com/?task=three")
})
