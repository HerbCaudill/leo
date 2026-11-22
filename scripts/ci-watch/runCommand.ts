import { execFile } from "node:child_process"

/** Run a command and answer what it printed. */
export function runCommand(
  /** The executable. */
  command: string,
  /** Its arguments. */
  args: string[],
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      { maxBuffer: 256 * 1024 * 1024, timeout: COMMAND_TIMEOUT_MS },
      (error, output) => (error ? reject(error) : resolvePromise(output)),
    )
  })
}

const COMMAND_TIMEOUT_MS = 4 * 60 * 1_000
