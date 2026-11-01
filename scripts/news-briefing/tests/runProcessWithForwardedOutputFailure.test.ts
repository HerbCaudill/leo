import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { describe, expect, test } from "vitest"

import { runProcessWithForwardedOutput } from "../runProcessWithForwardedOutput.ts"

describe("runProcessWithForwardedOutput failure output", () => {
  test("includes captured stderr when a hidden child process fails", async () => {
    const childProcess = new EventEmitter() as ChildProcessStub
    childProcess.stdout = new PassThrough()
    childProcess.stderr = new PassThrough()

    const resultPromise = runProcessWithForwardedOutput("codex", ["-p", "hello"], {
      forwardStderr: false,
      spawnProcess: (() => childProcess) as SpawnProcessStub,
    })

    childProcess.stderr.write("Missing API key\n")
    childProcess.emit("close", 1)

    await expect(resultPromise).rejects.toThrow("codex exited with code 1:\nMissing API key")
  })
})

type ChildProcessStub = EventEmitter & {
  /** The stubbed child stderr stream. */
  stderr: PassThrough
  /** The stubbed child stdout stream. */
  stdout: PassThrough
}

type SpawnProcessStub = () => ChildProcessStub
