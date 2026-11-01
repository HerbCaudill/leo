export type NewsRegion = "world" | "us" | "spain" | "barcelona" | "extras"

export type NewsSourceConfig = {
  fallbackUrls?: string[]
  homepageUrl: string
  key: string
  name: string
  preferFallbackUrls?: boolean
  region: NewsRegion
}

export type HeadlineCandidate = {
  body?: string
  date?: string
  headline: string
  position: number
  url: string
}

export type CreateHeadlineCandidateArgs = {
  baseUrl: string
  body?: string
  date?: string
  headline: string
  href: string
  position: number
}

export type ExtractHeadlineCandidatesOptions = {
  briefingDate?: string
  maxArticleAgeDays?: number
}

export type IsStaleArticleDateArgs = {
  articleDate: string
  briefingDate: string
  maxAgeDays: number
}

export type CollectRecentBriefingSourceUrlsArgs = {
  briefingDirectoryPath: string
  date: string
  lookbackDays: number
}

export type HeadlineCandidateState = {
  candidates: HeadlineCandidate[]
  seenHeadlines: Set<string>
}

export type IsUsableHeadlineCandidateArgs = {
  headline: string
  minimumLength: number
  rejectGenericHeadline: boolean
  seenHeadlines: Set<string>
}

export type BriefingCandidateArticle = {
  date?: string
  headline: string
  source: string
  region: NewsRegion
  url: string
}

export type BriefingCandidates = {
  articles: BriefingCandidateArticle[]
  date: string
}

export type RawBriefingArticle = BriefingCandidateArticle & {
  body?: string
}

export type RawBriefing = {
  articles: RawBriefingArticle[]
  date: string
}

export type BriefingSelectedStory = {
  headline: string
  section: string
  sourceUrls: string[]
}

export type BriefingSelection = {
  stories: BriefingSelectedStory[]
}

export type HydratedBriefingSource = {
  body: string
  headline: string
  source: string
  url: string
}

export type HydratedBriefingStory = {
  headline: string
  section: string
  sources: HydratedBriefingSource[]
}

export type HydratedBriefingSelection = {
  date: string
  stories: HydratedBriefingStory[]
}

export type BuildRawBriefingArgs = {
  briefingDirectoryPath?: string
  date: string
  fetchPageHtml: (url: string) => Promise<string>
  log?: (message: string) => void
  maxHeadlinesPerSource?: number
  rawDirectoryPath: string
  sourceConfigs: NewsSourceConfig[]
}

export type ListMissingBriefingDatesArgs = {
  briefingDirectoryPath: string
  rawDirectoryPath: string
}

export type RunCodexArgs = {
  prompt: string
  rawBriefingPath: string
}

export type SynthesizeBriefingArgs = {
  briefingDirectoryPath: string
  date: string
  fetchPageHtml: (url: string) => Promise<string>
  log?: (message: string) => void
  now?: () => number
  rawDirectoryPath: string
  runCodex: (args: RunCodexArgs) => Promise<string>
}

export type ClearExistingBriefingFilesArgs = {
  briefingDirectoryPath: string
  date: string
  rawDirectoryPath: string
}

export type CommitAndPushGeneratedBriefingsArgs = {
  /** The directory containing public briefing JSON files. */
  briefingDirectoryPath?: string
  /** The briefing dates whose generated files should be committed. */
  dates: string[]
  /** The command runner used to execute git commands. */
  runCommand?: (command: string, args: string[]) => Promise<string>
}

export type RunNewsBriefingPipelineArgs = {
  clearExistingBriefingFiles: (date: string) => Promise<void>
  commitAndPushGeneratedBriefings: (dates: string[]) => Promise<void>
  date: string
  listMissingBriefingDates: () => string[]
  log?: (message: string) => void
  now?: () => number
  runFetchStage: (date: string) => Promise<RawBriefing>
  runSynthesisStage: (date: string) => Promise<string>
}
