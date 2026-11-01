import { spawn } from "node:child_process"
import type { TasksRunner, TasksResponse } from "./types.ts"
import { getManagedInvocation } from "../getManagedInvocation.ts"

/** Run the managed CLI with converged reads, stdin JSON and bounded output. */
export const runTasks: TasksRunner = (command, input, requestId) =>
  new Promise((resolve, reject) => {
    const invocation = getManagedInvocation("tasks", [
      command,
      "--freshness",
      "converged",
      "--timezone",
      "Europe/Madrid",
      "--timeout-ms",
      "70000",
      "--input",
      "-",
      ...(requestId ? ["--request-id", requestId] : []),
    ])
    const child = spawn(invocation.command, invocation.args, { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Tasks transport deadline; inspect request ${requestId ?? command}`))
    }, 80000)
    child.stdout.setEncoding("utf8").on("data", chunk => {
      stdout += chunk
      if (Buffer.byteLength(stdout) > 16 * 1024 * 1024) {
        child.kill()
        reject(new Error("Tasks output limit exceeded"))
      }
    })
    child.stderr.resume()
    child.on("error", error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", code => {
      clearTimeout(timer)
      try {
        const result = JSON.parse(stdout) as TasksResponse
        if (
          code !==
          (
            { ok: 0, saved: 0, invalid: 2, conflict: 3, unavailable: 4, unconfirmed: 5 } as Record<
              string,
              number
            >
          )[result.status]
        )
          throw new Error("Tasks exit status disagrees with response")
        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
    child.stdin.on("error", reject)
    child.stdin.end(JSON.stringify(input) + "\n")
  })
