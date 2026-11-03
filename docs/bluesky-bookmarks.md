# Bluesky bookmark intake

The mini's hourly `Inbox intake` task reads Herb's Bluesky bookmarks after his X bookmarks. Each source runs even when the other fails, and intake reports the combined errors. Intake only reads and never removes bookmarks.

It signs in with an app password stored at `~/.config/bluesky/app-password` on the mini, readable only by Herb's account, SYSTEM, and Administrators. Each run finds the account's current server, opens a new session, and calls `app.bsky.bookmark.getBookmarks` through it, following every page. Tokens are not saved. Deleted or blocked posts have no content to archive, so they are skipped.

Each successful fetch updates `documents/bluesky-bookmarks/bookmarks.json` and regenerates `documents/Bluesky bookmarks.md` in the notes vault. Like the X archive, both retain bookmarks that are no longer on Bluesky. This is an accumulating archive, not an exact list of what is still bookmarked.

Intake is archive-only, following the same November 3 cutover as [X bookmark intake](x-bookmarks.md). It does not classify bookmarks, create Tasks captures, queue long-read research, or resume old bookmark transfers or research. Existing baseline journals, capture checkpoints, and research artifacts remain intact. Do not delete state files.

The morning review uses every live bookmark with no recorded decision in `documents/Bluesky bookmark review.md`, keyed by AT URI. The historical 27-item intake baseline does not exclude items. Keep the Bluesky queue and log separate from X. Archive entries and intake completion receipts are not decisions.

Reviews use `pnpm bluesky:bookmarks list` for the live bookmarks and `pnpm bluesky:bookmarks remove <post-at-uri>` to remove one, which then re-reads the list and verifies it is gone. Run both on the mini.

Use `pnpm inbox:process --dry-run` to inspect the paths without fetching, writing, or authenticating.
