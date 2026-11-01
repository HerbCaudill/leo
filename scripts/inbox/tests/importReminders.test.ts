import { expect, test, vi } from "vitest"
import { importReminders, mapReminder } from "../importReminders.ts"
import type { TasksClient } from "../../tasks-client/types.ts"

const saveDescription = vi.hoisted(() => vi.fn(async () => {}))
vi.mock("../../tasks-client/saveDescription.ts", () => ({ saveDescription }))

const reminder = { id: "x-apple-reminder://ABC", title: "Call plumber" }

function fakeClient(write: TasksClient["write"]) {
  return {
    spaceId: "space",
    write: vi.fn(write),
    get: vi.fn(async (kind: "task", id: string) => ({
      kind,
      id,
      title: "Call plumber",
      url: `https://tasks/?task=${id}`,
      availability: "available",
    })),
  } as unknown as TasksClient
}

test("captures each reminder in the Tasks inbox, then marks it done", async () => {
  const complete = vi.fn(async () => {})
  const client = fakeClient(async (_command, input) => ({
    createdIds: ["new"],
    records: [
      {
        kind: "task",
        id: "new",
        title: String(input.title),
        url: "",
        creationKey: `capture:${String(input.eventKey)}`,
      },
    ],
  }))
  expect(
    await importReminders({ reminders: { list: async () => [reminder], complete }, client }),
  ).toBe(1)
  expect(vi.mocked(client.write).mock.calls[0]![1]).toMatchObject({ title: "Call plumber" })
  expect(client.get).toHaveBeenCalledWith("task", "new")
  expect(complete).toHaveBeenCalledWith(reminder.id)
})

test("maps EventKit URL and context into the description without changing the capture identity", async () => {
  const mapped = mapReminder({
    id: reminder.id,
    name: "Scrawl",
    body: "Read this later",
    url: "https://scrawl.kitlangton.com/",
    location: "Barcelona",
    priority: 1,
    start: "2026-10-19T09:00:00Z",
    alarms: ["2026-10-19T10:00:00Z"],
    recurrence: ["FREQ=WEEKLY"],
  })
  expect(mapped.title).toBe("Scrawl – Read this later")
  expect(mapped.description).toContain("https://scrawl.kitlangton.com/")
  expect(mapped.description).toContain("Location: Barcelona")
  expect(mapped.description).toContain("Priority: High")
  expect(mapped.description).toContain("Start: 2026-10-19T09:00:00Z")
  expect(mapped.description).toContain("Alarm: 2026-10-19T10:00:00Z")
  expect(mapped.description).toContain("Repeat: FREQ=WEEKLY")

  const complete = vi.fn(async () => {})
  const client = fakeClient(async (_command, input) => ({
    createdIds: ["new"],
    records: [
      {
        kind: "task",
        id: "new",
        title: String(input.title),
        url: "",
        creationKey: `capture:${String(input.eventKey)}`,
      },
    ],
  }))
  await importReminders({ reminders: { list: async () => [mapped], complete }, client })
  expect(vi.mocked(client.write).mock.calls[0]![1]).toMatchObject({
    title: "Scrawl – Read this later",
  })
  expect(saveDescription).toHaveBeenCalledWith(
    expect.objectContaining({
      text: mapped.description,
      eventKey: expect.stringMatching(/^reminder:x-apple-reminder:\/\/ABC:/),
    }),
    client,
  )
  expect(complete).toHaveBeenCalledWith(reminder.id)
})

test("leaves the reminder open when the task cannot be verified", async () => {
  const complete = vi.fn(async () => {})
  const client = fakeClient(async () => ({ createdIds: [], records: [] }))
  await expect(
    importReminders({ reminders: { list: async () => [reminder], complete }, client }),
  ).rejects.toThrow()
  expect(complete).not.toHaveBeenCalled()
})

test("retries description publication with the same capture identity", async () => {
  const complete = vi.fn(async () => {})
  const client = fakeClient(async (_command, input) => ({
    createdIds: ["new"],
    records: [
      {
        kind: "task",
        id: "new",
        title: String(input.title),
        url: "",
        creationKey: `capture:${String(input.eventKey)}`,
      },
    ],
  }))
  const source = {
    list: async () => [{ ...reminder, description: "https://example.com/" }],
    complete,
  }
  saveDescription.mockRejectedValueOnce(new Error("Description unavailable"))
  await expect(importReminders({ reminders: source, client })).rejects.toThrow(
    "Description unavailable",
  )
  expect(complete).not.toHaveBeenCalled()
  await importReminders({ reminders: source, client })
  expect(vi.mocked(client.write).mock.calls.map(call => call[2])).toEqual([
    vi.mocked(client.write).mock.calls[0]![2],
    vi.mocked(client.write).mock.calls[0]![2],
  ])
  expect(complete).toHaveBeenCalledOnce()
})

test("leaves reminders with due dates alone, so the phone can still remind Herb", async () => {
  const complete = vi.fn(async () => {})
  const client = fakeClient(async () => ({ createdIds: [], records: [] }))
  expect(
    await importReminders({
      reminders: { list: async () => [{ ...reminder, due: "2028-03-20" }], complete },
      client,
    }),
  ).toBe(0)
  expect(client.write).not.toHaveBeenCalled()
  expect(complete).not.toHaveBeenCalled()
})
