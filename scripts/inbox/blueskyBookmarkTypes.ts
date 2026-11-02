/** Retained API post fields, including unknown fields from future responses. */
export type BlueskyPost = {
  /** Stable AT URI. */
  uri: string
  /** Post author. */
  author: BlueskyAuthor
  /** Original post record. */
  record: BlueskyRecord
  /** Resolved images, links, video, and quoted posts. */
  embed?: BlueskyEmbed
  /** Preserve all returned API metadata in the archive. */
  [key: string]: unknown
}

/** Author profile fields used for the byline. */
export type BlueskyAuthor = {
  /** Stable account identifier. */
  did: string
  /** Current handle. */
  handle: string
  /** Optional display name. */
  displayName?: string
}

/** Post text and the rich-text links behind its shortened display. */
export type BlueskyRecord = {
  /** Post text, in which links can be truncated. */
  text: string
  /** Original publication timestamp, not the bookmark time. */
  createdAt?: string
  /** Rich-text ranges holding full link destinations. */
  facets?: { features: { $type?: string; uri?: string }[] }[]
}

/** Resolved embed view; `$type` decides which fields are present. */
export type BlueskyEmbed = {
  /** Lexicon type of this view. */
  $type?: string
  /** Attached images. */
  images?: { fullsize?: string; alt?: string }[]
  /** Link card. */
  external?: { uri: string; title?: string; description?: string }
  /** Video stream. */
  playlist?: string
  /** Video description. */
  alt?: string
  /** Media beside a quoted post. */
  media?: BlueskyEmbed
  /** Quoted post, nested one level deeper when it accompanies media. */
  record?: BlueskyQuote & { record?: BlueskyQuote }
}

/** Quoted post view; deleted or blocked quotes have no author or value. */
export type BlueskyQuote = {
  /** Lexicon type of this view. */
  $type?: string
  /** Stable AT URI. */
  uri?: string
  /** Quoted author. */
  author?: BlueskyAuthor
  /** Quoted post record. */
  value?: BlueskyRecord
  /** The quoted post's own embeds. */
  embeds?: BlueskyEmbed[]
}

/** One saved post, with any other returned bookmark fields. */
export type BlueskyBookmark = {
  /** Bookmarked post. */
  item: BlueskyPost
  /** Preserve all returned API metadata in the archive. */
  [key: string]: unknown
}

/** Accumulating archive of every bookmark seen. */
export type BlueskyBookmarks = {
  /** Posts in bookmark order, followed by retained history. */
  bookmarks: BlueskyBookmark[]
  /** Time the most recent full fetch completed. */
  exportedAt?: string
}
