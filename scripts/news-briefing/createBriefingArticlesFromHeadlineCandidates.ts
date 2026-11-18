import type { BriefingCandidateArticle, HeadlineCandidate } from "./types.ts"

/** Convert headline candidates to briefing articles while skipping duplicates and empty URLs. */
export function createBriefingArticlesFromHeadlineCandidates(
  /** Candidate conversion inputs and existing article URL state. */
  args: CreateBriefingArticlesFromHeadlineCandidatesArgs,
): BriefingCandidateArticle[] {
  const seenUrls = new Set(args.existingArticleUrls)

  return args.candidates.flatMap(candidate => {
    if (!candidate.url || seenUrls.has(candidate.url)) return []

    seenUrls.add(candidate.url)

    return [
      {
        ...(candidate.body ? { body: candidate.body } : {}),
        ...(candidate.date ? { date: candidate.date } : {}),
        headline: candidate.headline,
        source: args.sourceName,
        url: candidate.url,
      },
    ]
  })
}

export type CreateBriefingArticlesFromHeadlineCandidatesArgs = {
  /** The headline candidates to convert. */
  candidates: HeadlineCandidate[]
  /** URLs already included in the briefing. */
  existingArticleUrls: Set<string>
  /** The source name to assign to each article. */
  sourceName: string
}
