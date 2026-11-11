import { execFile } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { runCodexAgent } from "../morning-briefing/codexAgent.ts"
import { CODEX_COMMAND_PATH } from "../morning-briefing/constants.ts"
import { acquireMorningBriefingRunLock } from "../morning-briefing/runLock.ts"
import {
  findE2eSignals,
  findQuietSessions,
  hasWatchedWork,
  isE2eInvestigationDue,
  parseCoverageHistory,
  planHerbAsk,
  readE2eTarget,
  sessionKey,
  settleE2eResult,
  shouldNotifyHerb,
  type E2eTarget,
  type HeartbeatResult,
  type SessionThread,
} from "./heartbeat.ts"
import { runT3 } from "./runT3.ts"

const LEO_PROJECT_ID = "mcp:4efda691-8e1e-47a1-80e5-dea589320403"
const TRIAGE_ROLE = "bulk"
const INVESTIGATION_ROLE = "author"
const MEMORY_DIRECTORY_PATH = join(homedir(), "Code/herbcaudill/notes/leo")
const WATCHING_PATH = join(MEMORY_DIRECTORY_PATH, "Watching.md")
const LOG_DIRECTORY_PATH = join(MEMORY_DIRECTORY_PATH, "log")
const STATE_DIRECTORY_PATH = join(homedir(), ".local/state/leo")
const STATE_PATH = join(STATE_DIRECTORY_PATH, "heartbeat.json")
const MAC_LIST_SESSIONS_COMMAND =
  "/etc/profiles/per-user/herbcaudill/bin/node --no-warnings ~/Code/HerbCaudill/leo/scripts/heartbeat/listSessions.ts"
const COVERAGE_REPORT_URL = "http://127.0.0.1:8123/"
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
    role: args.role,
    outputPath,
    prompt: `${readFileSync(join(import.meta.dirname, `${args.promptName}.prompt.md`), "utf8")}\n\n${args.context}\n`,
    schemaPath: join(import.meta.dirname, `${args.promptName}.schema.json`),
    threadSource: `heartbeat-${args.name}`,
    timeoutMs: AGENT_TIMEOUT_MS,
  })
  return JSON.parse(readFileSync(outputPath, "utf8"))
}

/** Run a command and return its output. */
function runCommand(command: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      { maxBuffer: 100_000_000, windowsHide: true },
      (error, output) => (error ? reject(error) : resolvePromise(output)),
    )
    child.stdin?.end(input)
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

/** Check e2e's results against its target. An unreadable report is itself a signal, because it hides a stall. */
async function readE2eSignals(target: E2eTarget): Promise<string[]> {
  try {
    const response = await fetch(COVERAGE_REPORT_URL)
    const history = parseCoverageHistory(await response.text())
    return findE2eSignals({ history, target, now: new Date() })
  } catch (error) {
    return [`The e2e coverage report couldn't be read: ${error}.`]
  }
}

/** Put the question in Herb's sidebar: the owning thread asks it, or a new thread does. */
async function askHerb(result: HeartbeatResult): Promise<void> {
  const ask = planHerbAsk(result)
  if (ask.kind === "new") {
    await runT3(
      ["thread", "start", LEO_PROJECT_ID, "-", "--title", ask.title, "--json"],
      ask.message,
    )
  } else if (ask.machine === "mini") {
    await runT3(["thread", "send", ask.threadId, "-", "--json"], ask.message)
  } else {
    await runCommand(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "mac",
        `~/.t3/bin/t3 thread send ${ask.threadId} - --json --log-level error`,
      ],
      ask.message,
    )
  }
}

/** Run one heartbeat. Only a result that needs Herb touches a T3 session. */
async function main(): Promise<void> {
  mkdirSync(STATE_DIRECTORY_PATH, { recursive: true })
  const release = acquireMorningBriefingRunLock(join(STATE_DIRECTORY_PATH, "heartbeat.lock"))
  try {
    const watching = readFileSync(WATCHING_PATH, "utf8")
    if (!hasWatchedWork(watching)) return

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
    const target = readE2eTarget(watching)
    const allSignals = target ? await readE2eSignals(target) : []
    const signals = isE2eInvestigationDue({
      lastInvestigatedAt: state.lastE2eInvestigatedAt,
      now: new Date(),
    })
      ? allSignals
      : []
    const lastE2eInvestigatedAt = signals.length
      ? new Date().toISOString()
      : state.lastE2eInvestigatedAt
    // A stalled result skips the quick check, so the cheap model can't explain it away.
    const triage: TriageResult = signals.length
      ? { escalate: true, reason: signals.join(" ") }
      : await runAgent<TriageResult>({
          context,
          role: TRIAGE_ROLE,
          name: "triage",
          promptName: "triage",
        })
    console.log(`${new Date().toISOString()} triage escalate=${triage.escalate}: ${triage.reason}`)
    if (!triage.escalate) {
      writeState({ ...state, reviewedSessionKeys, lastE2eInvestigatedAt })
      return
    }

    const result = settleE2eResult({
      result: await runAgent<HeartbeatResult>({
        context: `${context}\n\nWhy the quick check flagged this: ${triage.reason}`,
        role: INVESTIGATION_ROLE,
        name: "investigation",
        promptName: "heartbeat",
      }),
      signals,
    })
    console.log(`${new Date().toISOString()} ${result.outcome}: ${result.summary}`)

    // Quiet results are journaled too, so the next quick check knows a slow pace was already looked at.
    writeJournal(date, `${result.outcome}: ${result.summary}`)
    if (result.outcome !== "needs_herb") {
      writeState({ notifiedBlockerKeys: [], reviewedSessionKeys, lastE2eInvestigatedAt })
      return
    }

    writeState({ ...state, reviewedSessionKeys, lastE2eInvestigatedAt })
    const blockerKey = result.blockerKey ?? result.summary
    // A failed delivery throws before the blocker is recorded, so a later run asks again.
    if (shouldNotifyHerb({ blockerKey, notifiedBlockerKeys: state.notifiedBlockerKeys })) {
      await askHerb(result)
      writeState({
        notifiedBlockerKeys: [...state.notifiedBlockerKeys, blockerKey],
        reviewedSessionKeys,
        lastE2eInvestigatedAt,
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
  /** Model role from the roles table in the global AGENTS.md; it must use Codex. */
  role: string
  /** Name used for artifact files and diagnostics. */
  name: string
  /** Base name of the prompt and schema files. */
  promptName: string
}

type TriageResult = {
  escalate: boolean
  reason: string
}

type HeartbeatState = {
  notifiedBlockerKeys: string[]
  reviewedSessionKeys: string[]
  lastE2eInvestigatedAt?: string
}

type LocatedSession = SessionThread & {
  /** Machine the session runs on. */
  machine: string
}
