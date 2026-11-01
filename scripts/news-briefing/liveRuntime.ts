import { buildRawBriefing as buildRawBriefingDefault } from "./buildRawBriefing.ts"
import { clearExistingBriefingFiles as clearExistingBriefingFilesDefault } from "./clearExistingBriefingFiles.ts"
import { commitAndPushGeneratedBriefings as commitAndPushGeneratedBriefingsDefault } from "./commitAndPushGeneratedBriefings.ts"
import {
  NEWS_SOURCE_CONFIGS,
  BRIEFINGS_DIRECTORY_PATH,
  RAW_BRIEFINGS_DIRECTORY_PATH,
} from "./constants.ts"
import { fetchPageHtmlWithCurl } from "./fetchPageHtmlWithCurl.ts"
import { listMissingBriefingDates as listMissingBriefingDatesDefault } from "./listMissingBriefingDates.ts"
import { runPiWithRawBriefing } from "./runPiWithRawBriefing.ts"
import { synthesizeBriefing as synthesizeBriefingDefault } from "./synthesizeBriefing.ts"
import type {
  BuildRawBriefingArgs,
  ClearExistingBriefingFilesArgs,
  CommitAndPushGeneratedBriefingsArgs,
  ListMissingBriefingDatesArgs,
  NewsSourceConfig,
  RawBriefing,
  RunNewsBriefingPipelineArgs,
  RunPiArgs,
  SynthesizeBriefingArgs,
} from "./types.ts"

/** Create the shared live runtime wiring used by all news briefing CLI entrypoints. */
export function makeNewsBriefingRuntime(
  /** Runtime overrides for tests or alternate CLI wiring. */
  options: NewsBriefingRuntimeOptions = {},
): NewsBriefingRuntime {
  const briefingDirectoryPath = options.briefingDirectoryPath ?? BRIEFINGS_DIRECTORY_PATH
  const rawDirectoryPath = options.rawDirectoryPath ?? RAW_BRIEFINGS_DIRECTORY_PATH
  const sourceConfigs = options.sourceConfigs ?? NEWS_SOURCE_CONFIGS
  const fetchPageHtml = options.fetchPageHtml ?? fetchPageHtmlWithCurl
  const log = options.log ?? console.log
  const runPi = options.runPi ?? runPiWithRawBriefing
  const buildRawBriefing = options.buildRawBriefing ?? buildRawBriefingDefault
  const synthesizeBriefing = options.synthesizeBriefing ?? synthesizeBriefingDefault
  const clearExistingBriefingFiles =
    options.clearExistingBriefingFiles ?? clearExistingBriefingFilesDefault
  const commitAndPushGeneratedBriefings =
    options.commitAndPushGeneratedBriefings ?? commitAndPushGeneratedBriefingsDefault
  const listMissingBriefingDates =
    options.listMissingBriefingDates ?? listMissingBriefingDatesDefault

  const createFetchArgs = (date: string): BuildRawBriefingArgs => ({
    briefingDirectoryPath,
    date,
    fetchPageHtml,
    log,
    rawDirectoryPath,
    sourceConfigs,
  })

  const createSynthesizeArgs = (date: string): SynthesizeBriefingArgs => ({
    briefingDirectoryPath,
    date,
    fetchPageHtml,
    log,
    rawDirectoryPath,
    runPi,
  })

  const listSynthesisDates = (requestedDate?: string): string[] =>
    requestedDate
      ? [requestedDate]
      : listMissingBriefingDates({ briefingDirectoryPath, rawDirectoryPath })

  const createPipelineArgs = (date: string): RunNewsBriefingPipelineArgs => ({
    clearExistingBriefingFiles: targetDate =>
      clearExistingBriefingFiles({
        briefingDirectoryPath,
        date: targetDate,
        rawDirectoryPath,
      }),
    commitAndPushGeneratedBriefings: dates => commitAndPushGeneratedBriefings({ dates }),
    date,
    listMissingBriefingDates: () => listSynthesisDates(),
    log,
    runFetchStage: targetDate => buildRawBriefing(createFetchArgs(targetDate)),
    runSynthesisStage: targetDate => synthesizeBriefing(createSynthesizeArgs(targetDate)),
  })

  return {
    createFetchArgs,
    createPipelineArgs,
    createSynthesizeArgs,
    listSynthesisDates,
  }
}

/** Shared runtime factories used by CLI entrypoints. */
export type NewsBriefingRuntime = {
  /** Create args for the raw briefing fetch entrypoint. */
  createFetchArgs: (date: string) => BuildRawBriefingArgs
  /** Create args for the full pipeline entrypoint. */
  createPipelineArgs: (date: string) => RunNewsBriefingPipelineArgs
  /** Create args for the synthesis entrypoint. */
  createSynthesizeArgs: (date: string) => SynthesizeBriefingArgs
  /** Resolve either one requested synthesis date or every missing date. */
  listSynthesisDates: (requestedDate?: string) => string[]
}

/** Optional runtime overrides for tests and alternate entrypoints. */
export type NewsBriefingRuntimeOptions = {
  /** Directory containing final public briefing files. */
  briefingDirectoryPath?: string
  /** Raw briefing builder used by the fetch and pipeline entrypoints. */
  buildRawBriefing?: (args: BuildRawBriefingArgs) => Promise<RawBriefing>
  /** Generated-file clearer used by the pipeline entrypoint. */
  clearExistingBriefingFiles?: (args: ClearExistingBriefingFilesArgs) => Promise<void>
  /** Generated-file commit/push helper used by the pipeline entrypoint. */
  commitAndPushGeneratedBriefings?: (args: CommitAndPushGeneratedBriefingsArgs) => Promise<void>
  /** Page HTML fetcher used by fetch and synthesis stages. */
  fetchPageHtml?: (url: string) => Promise<string>
  /** Missing-date lister used by synthesize and pipeline entrypoints. */
  listMissingBriefingDates?: (args: ListMissingBriefingDatesArgs) => string[]
  /** Logger used by live CLI stages. */
  log?: (message: string) => void
  /** Directory containing raw briefing files. */
  rawDirectoryPath?: string
  /** Pi runner used by the synthesis stage. */
  runPi?: (args: RunPiArgs) => Promise<string>
  /** Source configuration for the fetch stage. */
  sourceConfigs?: NewsSourceConfig[]
  /** Final briefing synthesizer used by synthesize and pipeline entrypoints. */
  synthesizeBriefing?: (args: SynthesizeBriefingArgs) => Promise<string>
}
