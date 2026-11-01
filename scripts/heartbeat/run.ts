import { execFile } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { runCodexAgent } from "../morning-briefing/codexAgent.ts"
import { CODEX_COMMAND_PATH } from "../morning-briefing/constants.ts"
import { acquireMorningBriefingRunLock } from "../morning-briefing/runLock.ts"
import {
  findBriefingThread,
  findQuietSessions,
  hasWatchedWork,
  sessionKey,
  shouldNotifyHerb,
  type SessionThread,
} from "./heartbeat.ts"
import { runT3 } from "./runT3.ts"

const LEO_PROJECT_ID = "mcp:4efda691-8e1e-47a1-80e5-dea589320403"
const TRIAGE_LEVEL = 15
const INVESTIGATION_LEVEL = 75
const MEMORY_DIRECTORY_PATH = join(homedir(), "Code/herbcaudill/notes/leo")
const WATCHING_PATH = join(MEMORY_DIRECTORY_PATH, "Watching.md")
const LOG_DIRECTORY_PATH = join(MEMORY_DIRECTORY_PATH, "log")
const STATE_DIRECTORY_PATH = join(homedir(), ".local/state/leo")
const STATE_PATH = join(STATE_DIRECTORY_PATH, "heartbeat.json")
const MAC_LIST_SESSIONS_COMMAND =
  "/etc/profiles/per-user/herbcaudill/bin/node --no-warnings ~/Code/HerbCaudill/leo/scripts/heartbeat/listSessions.ts"
const MAX_REVIEWED_SESSION_KEYS = 500
const AGENT_TIMEOUT_MS = 20 * 60 * 1_000

/** Append an entry to Leo's journal for the day. */
function writeJournal(date: string, text: string): void {
  mkdirSync(LOG_DIRECTORY_PATH, { recursive: true })
  const time = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour12: false })
  appendFileSync(join(LOG_DIRECTORY_PATH, `${date}.md`), `- ${time.slice(0, 5)} ${text}\n`)
}

/** Read the blockers Herb has already been told about. */
function readState(): HeartbeatState {
  return {
    notifiedBlockerKeys: [],
    reviewedSessionKeys: [],
    ...(existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {}),
  }
}

/** Save the heartbeat's memory between runs. */
function writeState(state: HeartbeatState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state))
}

/** Run one headless agent from the vault, so this repo's instructions don't load on every run. */
async function runAgent<T>(
  /** Agent settings: which prompt and schema to use, and any run-specific context. */
  args: RunAgentArgs,
): Promise<T> {
  const outputPath = join(STATE_DIRECTORY_PATH, `last-${args.name}-result.json`)
  await runCodexAgent({
    codexCommand: CODEX_COMMAND_PATH,
    cwd: MEMORY_DIRECTORY_PATH,
    environment: process.env,
    eventsPath: join(STATE_DIRECTORY_PATH, `last-${args.name}-events.jsonl`),
    level: args.level,
    outputPath,
    prompt: `${readFileSync(join(import.meta.dirname, `${args.promptName}.prompt.md`), "utf8")}\n\n${args.context}\n`,
    schemaPath: join(import.meta.dirname, `${args.promptName}.schema.json`),
    threadSource: `heartbeat-${args.name}`,
    timeoutMs: AGENT_TIMEOUT_MS,
  })
  return JSON.parse(readFileSync(outputPath, "utf8"))
}

/** Run a command and return its output. */
function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { maxBuffer: 100_000_000, windowsHide: true }, (error, output) =>
      error ? reject(error) : resolvePromise(output),
    )
  })
}

/** List every thread on both machines. A sleeping Mac is normal, so it just gets skipped. */
async function listSessions(): Promise<LocatedSession[]> {
  const list = async (machine: string, command: string, args: string[]) => {
    try {
      const threads: SessionThread[] = JSON.parse(await runCommand(command, args))
      return threads.map(thread => ({ ...thread, machine }))
    } catch (error) {
      console.log(`${new Date().toISOString()} skipped ${machine} sessions: ${error}`)
      return []
    }
  }
  const sessions = await Promise.all([
    list("mini", process.execPath, ["--no-warnings", join(import.meta.dirname, "listSessions.ts")]),
    list("mac", "ssh", [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "mac",
      MAC_LIST_SESSIONS_COMMAND,
    ]),
  ])
  return sessions.flat()
}

