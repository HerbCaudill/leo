import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { Context, Effect, Layer } from "effect"
import { fetchPageHtmlWithCurl } from "./fetchPageHtmlWithCurl.ts"
import { runProcessWithForwardedOutput } from "./runProcessWithForwardedOutput.ts"
import type { RunCodexArgs } from "./types.ts"

const FileSystemServiceTag = Context.GenericTag<FileSystemService>(
  "news-briefing/FileSystemService",
)
const HttpServiceTag = Context.GenericTag<HttpService>("news-briefing/HttpService")
const ProcessServiceTag = Context.GenericTag<ProcessService>("news-briefing/ProcessService")
const CodexServiceTag = Context.GenericTag<CodexService>("news-briefing/CodexService")
const GitServiceTag = Context.GenericTag<GitService>("news-briefing/GitService")
const ClockServiceTag = Context.GenericTag<ClockService>("news-briefing/ClockService")
const LoggingServiceTag = Context.GenericTag<LoggingService>("news-briefing/LoggingService")

const FileSystemServiceLive = Layer.succeed(
  FileSystemServiceTag,
  FileSystemServiceTag.of({
    exists: path => Effect.sync(() => existsSync(path)),
    makeDirectory: path => Effect.sync(() => mkdirSync(path, { recursive: true })),
    readText: path => Effect.sync(() => readFileSync(path, "utf8")),
    writeText: (path, contents) => Effect.sync(() => writeFileSync(path, contents)),
  }),
)

/** Create a live codex service layer from an injectable codex runner. */
export function makeCodexServiceLive(
  /** The promise-based codex runner to expose as an Effect service. */
  runCodex: (args: RunCodexArgs) => Promise<string>,
) {
  return Layer.succeed(
    CodexServiceTag,
    CodexServiceTag.of({
      run: args =>
        Effect.tryPromise({
          catch: error => toError(error),
          try: () => runCodex(args),
        }),
    }),
  )
}

const GitServiceLive = Layer.effect(
  GitServiceTag,
  Effect.gen(function* () {
    const processService = yield* ProcessServiceTag

    return GitServiceTag.of({
      run: (command, args) => processService.run("git", [command, ...args]),
    })
  }),
)

/** Create a live HTTP service layer from an injectable page fetcher. */
export function makeHttpServiceLive(
  /** The promise-based page fetcher to expose as an Effect service. */
  fetchPageHtml: (url: string) => Promise<string> = fetchPageHtmlWithCurl,
) {
  return Layer.succeed(
    HttpServiceTag,
    HttpServiceTag.of({
      fetchPageHtml: url =>
        Effect.tryPromise({
          catch: error => toError(error),
          try: () => fetchPageHtml(url),
        }),
    }),
  )
}

/** Create a live clock service layer from an injectable timestamp provider. */
export function makeClockServiceLive(
  /** The timestamp provider to expose as an Effect service. */
  now: () => number = Date.now,
) {
  return Layer.succeed(
    ClockServiceTag,
    ClockServiceTag.of({
      now: Effect.sync(() => now()),
    }),
  )
}

/** Create a live logging service layer from an injectable logger. */
export function makeLoggingServiceLive(
  /** The logger to expose as an Effect service. */
  log: (message: string) => void = console.log,
) {
  return Layer.succeed(
    LoggingServiceTag,
    LoggingServiceTag.of({
      log: message => Effect.sync(() => log(message)),
    }),
  )
}

/** Create a live process service layer from an injectable command runner. */
export function makeProcessServiceLive(
  /** The promise-based command runner to expose as an Effect service. */
  runProcess: ProcessRunner = runProcessWithForwardedOutput,
) {
  return Layer.succeed(
    ProcessServiceTag,
    ProcessServiceTag.of({
      run: (command, args, options) =>
        Effect.tryPromise({
          catch: error => toError(error),
          try: () => runProcess(command, args, options),
        }),
    }),
  )
}

/** Convert unknown failures from script edges to Error values. */
export function toError(
  /** The unknown failure value. */
  error: unknown,
): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** Filesystem operations used at script boundaries. */
export type FileSystemService = {
  /** Check whether a path exists. */
  exists: (path: string) => Effect.Effect<boolean, Error>
  /** Create a directory recursively. */
  makeDirectory: (path: string) => Effect.Effect<string | undefined, Error>
  /** Read a UTF-8 text file. */
  readText: (path: string) => Effect.Effect<string, Error>
  /** Write a UTF-8 text file. */
  writeText: (path: string, contents: string) => Effect.Effect<void, Error>
}

/** HTTP fetching operations used at script boundaries. */
export type HttpService = {
  /** Fetch one page of HTML. */
  fetchPageHtml: (url: string) => Effect.Effect<string, Error>
}

/** Subprocess operations used at script boundaries. */
export type ProcessService = {
  /** Run a command and return captured stdout. */
  run: (
    command: string,
    args: string[],
    options?: ProcessRunOptions,
  ) => Effect.Effect<string, Error>
}

/** Codex execution operations used at script boundaries. */
export type CodexService = {
  /** Run codex against a raw briefing file. */
  run: (args: RunCodexArgs) => Effect.Effect<string, Error>
}

/** Git command operations used at script boundaries. */
export type GitService = {
  /** Run a git subcommand and return captured stdout. */
  run: (command: string, args: string[]) => Effect.Effect<string, Error>
}

/** Clock operations used at script boundaries. */
export type ClockService = {
  /** Get the current timestamp in milliseconds. */
  now: Effect.Effect<number>
}

/** Logging operations used at script boundaries. */
export type LoggingService = {
  /** Write a log message. */
  log: (message: string) => Effect.Effect<void>
}

/** Options for process execution. */
export type ProcessRunOptions = {
  /** Whether child stderr should be written to the stderr stream. */
  forwardStderr?: boolean
  /** Whether captured child stdout should also be written to the stdout stream. */
  forwardStdout?: boolean
}

/** Promise-based command runner accepted by the process service layer. */
export type ProcessRunner = (
  /** The executable to run. */
  command: string,
  /** The command-line arguments to pass to the executable. */
  args: string[],
  /** Process output options. */
  options?: ProcessRunOptions,
) => Promise<string>

export const FileSystemService = Object.assign(FileSystemServiceTag, {
  Live: FileSystemServiceLive,
})
export const HttpService = Object.assign(HttpServiceTag, {
  Live: makeHttpServiceLive(),
  LiveFromFetcher: makeHttpServiceLive,
})
export const ProcessService = Object.assign(ProcessServiceTag, {
  Live: makeProcessServiceLive(),
  LiveFromRunner: makeProcessServiceLive,
})
export const CodexService = Object.assign(CodexServiceTag, {
  LiveFromRunner: makeCodexServiceLive,
})
export const GitService = Object.assign(GitServiceTag, { Live: GitServiceLive })
export const ClockService = Object.assign(ClockServiceTag, {
  Live: makeClockServiceLive(),
  LiveFromNow: makeClockServiceLive,
})
export const LoggingService = Object.assign(LoggingServiceTag, {
  Live: makeLoggingServiceLive(),
  LiveFromLogger: makeLoggingServiceLive,
})
