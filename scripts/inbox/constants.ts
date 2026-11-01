import { homedir } from "node:os"
import { join } from "node:path"

/** Obsidian vault containing X bookmarks and durable research. */
export const VAULT_PATH = join(homedir(), "Code/herbcaudill/notes")
/** Private transfer journals and agent artifacts. */
export const INBOX_STATE_PATH = join(homedir(), ".local/state/inbox-processing")
