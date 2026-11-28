import { execFile, execFileSync, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { promisify } from "node:util"

import {
  LLM_CLI_PATH,
  MORNING_BRIEFING_THREAD_ROLE,
  T3_APP_NAME,
  T3_PROVIDER_INSTANCES,
} from "./constants.ts"
import { openWindowsDesktopApp } from "./openWindowsDesktopApp.ts"
import { readMorningBriefingPrompt } from "./readPromptFile.ts"

/**
 * Open T3 Code, then start a fresh thread on the thread role's model that presents the saved
 * briefing and begins the Inbox review. Starting the thread directly, rather than through a T3
 * webhook task, lets the role's model own the whole conversation: a task runs on the model of the
 * thread that created it, and Antigravity can't create one.
 */
export async function presentMorningBriefingInT3(
  /** Saved briefing location and injectable dependencies. */
  args: PresentMorningBriefingInT3Args,
): Promise<void> {
  const resolveRole = args.resolveRole ?? resolveModelRole
  const startThread = args.startThread ?? startT3Thread
  const attempts = args.attempts ?? 30
  const retryDelayMs = args.retryDelayMs ?? 10_000

  const role = resolveRole(MORNING_BRIEFING_THREAD_ROLE)
  const provider = T3_PROVIDER_INSTANCES[role.harness]
  if (!provider) throw new Error(`No T3 provider instance for the ${role.harness} harness`)
  const message = readMorningBriefingPrompt("morning-presentation.prompt.md")
    .replaceAll("{{date}}", args.date)
    .replaceAll("{{dailyNotePath}}", args.dailyNotePath)

  await (args.openT3 ?? openT3App)()
  // The T3 CLI needs the server running, which can take a while after the app opens.
  for (let attempt = 1; ; attempt++) {
    try {
      return await startThread({ message, model: role.model, provider })
    } catch (error) {
      if (attempt >= attempts) throw error
      await sleep(retryDelayMs)
    }
  }
}

/** Ask the shared `llm` CLI which harness and model a role uses. */
function resolveModelRole(
  /** Role name from the model roles table in the global AGENTS.md. */
  role: string,
): ModelRole {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", LLM_CLI_PATH, "resolve", "--role", role],
    { encoding: "utf8", windowsHide: true },
  )
  return JSON.parse(output) as ModelRole
}

/** Start a thread in Leo's T3 project through the T3 CLI, passing the message on stdin. */
function startT3Thread(
  /** Provider instance, model and first message. */
  request: StartT3ThreadRequest,
): Promise<void> {
  const projectPath = join(import.meta.dirname, "../..")
  const args = [
    "thread",
    "start",
    projectPath,
    "-",
    "--provider",
    request.provider,
    "--model",
    request.model,
  ]
  // The Windows launcher is a .cmd file, which Node can only run through cmd.exe.
  const [command, commandArgs] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/c", "t3.cmd", ...args]]
      : [join(homedir(), ".t3/bin/t3"), args]
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    })
    const stderr: Buffer[] = []
    child.stderr.on("data", chunk => stderr.push(chunk))
    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) return resolve()
      const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 500)
      reject(new Error(`t3 thread start failed: ${detail || `exit ${code}`}`))
    })
    child.stdin.end(request.message)
  })
}

/** Open T3 and deliver a saved briefing location to its presentation task. */
export async function presentBriefingInT3(
  /** Webhook credential path, saved artifact, and optional transport overrides. */
  args: PresentBriefingInT3Args,
): Promise<void> {
  const webhookUrl = readWebhookUrl(args.webhookUrlPath)
  const openT3 = args.openT3 ?? openT3App
  const fetch_ = args.fetch ?? fetch

  await openT3()
  const response = await fetch_(webhookUrl, {
    body: JSON.stringify(args.payload),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 500)
    throw new Error(`T3 webhook returned ${response.status}${detail ? `: ${detail}` : ""}`)
  }
}

type PresentBriefingInT3Args = {
  /** Saved briefing location and target date for the task prompt. */
  payload: Record<string, string>
  /** Private file containing this presentation task's webhook URL. */
  webhookUrlPath: string
  /** Optional HTTP client. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>
  /** Optional T3 Code launcher. */
  openT3?: () => Promise<void>
}

/** Read the private webhook URL, which acts as the task's credential. */
function readWebhookUrl(path: string): string {
  try {
    const url = readFileSync(path, "utf8").trim()
    if (url) return url
  } catch {
    // Report missing and unreadable credentials with the same actionable path.
  }
  throw new Error(`Missing T3 webhook URL in ${path}`)
}

/** Open T3 Code in the background; this does nothing when it is already running. */
async function openT3App(): Promise<void> {
  if (process.platform === "win32") return openWindowsDesktopApp("T3 desktop")
  await promisify(execFile)("/usr/bin/open", ["-g", "-a", T3_APP_NAME])
}

export type PresentMorningBriefingInT3Args = {
  /** Daily note containing the saved briefing. */
  dailyNotePath: string
  /** Target local date. */
  date: string
  /** Optional number of tries to start the thread while T3 starts up. */
  attempts?: number
  /** Optional T3 Code launcher. */
  openT3?: () => Promise<void>
  /** Optional role resolver. */
  resolveRole?: (role: string) => ModelRole
  /** Optional delay between tries. */
  retryDelayMs?: number
  /** Optional thread starter. */
  startThread?: (request: StartT3ThreadRequest) => Promise<void>
}

/** A model role as the `llm` CLI resolves it. */
export type ModelRole = {
  /** Reasoning effort. */
  effort: string
  /** Harness that runs the model, such as `antigravity`, `claude` or `codex`. */
  harness: string
  /** Model ID. */
  model: string
}

export type StartT3ThreadRequest = {
  /** First message for the agent. */
  message: string
  /** Model ID. */
  model: string
  /** T3 provider instance ID. */
  provider: string
}
