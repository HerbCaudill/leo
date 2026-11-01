import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import {
  ClockService,
  FileSystemService,
  GitService,
  HttpService,
  makeClockServiceLive,
  makeHttpServiceLive,
  makeLoggingServiceLive,
  makeProcessServiceLive,
  LoggingService,
  ProcessService,
} from "../runtimeServices.ts"

describe("runtime services", () => {
  test("wraps filesystem operations in an Effect service", async () => {
    const directoryPath = await mkdtemp(join(tmpdir(), "briefing-runtime-services-"))
    const nestedDirectoryPath = join(directoryPath, "nested")
    const filePath = join(nestedDirectoryPath, "briefing.json")

    try {
      const program = Effect.gen(function* () {
        const fileSystem = yield* FileSystemService

        const existsBeforeWrite = yield* fileSystem.exists(filePath)
        yield* fileSystem.makeDirectory(nestedDirectoryPath)
        yield* fileSystem.writeText(filePath, "hello")
        const existsAfterWrite = yield* fileSystem.exists(filePath)
        const contents = yield* fileSystem.readText(filePath)

        return { contents, existsAfterWrite, existsBeforeWrite }
      })

      await expect(
        program.pipe(Effect.provide(FileSystemService.Live), Effect.runPromise),
      ).resolves.toEqual({
        contents: "hello",
        existsAfterWrite: true,
        existsBeforeWrite: false,
      })
    } finally {
      await rm(directoryPath, { force: true, recursive: true })
    }
  })

  test("builds HTTP and git services from injectable process edges", async () => {
    const commands: Array<{ args: string[]; command: string }> = []
    const ProcessServiceTest = Layer.succeed(
      ProcessService,
      ProcessService.of({
        run: (command, args) =>
          Effect.sync(() => {
            commands.push({ args, command })
            return "git output"
          }),
      }),
    )
    const HttpServiceTest = makeHttpServiceLive(url => Promise.resolve(`<html>${url}</html>`))
    const AppLayer = Layer.mergeAll(HttpServiceTest, GitService.Live).pipe(
      Layer.provide(ProcessServiceTest),
    )

    const program = Effect.gen(function* () {
      const http = yield* HttpService
      const git = yield* GitService

      const html = yield* http.fetchPageHtml("https://example.com")
      const gitOutput = yield* git.run("status", ["--short"])

      return { gitOutput, html }
    })

    await expect(program.pipe(Effect.provide(AppLayer), Effect.runPromise)).resolves.toEqual({
      gitOutput: "git output",
      html: "<html>https://example.com</html>",
    })
    expect(commands).toEqual([{ args: ["status", "--short"], command: "git" }])
  })

  test("provides clock, logging, and process live layers with injectable edges", async () => {
    const messages: string[] = []
    const ProcessServiceTest = makeProcessServiceLive((command, args) =>
      Promise.resolve(`${command} ${args.join(" ")}`),
    )
    const ClockServiceTest = makeClockServiceLive(() => 1234)
    const LoggingServiceTest = makeLoggingServiceLive(message => messages.push(message))

    const program = Effect.gen(function* () {
      const clock = yield* ClockService
      const logger = yield* LoggingService
      const process = yield* ProcessService

      const now = yield* clock.now
      const output = yield* process.run("echo", ["hello"])
      yield* logger.log("hello from logger")

      return { now, output }
    })

    await expect(
      program.pipe(
        Effect.provide(Layer.mergeAll(ProcessServiceTest, ClockServiceTest, LoggingServiceTest)),
        Effect.runPromise,
      ),
    ).resolves.toEqual({ now: 1234, output: "echo hello" })
    expect(messages).toEqual(["hello from logger"])
  })
})
