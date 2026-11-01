import { spawn } from "node:child_process"
import type { Readable, Writable } from "node:stream"

/** Run a child process while forwarding stdout and stderr, then return captured stdout. */
export async function runProcessWithForwardedOutput(
  /** The executable to run. */
  command: string,
  /** The command-line arguments to pass to the executable. */
  args: string[],
  /** Output forwarding streams and optional process factory. */
  options: RunProcessWithForwardedOutputOptions = {},
): Promise<string> {
  const childProcess = (options.spawnProcess ?? spawn)(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
  }) as ChildProcessWithOutputStreams

  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []

  childProcess.stdout?.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk)

    if (options.forwardStdout ?? true) (options.stdout ?? process.stdout).write(chunk)
  })

  childProcess.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk)

    if (options.forwardStderr ?? true) (options.stderr ?? process.stderr).write(chunk)
  })

  return await new Promise((resolve, reject) => {
    childProcess.on("error", reject)
    childProcess.on("close", code => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf8"))
        return
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim()
      const message = stderr
        ? `${command} exited with code ${code}:\n${stderr}`
        : `${command} exited with code ${code}`

      reject(new Error(message))
    })
  })
}

export type RunProcessWithForwardedOutputOptions = {
  /** Whether child stderr should be written to the stderr stream. */
  forwardStderr?: boolean
  /** Whether captured child stdout should also be written to the stdout stream. */
  forwardStdout?: boolean
  /** The writable stream that receives child stderr. */
  stderr?: Writable
  /** The writable stream that receives child stdout. */
  stdout?: Writable
  /** The process factory used to start the child process. */
  spawnProcess?: SpawnProcess
}

export type ChildProcessWithOutputStreams = {
  /** Listen for process lifecycle events. */
  on: (event: "close" | "error", listener: (...args: unknown[]) => void) => unknown
  /** The child process stderr stream. */
  stderr?: Readable
  /** The child process stdout stream. */
  stdout?: Readable
}

export type SpawnProcess = (
  /** The executable to run. */
  command: string,
  /** The command-line arguments to pass to the executable. */
  args: string[],
  /** The spawn options. */
  options: { stdio: ["ignore", "pipe", "pipe"] },
) => ChildProcessWithOutputStreams