/** Tell Herb in today's briefing thread, returning false when there isn't one yet. */
async function notifyHerb(date: string, summary: string): Promise<boolean> {
  const threads: BriefingThread[] = JSON.parse(
    await runT3(["thread", "list", "--project", LEO_PROJECT_ID, "--json"]),
  )
  const thread = findBriefingThread({ threads, date })
  if (!thread) return false
  await runT3(
    ["thread", "send", thread.threadId, "-", "--json"],
    `Leo's heartbeat needs Herb. Repeat this to him as written, and take no other action:\n\n${summary}`,
  )
  return true
}

/** Run one heartbeat. Only a result that needs Herb touches a T3 session. */
async function main(): Promise<void> {
  mkdirSync(STATE_DIRECTORY_PATH, { recursive: true })
  const release = acquireMorningBriefingRunLock(join(STATE_DIRECTORY_PATH, "heartbeat.lock"))
  try {
    if (!hasWatchedWork(readFileSync(WATCHING_PATH, "utf8"))) return

    const date = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" })
    const state = readState()
    const time = new Date().toLocaleTimeString("en-GB", {
      timeZone: "Europe/Madrid",
      hour12: false,
    })
    const quietSessions = findQuietSessions({
      threads: await listSessions(),
      now: new Date(),
      reviewedKeys: state.reviewedSessionKeys,
    })
    const sessionList = quietSessions.map(({ machine, threadId, title, status, updatedAt }) => ({
      machine,
      threadId,
      title,
      status,
      updatedAt,
    }))
    const context = `Current local time, the same zone as the journal: ${time.slice(0, 5)}. Today's journal: ${join(LOG_DIRECTORY_PATH, `${date}.md`)}\n\nQuiet T3 sessions to review: ${JSON.stringify(sessionList)}`
    // A running session stays out, so that it's reviewed again if its run ends or it stays hung.
    const reviewedSessionKeys = [
      ...state.reviewedSessionKeys,
      ...quietSessions.filter(session => session.status !== "running").map(sessionKey),
    ].slice(-MAX_REVIEWED_SESSION_KEYS)
    const triage = await runAgent<TriageResult>({
      context,
      level: TRIAGE_LEVEL,
      name: "triage",
      promptName: "triage",
    })
    console.log(`${new Date().toISOString()} triage escalate=${triage.escalate}: ${triage.reason}`)
    if (!triage.escalate) {
      writeState({ ...state, reviewedSessionKeys })
      return
    }

    const result = await runAgent<HeartbeatResult>({
      context: `${context}\n\nWhy the quick check flagged this: ${triage.reason}`,
      level: INVESTIGATION_LEVEL,
      name: "investigation",
      promptName: "heartbeat",
    })
    console.log(`${new Date().toISOString()} ${result.outcome}: ${result.summary}`)

    // Quiet results are journaled too, so the next quick check knows a slow pace was already looked at.
    writeJournal(date, `${result.outcome}: ${result.summary}`)
    if (result.outcome !== "needs_herb") {
      writeState({ notifiedBlockerKeys: [], reviewedSessionKeys })
      return
    }

    writeState({ ...state, reviewedSessionKeys })
    const blockerKey = result.blockerKey ?? result.summary
    // Before today's briefing exists the blocker stays unrecorded, so a later run reports it.
    if (
      shouldNotifyHerb({ blockerKey, notifiedBlockerKeys: state.notifiedBlockerKeys }) &&
      (await notifyHerb(date, result.summary))
    ) {
      writeState({
        notifiedBlockerKeys: [...state.notifiedBlockerKeys, blockerKey],
        reviewedSessionKeys,
      })
    }
  } finally {
    release()
  }
}

await main()

type RunAgentArgs = {
  /** Run-specific text appended to the prompt. */
  context: string
  /** Required intelligence level from 0 to 100. */
  level: number
  /** Name used for artifact files and diagnostics. */
  name: string
  /** Base name of the prompt and schema files. */
  promptName: string
}

type TriageResult = {
  escalate: boolean
  reason: string
}

type BriefingThread = {
  threadId: string
  title: string
  createdAt: string
}

type HeartbeatState = {
  notifiedBlockerKeys: string[]
  reviewedSessionKeys: string[]
}

type LocatedSession = SessionThread & {
  /** Machine the session runs on. */
  machine: string
}

type HeartbeatResult = {
  outcome: "quiet" | "acted" | "needs_herb"
  summary: string
  blockerKey: string | null
}
