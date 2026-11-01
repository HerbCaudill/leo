import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { promisify } from "node:util"
import { createTasksClient } from "../tasks-client/createTasksClient.ts"
import { saveDescription } from "../tasks-client/saveDescription.ts"
import type { TasksClient } from "../tasks-client/types.ts"

/** Apple Reminders list that Siri captures land in. */
const REMINDERS_LIST = "Reminders"

/**
 * Move open reminders to the Tasks inbox, marking each done only after its task is verified.
 * Reminders with due dates stay put, because Herb sets those so his phone will remind him.
 */
export async function importReminders(
  args: {
    /** Injectable Reminders boundary. */
    reminders?: ReminderSource
    /** Injectable board client. */
    client?: TasksClient
  } = {},
): Promise<number> {
  const reminders = args.reminders ?? appleReminders
  const open = (await reminders.list()).filter(reminder => !reminder.due)
  if (!open.length) return 0
  const client = args.client ?? createTasksClient()
  const failures: unknown[] = []
  let imported = 0
  for (const reminder of open) {
    try {
      // Hash the title so an edited reminder never replays a request ID with changed input.
      const hash = createHash("sha256").update(reminder.title).digest("hex").slice(0, 12)
      const eventKey = `reminder:${reminder.id}:${hash}`
      const result = await client.write("capture", { title: reminder.title, eventKey }, eventKey)
      const created = result.records?.find(
        record =>
          record.kind === "task" &&
          record.creationKey === `capture:${eventKey}` &&
          result.createdIds?.includes(record.id),
      )
      if (!created) throw new Error(`Reminder "${reminder.title}" was not captured`)
      const task = await client.get("task", created.id)
      if (reminder.description)
        await saveDescription({ record: task, text: reminder.description, eventKey }, client)
      await reminders.complete(reminder.id)
      imported++
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length) throw new Error(failures.map(error => String(error)).join("\n"))
  return imported
}

/** Read and complete reminders through the EventKit helper. */
const appleReminders: ReminderSource = {
  async list() {
    const output = await runHelper("list", REMINDERS_LIST)
    return (JSON.parse(output) as EventKitReminder[])
      .map(mapReminder)
      .filter(reminder => reminder.title)
  },
  async complete(id) {
    await runHelper("complete", id)
  },
}

/** Preserve the legacy title for capture identity while placing EventKit context in the description. */
export function mapReminder(reminder: EventKitReminder): Reminder {
  const title = [reminder.name, reminder.body]
    .map(part => part.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" – ")
  const priority = Number(reminder.priority)
  const context = [
    reminder.url?.trim(),
    reminder.location?.trim() && `Location: ${reminder.location.trim()}`,
    priority > 0 && `Priority: ${priority <= 4 ? "High" : priority === 5 ? "Medium" : "Low"}`,
    reminder.start && `Start: ${reminder.start}`,
    ...(reminder.alarms ?? []).map(alarm => `Alarm: ${alarm}`),
    ...(reminder.recurrence ?? []).map(rule => `Repeat: ${rule}`),
  ].filter(Boolean)
  return { id: reminder.id, title, due: reminder.due, description: context.join("\n") }
}

/** Run the Swift EventKit helper and return its output. */
async function runHelper(...args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)(
    "swift",
    [join(import.meta.dirname, "reminders.swift"), ...args],
    { timeout: 120_000 },
  )
  return stdout.trim()
}

/** Open reminder to move into Tasks. */
type Reminder = {
  /** Reminders identifier. */
  id: string
  /** Task title, including any notes. */
  title: string
  /** EventKit context to retain in Tasks. */
  description?: string
  /** Due date, when the reminder has one. */
  due?: string
}

/** Fields returned by the EventKit helper. */
type EventKitReminder = {
  id: string
  name: string
  body: string
  due?: string
  url?: string
  location?: string
  priority?: number | string
  start?: string
  alarms?: string[]
  recurrence?: string[]
}

/** Reminders boundary. */
type ReminderSource = {
  /** Open reminders in the capture list. */
  list: () => Promise<Reminder[]>
  /** Mark a reminder done. */
  complete: (id: string) => Promise<void>
}
