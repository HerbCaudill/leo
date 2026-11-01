import { afterEach, expect, test, vi } from "vitest"

import { checkAgentChrome } from "../checkAgentChrome.ts"

afterEach(() => vi.unstubAllGlobals())

test("reports missing account tabs even when the debugging port responds", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  const result = await checkAgentChrome()
  expect(result.every(source => source.status === "missing")).toBe(true)
})

test("does not call an unresponsive account tab healthy", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          type: "page",
          url: "https://web.whatsapp.com/",
          webSocketDebuggerUrl: "ws://127.0.0.1/tab",
        },
      ],
    }),
  )
  vi.stubGlobal(
    "WebSocket",
    class extends EventTarget {
      close() {}
    },
  )
  const result = await checkAgentChrome(20)
  expect(result.find(source => source.source === "WhatsApp")?.status).toBe("unresponsive")
})

test("requires a loaded page rather than a successful connection alone", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          type: "page",
          url: "https://web.whatsapp.com/",
          webSocketDebuggerUrl: "ws://127.0.0.1/tab",
        },
      ],
    }),
  )
  vi.stubGlobal(
    "WebSocket",
    class extends EventTarget {
      constructor() {
        super()
        queueMicrotask(() => this.dispatchEvent(new Event("open")))
      }
      send() {
        this.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              id: 1,
              result: { result: { value: { ready: "complete", hasBody: true } } },
            }),
          }),
        )
      }
      close() {}
    },
  )
  const result = await checkAgentChrome()
  expect(result.find(source => source.source === "WhatsApp")?.status).toBe("responsive")
})
