import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { runInboxIntake } from "../inbox/runInboxIntake.ts"
import { startInboxResearch } from "../inbox/startInboxResearch.ts"

import { writeTextAtomically } from "./atomicWrite.ts"
import { buildCarryoverMarkdown } from "./carryover.ts"
import {
  BRIEFINGS_REPOSITORY_PATH,
  CODEX_COMMAND_PATH,
  DAILY_NOTES_DIRECTORY_PATH,
  MORNING_BRIEFING_LANES,
  MORNING_BRIEFING_LEVEL,
  MORNING_BRIEFING_STATE_DIRECTORY_PATH,
} from "./constants.ts"
import { publishDailyBriefingToNote } from "./dailyNote.ts"
import { readLocalMessages } from "./readLocalMessages.ts"
import { gatherMorningBriefingLane } from "./gatherMorningBriefingLane.ts"
import { createInboxTasks } from "./createInboxTasks.ts"
import { finalizeMorningBriefing } from "./finalizeBriefing.ts"
import {
  createMorningBriefingManifest,
  finishMorningBriefingManifest,
  updateMorningBriefingManifest,
} from "./manifest.ts"
import { syncMorningBriefingToObsidian } from "./obsidian.ts"
import { getMorningBriefingRunPaths } from "./runPaths.ts"
import { runMorningBriefingPipeline } from "./runMorningBriefingPipeline.ts"
import { synthesizeMorningBriefing } from "./synthesizeMorningBriefing.ts"
import { presentMorningBriefingInT3 } from "./t3Presentation.ts"

/** Run the repository-owned morning briefing workflow. */
export async function runLiveMorningBriefing(
  /** Target date and optional live dependency overrides. */
  args: RunLiveMorningBriefingArgs,
): Promise<string> {
  const now = args.now ?? new Date()
  const stateDirectoryPath = args.stateDirectoryPath ?? MORNING_BRIEFING_STATE_DIRECTORY_PATH
  const dailyNotesDirectoryPath = args.dailyNotesDirectoryPath ?? DAILY_NOTES_DIRECTORY_PATH
  const codexCommand = args.codexCommand ?? CODEX_COMMAND_PATH
  const cwd = args.cwd ?? BRIEFINGS_REPOSITORY_PATH
  const paths = getMorningBriefingRunPaths({ date: args.date, now, stateDirectoryPath })
  const manifest = createMorningBriefingManifest({
    date: args.date,
    runId: paths.runId,
    startedAt: now.toISOString(),
  })
  const environment = {
    ...process.env,
    CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "Codex Desktop",
  }
  const gatherSchemaPath = join(import.meta.dirname, "schemas/gather-result.schema.json")
  const synthesisSchemaPath = join(import.meta.dirname, "schemas/synthesis-result.schema.json")
  let dailyNotePath = ""

  mkdirSync(paths.root, { mode: 0o700, recursive: true })

  try {
    const markdown = await runMorningBriefingPipeline({
      processInbox: () =>
        runStage("inbox-intake", [], async () => {
          try {
            await runInboxIntake()
          } finally {
            await startInboxResearch()
          }
        }),
      createTasks: tasks =>
        runStage("tasks", [paths.newTasksPath], async () => {
          const outcome = await createInboxTasks({ tasks, date: args.date })
          writeTextAtomically(paths.newTasksPath, `${JSON.stringify(outcome, null, 2)}\n`)
          if (outcome.deferred.length)
            console.warn(
              `[morning-briefing] Deferred ${outcome.deferred.length} new tasks; continuing with the briefing: ${outcome.error}`,
            )
          return outcome
        }),
      finalize: (briefing, tasks) =>
        runStage("finalize", [paths.finalPath], async () => {
          const finalBriefing = finalizeMorningBriefing(briefing, tasks)
          writeTextAtomically(paths.finalPath, finalBriefing)
          return finalBriefing
        }),
      gatherLane: lane =>
        runStage(`gather:${lane.key}`, [join(paths.gatherDirectoryPath, `${lane.key}.json`)], () =>
          gatherMorningBriefingLane({
            carryoverPath: paths.carryoverPath,
            codexCommand,
            cwd,
            date: args.date,
            environment,
            gatherDirectoryPath: paths.gatherDirectoryPath,
            lane,
            localMessagesPath: lane.key === "communications" ? paths.localMessagesPath : undefined,
            level: MORNING_BRIEFING_LEVEL,
            schemaPath: gatherSchemaPath,
            timeZone: args.timeZone,
          }),
        ),
      lanes: MORNING_BRIEFING_LANES,
      prepare: async () => {
        await runStage("carryover", [paths.carryoverPath], async () => {
          const carryover = buildCarryoverMarkdown({
            dailyDirectoryPath: dailyNotesDirectoryPath,
            date: args.date,
          })
          writeTextAtomically(paths.carryoverPath, carryover)
        })
        // Read native messaging apps from their databases; their UI is unreachable while the screen is locked.
        await runStage("local-messages", [paths.localMessagesPath], async () => {
          const localMessages = await readLocalMessages({
            since: new Date(now.getTime() - LOCAL_MESSAGES_WINDOW_MS),
            timeZone: args.timeZone,
          })
          writeTextAtomically(
            paths.localMessagesPath,
            `${JSON.stringify(localMessages, null, 2)}\n`,
          )
        })
      },
      presentInT3: () =>
        runStage("t3-presentation", [], () =>
          presentMorningBriefingInT3({ dailyNotePath, date: args.date }),
        ),
      publishDailyNote: async briefing => {
        await runStage("obsidian", [join(dailyNotesDirectoryPath, `${args.date}.md`)], async () => {
          dailyNotePath = publishDailyBriefingToNote(dailyNotesDirectoryPath, args.date, briefing)
        })
        try {
          await runStage("obsidian-sync", [], async () => {
            await syncMorningBriefingToObsidian()
            if (readFileSync(dailyNotePath, "utf8").includes(briefing.trimEnd())) return

            // Sync can replace the fresh note with an older remote copy, so write it over the synced version.
            dailyNotePath = publishDailyBriefingToNote(dailyNotesDirectoryPath, args.date, briefing)
            await syncMorningBriefingToObsidian()
            if (!readFileSync(dailyNotePath, "utf8").includes(briefing.trimEnd()))
              throw new Error(`Obsidian Sync removed the briefing from ${dailyNotePath}`)
          })
        } catch (error) {
          console.warn(
            `[morning-briefing] Obsidian Sync failed; continuing with the saved briefing: ${compactError(error)}`,
          )
        }
      },
      synthesize: gatherResults =>
        runStage("synthesis", [paths.mergedPath], () =>
          synthesizeMorningBriefing({
            carryoverPath: paths.carryoverPath,
            codexCommand,
            cwd,
            date: args.date,
            environment,
            gatherResults,
            mergedPath: paths.mergedPath,
            level: MORNING_BRIEFING_LEVEL,
            schemaPath: synthesisSchemaPath,
            synthesisDirectoryPath: paths.synthesisDirectoryPath,
            timeZone: args.timeZone,
          }),
        ),
    })

    finishMorningBriefingManifest({
      finishedAt: timestamp(),
      manifest,
      path: paths.manifestPath,
      status: "complete",
    })
    return markdown
  } catch (error) {
    finishMorningBriefingManifest({
      error: compactError(error),
      finishedAt: timestamp(),
      manifest,
      path: paths.manifestPath,
      status: "failed",
    })
    throw error
  }

  /** Persist one stage transition. */
  function updateStage(
    stage: string,
    update: Parameters<typeof updateMorningBriefingManifest>[0]["update"],
  ): void {
    updateMorningBriefingManifest({ manifest, path: paths.manifestPath, stage, update })
  }

  /** Run one stage and persist both successful and failed transitions. */
  async function runStage<Result>(
    stage: string,
    artifacts: string[],
    action: () => Promise<Result>,
  ): Promise<Result> {
    updateStage(stage, { artifacts, startedAt: timestamp(), status: "running" })
    try {
      const result = await action()
      updateStage(stage, { finishedAt: timestamp(), status: "complete" })
      return result
    } catch (error) {
      updateStage(stage, {
        error: compactError(error),
        finishedAt: timestamp(),
        status: "failed",
      })
      throw error
    }
  }
}

