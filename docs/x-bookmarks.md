# X bookmark intake

The mini's hourly `Inbox intake` task and the morning briefing use the same `scripts/inbox/` entrypoint. On Windows, intake also fetches Herb's X bookmarks using `xurl --app bookmarks`. The existing OAuth 2 login belongs on the mini; signing in elsewhere invalidates it. The importer only makes GET requests and never unbookmarks posts.

The source reads `/2/users/16202589/bookmarks` in pages of 100, up to 800 posts. It requests long post text, X Article metadata, authors, referenced tweets, and media. Deleted referenced posts can be absent while the bookmarked post remains usable. Authentication, rate-limit, malformed-response, and other API failures remain errors. See the [X bookmarks API reference](https://docs.x.com/x-api/users/get-bookmarks).

Each successful fetch updates `documents/x-bookmarks/bookmarks.json` and regenerates `documents/X bookmarks.md` in the notes vault. The JSON preserves the original export format and metadata. Both files retain previously archived bookmarks that no longer appear in the API response, including posts outside the 800-bookmark window. This is an accumulating archive, not an exact list of what is still bookmarked on X.

Intake is archive-only. It does not classify posts, create Tasks captures, or queue research. Herb decided on November 3, 2026 that bookmarks belong in an interactive morning review after the Tasks Inbox review. Dropping background long-read research is Leo's recommendation, implemented with this cutover: bookmark-review researches at presentation time and uses Matter for agreed reading captures.

Existing baseline journals, capture records, transfer checkpoints, research results, and completion receipts remain in place. Intake no longer resumes pending bookmark transfers, and the research worker skips all bookmark-source captures, including task-linked ones. Existing Tasks and notes are not deleted or changed. A worker already executing when the code changes can finish its current run; the next worker uses this policy. Do not delete state to retry a fetch failure.

The morning thread builds its queue from the fully paginated live list minus decisions in `documents/X bookmark review.md`, keyed by post ID. Neither the historical 145-item intake baseline nor intake completed IDs determines review eligibility. Archives retain removed posts and cannot stand in for the live list. See [Morning briefing](morning-briefing.md).

Each source runs even when another fails; intake reports combined errors after attempting all sources. Failed fetches preserve the existing archive and report the failure. Use `pnpm inbox:process --dry-run` to inspect paths without fetching, writing, or authenticating. On Windows, scheduled failures are logged under `~/.local/state/inbox-processing/` in `inbox.log` and `research.log`. The research worker remains available for non-bookmark work.
