# Communications lane

Lane key: `communications`

Assigned sources, in this exact spelling and order:

1. `Gmail`
2. `Slack`
3. `WhatsApp`
4. `Signal`
5. `Apple Messages`
6. `Facebook Messenger`
7. `LinkedIn`
8. `Discord`

Use the Gmail connector for Gmail and the `messaging` skill for every other messaging service. Follow that skill's routing, recovery, access, privacy, and read-only rules. Review roughly the last three days plus the secondary or archived areas named by the skill, especially WhatsApp Archived.

On the Windows mini, browser sources must use the `chrome-devtools` MCP connection to Agent Chrome at 127.0.0.1:9223. That dedicated profile holds the verified WhatsApp, Messenger, LinkedIn and Discord sign-ins. Start with list_pages and reuse matching tabs. Do not use cua_repl, the regular Chrome profile or an isolated browser context for these sources; they have separate sign-ins. If Agent Chrome is closed, start its registered `Agent Chrome` scheduled task and retry this same connection before reporting an access gap. Slack uses its integration, not a browser login.

The Windows communications agent supplies its own pinned MCP configuration; it does not require global registration. Verify a matching account tab with a lightweight read-only renderer call. A listening port or successful list_pages response is insufficient. Distinguish missing tools, connection failure, an unresponsive renderer, signed-out state, stalled sync, and incomplete history in coverage details. Do not label a source covered solely because extraction returned data: verify the requested date range, freshness, and required secondary areas. Follow the browser-use skill's side-effect limits during recovery and its discovery workflow for recurring reads. Experimental readers are not approved production fallbacks; keep using the configured route until Herb approves promotion.

For Signal and Apple Messages, read only the local messages artifact named in the run context. It holds one entry per source with a `status` and, when complete, recent conversations as `YYYY-MM-DD HH:MM Sender: text` transcripts, where `You` is Herb. Do not open either app or use Computer Use for them: the screen is usually locked during this run. When a source's status is `unavailable`, mark it incomplete and use its `reason` as the detail. These sources have no permalinks; cite the conversation name and timestamp instead.

On the mini, Apple Messages comes from the Mac's last hourly export. A `stale` status means retained conversations are available but the export is more than two hours old, often because the Mac is asleep. Review those conversations, state the `exportedAt` time and freshness limit, and mark coverage incomplete for newer activity. Describe it as stale, not missing. Never infer that there are no newer messages.

For Gmail, every query must include `in:inbox category:primary`. Do not widen into Updates, Promotions, Social, Forums, or archived mail. Gather threads where you were asked something and have not replied, important current issues with context, and what you sent during the accomplishment window when it represents a completed action or decision. Open each candidate thread and verify the latest meaningful reply before calling it unanswered. Skip newsletters, receipts, renewal reminders, and automated notices unless they report a concrete security event. Also skip unsolicited cold outreach, including investors, private-equity firms, brokers, and acquirers trawling for leads, and their follow-ups; these are spam and never warrant a reply task. Always omit one-time passwords, verification codes, magic links, sign-in links, and account-registration messages.

For messaging, gather direct questions, requests, mentions, and DMs you have not answered; significant work issues and personal updates; and messages you sent during the accomplishment window that show a completed action or decision. A reaction without a written reply leaves a direct question unanswered, but can resolve a simple FYI. Keep the visible person or conversation name, timestamp, status, and HTTPS permalink or conversation URL when available. Use the identity mappings in the repository instructions. Never infer a name from a handle.
