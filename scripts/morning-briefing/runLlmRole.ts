import { spawn } from "node:child_process"

import { LLM_CLI_PATH } from "./constants.ts"

/** Run a prompt on a model role through the shared `llm` CLI, read-only, and return its final message. */
export function runLlmRole(
  /** Role, prompt and output schema. */
  request: LlmRoleRequest,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--no-warnings",
        LLM_CLI_PATH,
        "run",
        "--role",
        request.role,
        "--sandbox",
        "read-only",
        ...(request.schemaPath ? ["--schema", request.schemaPath] : []),
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    )
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", chunk => stdout.push(chunk))
    child.stderr.on("data", chunk => stderr.push(chunk))
    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) return resolve(Buffer.concat(stdout).toString("utf8"))
      const message = Buffer.concat(stderr).toString("utf8").trim()
      reject(new Error(`llm run --role ${request.role} failed: ${message || `exit ${code}`}`))
    })
    child.stdin.end(request.prompt)
  })
}

export type LlmRoleRequest = {
  /** Prompt text. */
  prompt: string
  /** Role name from the model roles table in the global AGENTS.md. */
  role: string
  /** JSON Schema the final message must match. */
  schemaPath?: string
}
