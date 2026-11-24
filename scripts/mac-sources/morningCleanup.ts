import { execFileSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, extname, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { writeTextAtomically } from "../morning-briefing/atomicWrite.ts"

/**
 * The morning thread's view of the Mac's clutter: what's on the desktop, and recent photos of
 * documents that may stand for something Herb has to do. The thread runs this over `ssh mac`.
 */

const STATE_DIRECTORY = join(homedir(), ".local/state/leo/morning-cleanup")
const DECISIONS_PATH = join(STATE_DIRECTORY, "photo-decisions.json")
const PHOTOS_DIRECTORY = join(STATE_DIRECTORY, "photos")
const PHOTOS_LIBRARY = join(homedir(), "Pictures/Photos Library.photoslibrary")

/** How far back to look for document photos that have no decision yet. */
const LOOKBACK_DAYS = 30

/** Recognized-text payloads smaller than this are incidental text, such as a sign or a label. */
const MIN_TEXT_BYTES = 2_000

/** Seconds between the Unix epoch and Core Data's 2001-01-01 reference date. */
const CORE_DATA_EPOCH_OFFSET = 978_307_200

/** The longest edge of the copies the thread views. */
const PHOTO_MAX_EDGE = 2_048

const IGNORED_DESKTOP_NAMES = new Set([".DS_Store", ".localized", "desktop.ini"])

/** List what's on the desktop, ignoring hidden and system files. */
export function listDesktopItems(
  /** Desktop directory. */
  directory: string,
): DesktopItem[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith(".") && !IGNORED_DESKTOP_NAMES.has(entry.name))
    .map(entry => {
      const path = join(directory, entry.name)
      const stats = statSync(path)
      return {
        name: entry.name,
        path,
        kind: entry.isDirectory() ? "folder" : "file",
        bytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      } as const
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** List recent photos with recognized text that have no recorded decision, oldest first. */
export function listDocumentPhotos(
  /** Library and selection window. */
  args: {
    /** Photos library package. */
    libraryPath: string
    /** Earliest capture time to include. */
    since: Date
    /** UUIDs of photos that already have a decision. */
    decided: ReadonlySet<string>
  },
): DocumentPhoto[] {
  const database = new DatabaseSync(join(args.libraryPath, "database/Photos.sqlite"), {
    readOnly: true,
  })
  try {
    const rows = database
      .prepare(
        `select a.ZUUID as uuid, a.ZDATECREATED as created, a.ZDIRECTORY as directory,
           a.ZFILENAME as filename
         from ZASSET a
         join ZMEDIAANALYSISASSETATTRIBUTES m on m.ZASSET = a.Z_PK
         join ZCHARACTERRECOGNITIONATTRIBUTES c on c.Z_PK = m.ZCHARACTERRECOGNITIONATTRIBUTES
         where a.ZKIND = 0 and a.ZKINDSUBTYPE <> 10 and a.ZTRASHEDSTATE = 0 and a.ZHIDDEN = 0
           and a.ZVISIBILITYSTATE = 0 and a.ZDATECREATED >= ?
           and length(c.ZCHARACTERRECOGNITIONDATA) >= ?
         order by a.ZDATECREATED`,
      )
      .all(args.since.getTime() / 1000 - CORE_DATA_EPOCH_OFFSET, MIN_TEXT_BYTES) as {
      uuid: string
      created: number
      directory: string
      filename: string
    }[]
    return rows
      .filter(row => !args.decided.has(row.uuid))
      .map(row => ({
        uuid: row.uuid,
        takenAt: new Date((row.created + CORE_DATA_EPOCH_OFFSET) * 1000).toISOString(),
        sourcePath: findPhotoSource(args.libraryPath, row),
      }))
  } finally {
    database.close()
  }
}

/**
 * Find the best local image for a photo: the original when it's downloaded, or else the largest
 * preview Photos keeps locally for an original that's only in iCloud.
 */
function findPhotoSource(
  /** Photos library package. */
  libraryPath: string,
  /** Where the library stores the photo. */
  photo: { uuid: string; directory: string; filename: string },
): string | null {
  const original = join(libraryPath, "originals", photo.directory, photo.filename)
  if (existsSync(original)) return original
  const derivatives = join(libraryPath, "resources/derivatives", photo.directory)
  if (!existsSync(derivatives)) return null
  return (
    readdirSync(derivatives)
      .filter(name => name.startsWith(`${photo.uuid}_`))
      .map(name => join(derivatives, name))
      .sort((a, b) => statSync(b).size - statSync(a).size)[0] ?? null
  )
}

/**
 * Apply the actions Herb approved, continuing past failures so one bad item doesn't block the rest.
 * Nothing is deleted outright: unwanted desktop items go to the Trash, and moves and copies never
 * overwrite an existing file.
 */
export function applyCleanupActions(
  /** Where things live. */
  places: {
    /** Desktop directory. */
    desktop: string
    /** Trash directory. */
    trash: string
    /** Photos library package. */
    libraryPath: string
    /** Photo decisions file. */
    decisionsPath: string
  },
  /** Approved actions, in order. */
  actions: CleanupAction[],
): CleanupResult[] {
  return actions.map(action => {
    try {
      switch (action.kind) {
        case "trash": {
          const source = desktopPath(places.desktop, action.name)
          const target = availablePath(places.trash, action.name)
          renameSync(source, target)
          return { action, ok: true, path: target }
        }
        case "move": {
          const source = desktopPath(places.desktop, action.name)
          const target = newPath(expandHome(action.to), action.name)
          moveAcrossVolumes(source, target)
          return { action, ok: true, path: target }
        }
        case "save-photo": {
          const source = findPhotoSourceByUuid(places.libraryPath, action.uuid)
          const target = newPath(expandHome(action.to), `${action.name}${extname(source)}`)
          copyFileSync(source, target)
          return { action, ok: true, path: target }
        }
        case "decide-photo":
          recordPhotoDecision(places.decisionsPath, action.uuid, action.decision)
          return { action, ok: true }
      }
    } catch (error) {
      return { action, ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

/** Resolve a desktop item by its bare name, refusing anything outside the desktop. */
function desktopPath(desktop: string, name: string): string {
  if (name !== basename(name) || name.startsWith("."))
    throw new Error(`Not a desktop item: ${name}`)
  const path = join(desktop, name)
  if (!existsSync(path)) throw new Error(`Not on the desktop: ${name}`)
  return path
}

/** Expand a leading `~/` to the home directory. */
function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

/** A path in a new or existing directory that doesn't overwrite anything. */
function newPath(directory: string, name: string): string {
  mkdirSync(directory, { recursive: true })
  const path = join(directory, name)
  if (existsSync(path)) throw new Error(`Already exists: ${path}`)
  return path
}

/** A free name in a directory, numbering it the way Finder does when the name is taken. */
function availablePath(directory: string, name: string): string {
  const extension = extname(name)
  const stem = name.slice(0, name.length - extension.length)
  for (let copy = 1; ; copy += 1) {
    const path = join(directory, copy === 1 ? name : `${stem} ${copy}${extension}`)
    if (!existsSync(path)) return path
  }
}

/** Move a file or folder, copying it when the destination is on another volume. */
function moveAcrossVolumes(source: string, target: string): void {
  try {
    renameSync(source, target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
    execFileSync("ditto", [source, target])
    rmSync(source, { recursive: true })
  }
}

/** Find the best local image for a photo by its UUID. */
function findPhotoSourceByUuid(libraryPath: string, uuid: string): string {
  const database = new DatabaseSync(join(libraryPath, "database/Photos.sqlite"), { readOnly: true })
  try {
    const row = database
      .prepare("select ZDIRECTORY as directory, ZFILENAME as filename from ZASSET where ZUUID = ?")
      .get(uuid) as { directory: string; filename: string } | undefined
    if (!row) throw new Error(`No such photo: ${uuid}`)
    const source = findPhotoSource(libraryPath, { uuid, ...row })
    if (!source) throw new Error(`No local copy of photo ${uuid}`)
    return source
  } finally {
    database.close()
  }
}

/** Read the UUIDs of photos that already have a decision. */
export function readPhotoDecisions(
  /** Decisions file. */
  path: string,
): Set<string> {
  if (!existsSync(path)) return new Set()
  const decisions = JSON.parse(readFileSync(path, "utf8")) as PhotoDecision[]
  return new Set(decisions.map(decision => decision.uuid))
}

/** Record what was done with a photo, so it doesn't come back. */
export function recordPhotoDecision(
  /** Decisions file. */
  path: string,
  /** Photo UUID. */
  uuid: string,
  /** Short description, such as "task created" or "not a document". */
  decision: string,
  /** When the decision was made. */
  now = new Date(),
): void {
  const decisions: PhotoDecision[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : []
  decisions.push({ uuid, decision, decidedAt: now.toISOString() })
  writeTextAtomically(path, JSON.stringify(decisions, null, 2) + "\n")
}

/** Snapshot the desktop and pending document photos, with viewable copies of each photo. */
function snapshot(): Snapshot {
  mkdirSync(STATE_DIRECTORY, { recursive: true, mode: 0o700 })
  rmSync(PHOTOS_DIRECTORY, { recursive: true, force: true })
  mkdirSync(PHOTOS_DIRECTORY, { mode: 0o700 })
  const photos = listDocumentPhotos({
    libraryPath: PHOTOS_LIBRARY,
    since: new Date(Date.now() - LOOKBACK_DAYS * 86_400_000),
    decided: readPhotoDecisions(DECISIONS_PATH),
  }).map(photo => {
    if (!photo.sourcePath)
      return { ...photo, imagePath: null, note: "No local copy; open it in Photos" }
    const imagePath = join(PHOTOS_DIRECTORY, `${photo.uuid}.jpg`)
    execFileSync("sips", [
      "-s",
      "format",
      "jpeg",
      "-Z",
      String(PHOTO_MAX_EDGE),
      photo.sourcePath,
      "--out",
      imagePath,
    ])
    return { ...photo, imagePath }
  })
  return { desktop: listDesktopItems(join(homedir(), "Desktop")), photos }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, actionsPath] = process.argv.slice(2)
  if (command === "snapshot") console.log(JSON.stringify(snapshot(), null, 2))
  else if (command === "apply" && actionsPath) {
    const results = applyCleanupActions(
      {
        desktop: join(homedir(), "Desktop"),
        trash: join(homedir(), ".Trash"),
        libraryPath: PHOTOS_LIBRARY,
        decisionsPath: DECISIONS_PATH,
      },
      JSON.parse(readFileSync(resolve(homedir(), actionsPath), "utf8")),
    )
    console.log(JSON.stringify(results, null, 2))
    if (results.some(result => !result.ok)) process.exitCode = 1
  } else {
    console.error("Usage: morningCleanup.ts snapshot | apply <actions JSON path relative to home>")
    process.exit(2)
  }
}

type DesktopItem = {
  name: string
  path: string
  kind: "file" | "folder"
  bytes: number
  modifiedAt: string
}

type DocumentPhoto = {
  uuid: string
  takenAt: string
  sourcePath: string | null
}

type PhotoDecision = {
  uuid: string
  decision: string
  decidedAt: string
}

type CleanupAction =
  | { kind: "trash"; name: string }
  | { kind: "move"; name: string; to: string }
  | { kind: "save-photo"; uuid: string; to: string; name: string }
  | { kind: "decide-photo"; uuid: string; decision: string }

type CleanupResult = { action: CleanupAction; ok: boolean; path?: string; error?: string }

type Snapshot = {
  desktop: DesktopItem[]
  photos: (DocumentPhoto & { imagePath: string | null; note?: string })[]
}
