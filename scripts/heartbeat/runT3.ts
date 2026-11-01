import { spawn } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

/** Run the t3 CLI, going through cmd.exe on Windows, which batch files require. */
export function runT3(
  /** CLI arguments. */
  args: string[],
  /** Optional stdin text. */
  input?: string,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/c", join(homedir(), ".t3/bin/t3.cmd"), ...args], {
            windowsHide: true,
          })
        : spawn(join(homedir(), ".t3/bin/t3"), args)
    let output = ""
    let errorOutput = ""
    child.stdout.on("data", chunk => (output += chunk))
    child.stderr.on("data", chunk => (errorOutput += chunk))
    child.on("error", reject)
    child.on("close", code =>
      code === 0 ? resolvePromise(output) : reject(new Error(`t3 exited ${code}: ${errorOutput}`)),
    )
    child.stdin.end(input)
  })
}
