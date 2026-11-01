import { Schema } from "effect"

/** Regions used to group candidate source feeds. */
export const NewsRegionSchema = Schema.Literal("world", "us", "spain", "barcelona", "extras")

/** Public section names accepted from agent selection and final briefing output. */
export const BriefingSectionTitleSchema = Schema.Literal(
  "World",
  "US",
  "Spain",
  "Barcelona & Catalunya",
)

/** Configuration for one source listing page and optional fallback pages. */
export const NewsSourceConfigSchema = Schema.Struct({
  fallbackUrls: Schema.optional(Schema.Array(Schema.String)),
  homepageUrl: Schema.String,
  key: Schema.String,
  name: Schema.String,
  preferFallbackUrls: Schema.optional(Schema.Boolean),
  region: NewsRegionSchema,
})

/** Headline extracted from a source listing page before it is normalized into raw briefing data. */
export const HeadlineCandidateSchema = Schema.Struct({
  body: Schema.optional(Schema.String),
  date: Schema.optional(Schema.String),
  headline: Schema.String,
  position: Schema.Number,
  url: Schema.String,
})

/** Candidate article persisted in a raw briefing file. */
export const BriefingCandidateArticleSchema = Schema.Struct({
  date: Schema.optional(Schema.String),
  headline: Schema.String,
  region: NewsRegionSchema,
  source: Schema.String,
  url: Schema.String,
})

/** Raw briefing article, including fetched article body text when available. */
export const RawBriefingArticleSchema = Schema.Struct({
  ...BriefingCandidateArticleSchema.fields,
  body: Schema.optional(Schema.String),
})

/** Raw briefing file passed to codex during story selection. */
export const RawBriefingSchema = Schema.Struct({
  articles: Schema.Array(RawBriefingArticleSchema),
  date: Schema.String,
})

/** One story selected by codex for inclusion in the briefing. */
export const BriefingSelectedStorySchema = Schema.Struct({
  headline: Schema.String,
  section: BriefingSectionTitleSchema,
  sourceUrls: Schema.Array(Schema.String),
})

/** Codex story selection output. */
export const BriefingSelectionSchema = Schema.Struct({
  stories: Schema.Array(BriefingSelectedStorySchema),
})

/** Source article attached to a hydrated selected story. */
export const HydratedBriefingSourceSchema = Schema.Struct({
  body: Schema.String,
  headline: Schema.String,
  source: Schema.String,
  url: Schema.String,
})

/** Hydrated selected story passed to codex during synthesis. */
export const HydratedBriefingStorySchema = Schema.Struct({
  headline: Schema.String,
  section: BriefingSectionTitleSchema,
  sources: Schema.Array(HydratedBriefingSourceSchema),
})

/** Hydrated story selection file passed to codex during synthesis. */
export const HydratedBriefingSelectionSchema = Schema.Struct({
  date: Schema.String,
  stories: Schema.Array(HydratedBriefingStorySchema),
})

/** Source citation in the final generated briefing JSON. */
export const FinalBriefingSourceSchema = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
})

/** Story in the final generated briefing JSON. */
export const FinalBriefingStorySchema = Schema.Struct({
  body: Schema.String,
  headline: Schema.String,
  sources: Schema.Array(FinalBriefingSourceSchema),
})

/** Section in the final generated briefing JSON. */
export const FinalBriefingSectionSchema = Schema.Struct({
  stories: Schema.Array(FinalBriefingStorySchema),
  title: BriefingSectionTitleSchema,
})

/** Final generated briefing JSON shown by the app. */
export const FinalBriefingSchema = Schema.Struct({
  sections: Schema.Array(FinalBriefingSectionSchema),
})
