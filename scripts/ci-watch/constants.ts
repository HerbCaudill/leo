import { homedir } from "node:os"
import { join } from "node:path"

/** The repository whose main is watched. */
export const REPOSITORY = "DevResults/devresults-next"

/** The Mac's main checkout, which is also T3's project folder. */
export const CHECKOUT_PATH = join(homedir(), "Code/DevResults/devresults-next")

/** The watcher's own state, clone and lock. */
export const STATE_DIRECTORY_PATH = join(homedir(), ".local/state/leo/ci-watch")
