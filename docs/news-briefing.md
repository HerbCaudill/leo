# News briefing

`scripts/news-briefing/` turns news homepages into a daily structured briefing. Files live in `briefings/`. The T3 news thread presents them.

## Fetch

`pnpm briefing:news` clears any generated files for the requested date, crawls the configured source homepages, extracts headline candidates locally, keeps the first 30 per source in page order, deduplicates by article URL, and writes compact metadata to `briefings/raw/YYYY-MM-DD.json` without fetching article pages.

Each candidate file stores one entry per unique article URL. Every article record includes `url`, `headline`, `source`, and `region`.

## Synthesis

The same command compares candidate files in `briefings/raw/` with final files in `briefings/`, invokes `pi` once to select stories from compact headline/URL metadata, fetches only those selected article bodies, writes the hydrated selection to `briefings/raw/YYYY-MM-DD-selection.json`, invokes `pi` again to summarize that selection, and writes the final JSON.

The final file is `briefings/YYYY-MM-DD.json`: a `title` and `sections[]`, each with a `title` and `stories[]`. Each story has a `headline`, `body`, and `sources[]` with `name` and `url`. The pipeline then commits the final, raw, and selection files, rebases, and pushes.

## Scheduling and presentation

The 07:00 morning entrypoint runs `pnpm briefing:news` concurrently with the personal briefing under one run lock. On the mini, Pi uses its `openai` provider. After news is generated and pushed, its separate T3 webhook creates a pinned `News briefing – YYYY-MM-DD` thread and unpins only older news threads. Its credential is `~/.config/morning-briefing/news-t3-webhook-url`, and its presentation prompt is `scripts/morning-briefing/prompts/news-presentation.prompt.md`. Either briefing can finish if the other fails; the scheduled command waits for both before releasing its lock.
