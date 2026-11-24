import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

/** Check account renderers without activating tabs, opening chats, or changing account state. */
export async function checkAgentChrome(
  /** Maximum wait for each protocol operation. */
  timeoutMs = 5_000,
): Promise<BrowserHealth[]> {
  let targets: BrowserTarget[]
  try {
    const response = await fetch("http://127.0.0.1:9223/json/list", {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error("Debugging endpoint unavailable")
    targets = (await response.json()) as BrowserTarget[]
  } catch {
    return SOURCES.map(([source]) => ({ source, status: "disconnected" }))
  }

  const results: BrowserHealth[] = []
  for (const [source, host] of SOURCES) {
    const target = targets.find(item => item.type === "page" && new URL(item.url).hostname === host)
    results.push({
      source,
      status: target?.webSocketDebuggerUrl
        ? await probeRenderer(target.webSocketDebuggerUrl, timeoutMs)
        : "missing",
    })
  }
  return results
}

/** Require a response from the page process, not just Chrome's HTTP listener. */
function probeRenderer(url: string, timeoutMs: number): Promise<BrowserHealth["status"]> {
  return new Promise(resolve => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => finish("unresponsive"), timeoutMs)
    let finished = false

    /** Close the diagnostic connection exactly once. */
    function finish(status: BrowserHealth["status"]): void {
      if (finished) return
      finished = true
      clearTimeout(timer)
      socket.close()
      resolve(status)
    }

    socket.addEventListener("error", () => finish("disconnected"))
    socket.addEventListener("close", () => finish("disconnected"))
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression: "({ready:document.readyState,hasBody:!!document.body})",
            returnByValue: true,
          },
        }),
      )
    })
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data))
      if (message.id !== 1) return
      const page = message.result?.result?.value
      finish(page?.ready === "complete" && page.hasBody ? "responsive" : "loading")
    })
  })
}

/** Account tabs expected in the dedicated mini profile. */
const SOURCES = [
  ["WhatsApp", "web.whatsapp.com"],
  ["Facebook Messenger", "www.messenger.com"],
  ["LinkedIn", "www.linkedin.com"],
  ["Discord", "discord.com"],
] as const

type BrowserTarget = {
  /** Target type from Chrome's loopback endpoint. */
  type: string
  /** Existing page URL; never written to the health log. */
  url: string
  /** Debugger connection scoped to the page. */
  webSocketDebuggerUrl?: string
}

type BrowserHealth = {
  /** Source name only; diagnostics omit messages, contacts, and credentials. */
  source: string
  /** Renderer responsiveness does not establish sign-in or history completeness. */
  status: "responsive" | "loading" | "unresponsive" | "missing" | "disconnected"
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const sources = await checkAgentChrome()
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), sources }))
  if (sources.some(source => source.status !== "responsive")) process.exitCode = 1
}
