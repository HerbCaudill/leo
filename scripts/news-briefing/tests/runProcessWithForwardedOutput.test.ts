import { EventEmitter } from "node:events"
import { PassThrough, Writable } from "node:stream"
import { describe, expect, test } from "vitest"
import { runProcessWithForwardedOutput } from "../runProcessWithForwardedOutput.ts"

describe("runProcessWithForwardedOutput", () => {
  test("forwards stdout and stderr while returning captured stdout", async () => {
    const childProcess = new EventEmitter() as ChildProcessStub
    childProcess.stdout = new PassThrough()
    childProcess.stderr = new PassThrough()

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []

    const resultPromise = runProcessWithForwardedOutput("codex", ["-p", "hello"], {
      spawnProcess: (() => childProcess) as SpawnProcessStub,
      stderr: createStringWriter(stderrChunks),
      stdout: createStringWriter(stdoutChunks),
    })

    childProcess.stdout.write("partial ")
    childProcess.stderr.write("thinking\n")
    childProcess.stdout.write("json")
    childProcess.emit("close", 0)

    await expect(resultPromise).resolves.toBe("partial json")
    expect(stdoutChunks.join("")).toBe("partial json")
    expect(stderrChunks.join("")).toBe("thinking\n")
  })

  test("can capture stdout without forwarding process output", async () => {
    const childProcess = new EventEmitter() as ChildProcessStub
    childProcess.stdout = new PassThrough()
    childProcess.stderr = new PassThrough()

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []

    const resultPromise = runProcessWithForwardedOutput("codex", ["-p", "hello"], {
      forwardStderr: false,
      forwardStdout: false,
      spawnProcess: (() => childProcess) as SpawnProcessStub,
      stderr: createStringWriter(stderrChunks),
      stdout: createStringWriter(stdoutChunks),
    })

    childProcess.stdout.write('{"stories":[]}')
    childProcess.stderr.write("final briefing text\n")
    childProcess.emit("close", 0)

    await expect(resultPromise).resolves.toBe('{"stories":[]}')
    expect(stdoutChunks.join("")).toBe("")
    expect(stderrChunks.join("")).toBe("")
  })

  test("rejects when the process exits with a non-zero code", async () => {
    const childProcess = new EventEmitter() as ChildProcessStub
    childProcess.stdout = new PassThrough()
    childProcess.stderr = new PassThrough()

    const resultPromise = runProcessWithForwardedOutput("codex", ["-p", "hello"], {
      spawnProcess: (() => childProcess) as SpawnProcessStub,
    })

    childProcess.emit("close", 2)

    await expect(resultPromise).rejects.toThrow("codex exited with code 2")
  })

  test("rejects when the process fails to spawn", async () => {
    const childProcess = new EventEmitter() as ChildProcessStub
    childProcess.stdout = new PassThrough()
    childProcess.stderr = new PassThrough()

    const resultPromise = runProcessWithForwardedOutput("codex", ["-p", "hello"], {
      spawnProcess: (() => childProcess) as SpawnProcessStub,
    })

    childProcess.emit("error", new Error("spawn failed"))

    await expect(resultPromise).rejects.toThrow("spawn failed")
  })
})

/** Create a writable stream that appends chunks to an array. */
function createStringWriter(
  /** The destination array for string chunks. */
  chunks: string[],
): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString("utf8"))
      callback()
    },
  })
}

type ChildProcessStub = EventEmitter & {
  /** The stubbed child stderr stream. */
  stderr: PassThrough
  /** The stubbed child stdout stream. */
  stdout: PassThrough
}

type SpawnProcessStub = () => ChildProcessStub
