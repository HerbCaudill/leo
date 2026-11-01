import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"
import { getManagedInvocation } from "../getManagedInvocation.ts"

import { createTasksClient } from "../tasks-client/createTasksClient.ts"
import { analyzeBarcelonaStint, type BarcelonaStintInput } from "./analyzeBarcelonaStint.ts"

const exec = promisify(execFile)
const FAMILY_CALENDAR = "lynnemcintyre.com_0qcicm85ksm7ht2e5cfpjua158@group.calendar.google.com"
const LYNNE_CALENDAR = "lynne@lynnemcintyre.com"

/** Read the exact calendars and Tasks without changing either source. */
export async function checkBarcelonaStint(
  /** Briefing's Europe/Madrid local date. */
  date: string,
) {
  const [familyEvents, lynneEvents, tasks] = await Promise.all([
    readEvents(FAMILY_CALENDAR, date),
    readEvents(LYNNE_CALENDAR, date),
    readTasks(),
  ])
  return analyzeBarcelonaStint({ date, familyEvents, lynneEvents, tasks })
}

/** Read all expanded events that could overlap the three-week horizon. */
async function readEvents(
  calendarId: string,
  date: string,
): Promise<BarcelonaStintInput["familyEvents"]> {
  try {
    const items: NonNullable<BarcelonaStintInput["familyEvents"]>[number][] = []
    let pageToken: string | undefined
    do {
      const params = {
        calendarId,
        timeMin: `${date}T00:00:00Z`,
        timeMax: `${addDays(date, 23)}T00:00:00Z`,
        singleEvents: true,
        maxResults: 2500,
        ...(pageToken ? { pageToken } : {}),
      }
      const invocation = getManagedInvocation("gws-delegated", [
        "calendar",
        "events",
        "list",
        "--params",
        JSON.stringify(params),
      ])
      const { stdout } = await exec(invocation.command, invocation.args, {
        maxBuffer: 16 * 1024 * 1024,
      })
      const response = JSON.parse(stdout) as { items?: typeof items; nextPageToken?: string }
      if (!Array.isArray(response.items)) return null
      items.push(...response.items)
      pageToken = response.nextPageToken
    } while (pageToken)
    return items
  } catch {
    return null
  }
}

/** Enumerate the converged Tasks board and keep its typed tag fields. */
async function readTasks(): Promise<BarcelonaStintInput["tasks"]> {
  try {
    return await createTasksClient().list("task")
  } catch {
    return null
  }
}

/** Advance a UTC date string while keeping calendar-day arithmetic across DST. */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const date = process.argv[2]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Usage: pnpm briefing:barcelona YYYY-MM-DD")
  console.log(JSON.stringify(await checkBarcelonaStint(date)))
}