/** Describe a run without contacting sources or changing either destination. */
export function describeMorningBriefingDryRun(
  /** Target date and optional path overrides. */
  args: RunLiveMorningBriefingArgs,
) {
  const now = args.now ?? new Date()
  const paths = getMorningBriefingRunPaths({
    date: args.date,
    now,
    stateDirectoryPath: args.stateDirectoryPath ?? MORNING_BRIEFING_STATE_DIRECTORY_PATH,
  })

  return {
    date: args.date,
    destinations: {
      t3: "Two new dated threads, Morning briefing and News briefing, pinned in T3 Code",
      news: join(args.cwd ?? BRIEFINGS_REPOSITORY_PATH, "briefings", `${args.date}.json`),
      obsidian: join(args.dailyNotesDirectoryPath ?? DAILY_NOTES_DIRECTORY_PATH, `${args.date}.md`),
    },
    lanes: MORNING_BRIEFING_LANES.map(lane => ({ key: lane.key, sources: lane.sources })),
    paths,
    timeZone: args.timeZone,
  }
}

/** Cover the communications lane's three-day review plus the accomplishment window. */
const LOCAL_MESSAGES_WINDOW_MS = 4 * 24 * 60 * 60 * 1000

/** Compact a failure for the private run manifest. */
function compactError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replaceAll(/\s+/g, " ")
    .slice(0, 1_000)
}

/** Get a fresh ISO timestamp for a stage transition. */
function timestamp(): string {
  return new Date().toISOString()
}

export type RunLiveMorningBriefingArgs = {
  /** Optional Codex executable path. */
  codexCommand?: string
  /** Optional repository working path. */
  cwd?: string
  /** Optional daily-note directory. */
  dailyNotesDirectoryPath?: string
  /** Target local date. */
  date: string
  /** Optional run instant. */
  now?: Date
  /** Optional private state directory. */
  stateDirectoryPath?: string
  /** IANA time zone used to interpret the target date. */
  timeZone: string
}
