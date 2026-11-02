import type {
  BlueskyAuthor,
  BlueskyEmbed,
  BlueskyQuote,
  BlueskyRecord,
} from "./blueskyBookmarkTypes.ts"

/** Render one archived bookmark with full links, media, and quoted posts. */
export function renderBlueskyBookmark(post: {
  /** Stable AT URI. */
  uri: string
  /** Post author. */
  author: BlueskyAuthor
  /** Original post record. */
  record: BlueskyRecord
  /** Resolved embed. */
  embed?: BlueskyEmbed
}): string {
  return renderPost(post.uri, post.author, post.record, post.embed ? [post.embed] : [])
}

/** Convert an AT URI into a shareable post link. */
export function blueskyPostUrl(
  /** Post AT URI. */
  uri: string,
): string {
  const [did, , rkey] = uri.replace("at://", "").split("/")
  return `https://bsky.app/profile/${did}/post/${rkey}`
}

/** Render a post or quote from its normalized parts. */
function renderPost(
  /** Stable AT URI. */
  uri: string,
  /** Post author. */
  author: BlueskyAuthor,
  /** Original post record. */
  record: BlueskyRecord,
  /** Resolved embeds. */
  embeds: BlueskyEmbed[],
): string {
  const byline = author.displayName
    ? `${author.displayName} (@${author.handle})`
    : `@${author.handle}`
  // Displayed text shortens links, so list the full destinations from the facets.
  const links = (record.facets ?? [])
    .flatMap(facet => facet.features)
    .flatMap(feature => (feature.uri ? [`- link: ${feature.uri}`] : []))
  return [
    `## ${byline}${record.createdAt ? ` – ${record.createdAt.slice(0, 10)}` : ""}`,
    `[View on Bluesky](${blueskyPostUrl(uri)})`,
    record.text.trim(),
    ...links,
    ...embeds.flatMap(renderEmbed),
  ].join("\n\n")
}

/** Render an embed view as archive lines. */
function renderEmbed(embed: BlueskyEmbed): string[] {
  const media = [
    ...(embed.images ?? []).map(
      image => `- image: ${image.fullsize ?? ""}${image.alt ? ` – ${image.alt}` : ""}`,
    ),
    ...(embed.external
      ? [
          `- link: ${embed.external.uri}${embed.external.title ? ` – ${embed.external.title}` : ""}${embed.external.description ? `: ${embed.external.description}` : ""}`,
        ]
      : []),
    ...(embed.playlist ? [`- video: ${embed.playlist}${embed.alt ? ` – ${embed.alt}` : ""}`] : []),
    ...(embed.media ? renderEmbed(embed.media) : []),
  ]
  const quote = embed.record?.record ?? embed.record
  return [...media, ...(quote ? renderQuote(quote) : [])]
}

/** Render a readable quoted post, skipping deleted or blocked ones. */
function renderQuote(quote: BlueskyQuote): string[] {
  if (!quote.uri || !quote.author || !quote.value) return []
  const body = renderPost(quote.uri, quote.author, quote.value, quote.embeds ?? [])
  return [
    `quoted:\n\n${body
      .split("\n")
      .map(line => `> ${line}`)
      .join("\n")}`,
  ]
}
