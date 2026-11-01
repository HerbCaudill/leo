import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { writeTextAtomically } from "./atomicWrite.ts"
import { getAgentChromeMcpArgs } from "./getAgentChromeMcpArgs.ts"
import { resolveCodexVariant } from "./resolveCodexVariant.ts"
import type { CodexVariant } from "./resolveCodexVariant.ts"

const AGENT_TIMEOUT_MS = 45 * 60 * 1_000
const FORCE_KILL_DELAY_MS = 5_000

/** Build the non-interactive Codex arguments shared by gather and synthesis agents. */
export function getCodexExecArgs(
  /** Paths and model settings for one agent run. */
  args: GetCodexExecArgsArgs,
): string[] {
  return [
    "exec",
    ...getAgentChromeMcpArgs(process.platform, args.threadSource),
    "--model",
    args.model,
    "--config",
    `model_reasoning_effort="${args.effort}"`,
    "--sandbox",
    args.sandbox ?? "danger-full-access",
    "--cd",
    args.cwd,
    "--thread-source",
    args.threadSource,
    ...(args.persistent ? [] : ["--ephemeral"]),
    "--json",
    ...(args.schemaPath ? ["--output-schema", args.schemaPath] : []),
    "--output-last-message",
    args.outputPath,
    "-",
  ]
}

/** Run one ephemeral Codex agent and persist its complete JSONL event stream. */
export async function runCodexAgent(
  /** Agent process configuration and prompt. */
  args: RunCodexAgentArgs,
): Promise<void> {
  mkdirSync(dirname(args.outputPath), { recursive: true })
  mkdirSync(dirname(args.eventsPath), { recursive: true })

  const variant = (args.resolveVariant ?? resolveCodexVariant)(args.level)
  const child = spawn(args.codexCommand, getCodexExecArgs({ ...args, ...variant }), {
    env: args.environment,
    stdio: ["pipe", "pipe", "pipe"],
  })
  const eventChunks: Buffer[] = []
  const errorChunks: Buffer[] = []

  child.stdout.on("data", chunk => eventChunks.push(Buffer.from(chunk)))
  child.stderr.on("data", chunk => errorChunks.push(Buffer.from(chunk)))
  child.stdin.end(args.prompt)

  await new Promise<void>((resolve, reject) => {
    let timedOut = false
    const timeout =
      args.timeoutMs === null
        ? undefined
        : setTimeout(() => {
            timedOut = true
            child.kill("SIGTERM")
            setTimeout(() => child.kill("SIGKILL"), FORCE_KILL_DELAY_MS).unref()
          }, args.timeoutMs ?? AGENT_TIMEOUT_MS)

    child.on("error", error => {
      clearTimeout(timeout)
      writeTextAtomically(args.eventsPath, Buffer.concat(eventChunks).toString("utf8"))
      reject(error)
    })
    child.on("close", (code, signal) => {
      clearTimeout(timeout)
      writeTextAtomically(args.eventsPath, Buffer.concat(eventChunks).toString("utf8"))
      if (timedOut) {
        reject(new Error(`Codex timed out after ${args.timeoutMs ?? AGENT_TIMEOUT_MS}ms`))
        return
      }
      if (code === 0) {
        resolve()
        return
      }

      const standardError = Buffer.concat(errorChunks).toString("utf8").trim()
      const exitDescription = signal ? `stopped by ${signal}` : `exited with code ${code}`
      reject(
        new Error(
          standardError
            ? `Codex ${exitDescription}:\n${standardError}`
            : `Codex ${exitDescription}`,
        ),
      )
    })
  })
}

export type GetCodexExecArgsArgs = {
  /** Preserve a standalone research session for later follow-up. */
  persistent?: boolean
  /** Optional sandbox restriction for classification. */
  sandbox?: "read-only" | "danger-full-access"
  /** Working repository path. */
  cwd: string
  /** Reasoning effort. */
  effort: string
  /** Model ID. */
  model: string
  /** Schema-constrained final output path. */
  outputPath: string
  /** Optional JSON Schema path for the final response. */
  schemaPath?: string
  /** Source label for diagnostics. */
  threadSource: string
}

export type RunCodexAgentArgs = Omit<GetCodexExecArgsArgs, "effort" | "model"> & {
  /** Codex executable path. */
  codexCommand: string
  /** Complete JSONL event log path. */
  eventsPath: string
  /** Environment inherited by the agent process. */
  environment: NodeJS.ProcessEnv
  /** Required intelligence from 0 to 100. */
  level: number
  /** Override how a level becomes a model and effort. */
  resolveVariant?: (level: number) => CodexVariant
  /** Prompt read from a standalone prompt file with run context appended. */
  prompt: string
  /** Optional timeout override; null lets research finish without a fixed time limit. */
  timeoutMs?: number | null
}
