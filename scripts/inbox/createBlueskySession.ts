import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** Open a session on the account's current server; tokens last only as long as this process. */
export async function createBlueskySession(): Promise<BlueskySession> {
  const password = readFileSync(PASSWORD_PATH, "utf8").trim()
  const directory = (await readJson(`https://plc.directory/${ACCOUNT_DID}`)) as {
    service: { id: string; serviceEndpoint: string }[]
  }
  const server = directory.service.find(service => service.id === "#atproto_pds")?.serviceEndpoint
  if (!server) throw new Error("Bluesky account has no server")
  const { accessJwt } = (await readJson(`${server}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: ACCOUNT_DID, password }),
  })) as { accessJwt: string }
  const headers = {
    authorization: `Bearer ${accessJwt}`,
    "atproto-proxy": "did:web:api.bsky.app#bsky_appview",
  }
  return {
    listBookmarks: cursor => {
      const url = new URL(`${server}/xrpc/app.bsky.bookmark.getBookmarks`)
      url.searchParams.set("limit", "100")
      if (cursor) url.searchParams.set("cursor", cursor)
      return readJson(url.href, { headers })
    },
    deleteBookmark: async uri => {
      await send(`${server}/xrpc/app.bsky.bookmark.deleteBookmark`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ uri }),
      })
    },
  }
}

/** Fetch JSON from an endpoint. */
async function readJson(url: string, init?: RequestInit): Promise<unknown> {
  return (await send(url, init)).json()
}

/** Send with a bounded timeout; errors name the status, never the credentials. */
async function send(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Bluesky request failed (status ${response.status})`)
  return response
}

/** Herb's account, stable across handle and server changes. */
const ACCOUNT_DID = "did:plc:xyln7ixrmzph5g7333li2tmf"
/** App password, readable only by Herb's account on the mini. */
const PASSWORD_PATH = join(homedir(), ".config/bluesky/app-password")

/** Signed-in bookmark operations. */
export type BlueskySession = {
  /** Read one page of bookmarks. */
  listBookmarks: (cursor?: string) => Promise<unknown>
  /** Remove the bookmark for a post URI. */
  deleteBookmark: (uri: string) => Promise<void>
}
