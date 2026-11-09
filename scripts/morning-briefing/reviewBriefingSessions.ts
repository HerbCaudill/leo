import { readFileSync } from "node:fs"
import { join } from "node:path"

import { runT3 } from "../heartbeat/runT3.ts"
import { writeTextAtomically } from "./atomicWrite.ts"
import { runCodexAgent } from "./codexAgent.ts"
import { readMorningBriefingPrompt } from "./readPromptFile.ts"

/**
 * Summarize what Herb said in the latest prior morning briefing threads, so resolutions and
 * decisions he gave in conversation carry into today's briefing. Failures become notes in the
 * returned Markdown rather than stopping the briefing.
 */
export async function reviewBriefingSessions(
  /** Target date and the T3 and summarizer dependencies. */
  args: ReviewBriefingSessionsArgs,
): Promise<string> {
  const heading = "## Herb's updates from recent briefing sessions"

  let sessions: BriefingSession[]
  try {
    sessions = selectBriefingSessions(await args.listThreads(), args.date)
  } catch (error) {
    return `${heading}\n\nThe session review was unavailable: ${compactError(error)}\n`
  }
  if (sessions.length === 0) return `${heading}\n\nNo prior briefing sessions were found.\n`

  const summaries = await Promise.all(
    sessions.map(async session => {
      try {
        const transcript = formatTranscript(await args.showThread(session.threadId))
        const summary = await args.summarize({ ...session, transcript })
        return `### ${session.date}\n\n${summary.trim()}\n`
      } catch (error) {
        return `### ${session.date}\n\nThis session couldn't be reviewed: ${compactError(error)}\n`
      }
    }),
  )

  return `${heading}\n\n${summaries.join("\n")}`
}

/** Read briefing threads from T3 and summarize each one with a read-only Codex agent. */
export function createLiveSessionReviewDependencies(
  /** Repository path for the T3 project, and Codex settings. */
  args: CreateLiveSessionReviewDependenciesArgs,
): Pick<ReviewBriefingSessionsArgs, "listThreads" | "showThread" | "summarize"> {
  return {
    listThreads: async () =>
      JSON.parse(
        await runT3(["thread", "list", "--project", args.cwd, "--json", "--log-level", "error"]),
      ),
    showThread: async threadId =>
      JSON.parse(
        await runT3([
          "thread",
          "show",
          threadId,
          "--messages",
          "1000",
          "--json",
          "--log-level",
          "error",
        ]),
      ).messages,
    summarize: async ({ date, transcript }) => {
      const outputPath = join(args.directoryPath, `${date}.md`)
      writeTextAtomically(join(args.directoryPath, `${date}.transcript.md`), transcript)
      await runCodexAgent({
        codexCommand: args.codexCommand,
        cwd: args.cwd,
        environment: args.environment,
        eventsPath: join(args.directoryPath, `${date}.events.jsonl`),
        role: args.role,
        outputPath,
        prompt: `${readMorningBriefingPrompt("session-review.prompt.md")}\n\n## Transcript of the ${date} session\n\n${transcript}`,
        sandbox: "read-only",
        threadSource: "morning-briefing-session-review",
        timeoutMs: SUMMARY_TIMEOUT_MS,
      })
      return readFileSync(outputPath, "utf8")
    },
  }
}

/** Pick the briefing threads from the latest prior dates, newest first. */
function selectBriefingSessions(threads: T3ThreadSummary[], date: string): BriefingSession[] {
  const sessions = threads.flatMap(thread => {
    const sessionDate = BRIEFING_TITLE_PATTERN.exec(thread.title)?.[1]
    return sessionDate && sessionDate < date
      ? [{ date: sessionDate, threadId: thread.threadId }]
      : []
  })
  const dates = [...new Set(sessions.map(session => session.date))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, SESSION_COUNT)

  return dates.flatMap(sessionDate => sessions.filter(session => session.date === sessionDate))
}

/** Render thread messages as a plain transcript for the summarizer. */
function formatTranscript(messages: T3ThreadMessage[]): string {
  return messages
    .map(message => `**${message.role === "assistant" ? "Leo" : "User"}:** ${message.text.trim()}`)
    .join("\n\n")
}

/** Keep failure notes short enough for the carryover artifact. */
function compactError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replaceAll(/\s+/g, " ")
    .slice(0, 300)
}

const BRIEFING_TITLE_PATTERN = /^Morning briefing – (\d{4}-\d{2}-\d{2})$/
const SESSION_COUNT = 3
const SUMMARY_TIMEOUT_MS = 15 * 60 * 1_000

type BriefingSession = {
  /** Briefing date from the thread title. */
  date: string
  /** T3 thread ID. */
  threadId: string
}

export type T3ThreadSummary = {
  /** T3 thread ID. */
  threadId: string
  /** Thread title. */
  title: string
}

export type T3ThreadMessage = {
  /** Message author role. */
  role: string
  /** Message text. */
  text: string
}

export type ReviewBriefingSessionsArgs = {
  /** Today's local date; only earlier sessions are reviewed. */
  date: string
  /** List the threads in the Leo project. */
  listThreads: () => Promise<T3ThreadSummary[]>
  /** Read one thread's messages. */
  showThread: (threadId: string) => Promise<T3ThreadMessage[]>
  /** Summarize one session's transcript as Markdown. */
  summarize: (session: BriefingSession & { transcript: string }) => Promise<string>
}

type CreateLiveSessionReviewDependenciesArgs = {
  /** Codex executable path. */
  codexCommand: string
  /** Leo repository path, which is also the T3 project. */
  cwd: string
  /** Directory for transcripts, summaries and event logs. */
  directoryPath: string
  /** Environment inherited by Codex. */
  environment: NodeJS.ProcessEnv
  /** Model role from the roles table in the global AGENTS.md. */
  role: string
}
