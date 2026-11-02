# Bluesky bookmark intake

The mini's hourly `Inbox intake` task reads Herb's Bluesky bookmarks after his X bookmarks. Each source runs even when the other fails, and intake reports the combined errors. Intake only reads and never removes bookmarks.

It signs in with an app password stored at `~/.config/bluesky/app-password` on the mini, readable only by Herb's account, SYSTEM, and Administrators. Each run finds the account's current server, opens a new session, and calls `app.bsky.bookmark.getBookmarks` through it, following every page. Tokens are not saved. Deleted or blocked posts have no content to archive, so they are skipped.

Each successful fetch updates `documents/bluesky-bookmarks/bookmarks.json` and regenerates `documents/Bluesky bookmarks.md` in the notes vault. Like the X archive, both retain bookmarks that are no longer on Bluesky. This is an accumulating archive, not an exact list of what is still bookmarked.

The first successful fetch becomes the baseline in `~/.local/state/inbox-processing/bluesky-bookmarks.json`. Those posts stay in the archive but do not create tasks or research work. Do not delete the journal to retry a failure, because the next fetch would baseline any bookmarks still waiting to be routed.

Later bookmarks follow the same classifier, research worker, Tasks transfer, and retry rules as [X bookmark intake](x-bookmarks.md). Captures are saved as `captures/bsky-<did>-<rkey>.json`, because Windows filenames cannot hold the colons and slashes in a post's AT URI. Task event keys use the `bluesky:` prefix.

Reviews use `pnpm bluesky:bookmarks list` for the live bookmarks and `pnpm bluesky:bookmarks remove <post-at-uri>` to remove one, which then re-reads the list and verifies it is gone. Run both on the mini.

Use `pnpm inbox:process --dry-run` to inspect the paths without fetching, writing, or authenticating.
