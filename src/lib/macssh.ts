/**
 * File Center transport: synchronous SSH exec against the Mac (Tailscale),
 * same flags as hermes-bridge/infra.mjs's probeMac(). Deliberately NOT
 * routed through the async AgentRequest queue (hermes-bridge's normal
 * VPS→Mac path) — directory listing and file preview need a request/response
 * round trip while the user is looking at a modal, not a polled job.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const SSH_HOST = process.env.CC_SSH_HOST || "100.73.30.127";
const SSH_PORT = process.env.CC_SSH_PORT || "22";
const SSH_USER = process.env.CC_SSH_USER || "annguyen";
const SSH_KEY = (process.env.CC_SSH_KEY ?? "").trim();
const DEFAULT_TIMEOUT_MS = 8000;

export class MacSshError extends Error {
  code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.code = code;
  }
}

function sshArgs(): string[] {
  const args: string[] = ["-p", SSH_PORT];
  if (SSH_KEY) args.push("-i", SSH_KEY);
  args.push(
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=8",
    `${SSH_USER}@${SSH_HOST}`
  );
  return args;
}

/** Single-quote a value for embedding in the remote POSIX shell command. */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function run(remoteCmd: string, opts: { timeoutMs?: number; maxBuffer?: number }): Promise<string> {
  try {
    const { stdout } = await execFileP("ssh", [...sshArgs(), remoteCmd], {
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: opts.maxBuffer ?? (1 << 20),
      encoding: "utf8",
    });
    return stdout;
  } catch (e) {
    const err = e as { code?: number; killed?: boolean; signal?: string; stderr?: string; message?: string };
    if (err.killed || err.signal === "SIGTERM") throw new MacSshError("Mac SSH timed out", null);
    const msg = String(err.stderr || err.message || e).trim().split("\n")[0].slice(0, 300);
    throw new MacSshError(msg, typeof err.code === "number" ? err.code : null);
  }
}

async function runBuffer(remoteCmd: string, opts: { timeoutMs?: number; maxBuffer?: number }): Promise<Buffer> {
  try {
    const { stdout } = await execFileP("ssh", [...sshArgs(), remoteCmd], {
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: opts.maxBuffer ?? (1 << 20),
      encoding: "buffer",
    });
    return stdout as unknown as Buffer;
  } catch (e) {
    const err = e as { code?: number; killed?: boolean; signal?: string; stderr?: Buffer | string; message?: string };
    if (err.killed || err.signal === "SIGTERM") throw new MacSshError("Mac SSH timed out", null);
    const stderrText = Buffer.isBuffer(err.stderr) ? err.stderr.toString("utf8") : err.stderr;
    const msg = String(stderrText || err.message || e).trim().split("\n")[0].slice(0, 300);
    throw new MacSshError(msg, typeof err.code === "number" ? err.code : null);
  }
}

export const sshMac = run;
export const sshMacBuffer = runBuffer;

const DENYLIST = new Set(["node_modules", "_backup"]);
const MAX_DEPTH = 4;

/**
 * Validates a relative path against a repo root — no filesystem access
 * (that root lives on the Mac). Rejects traversal, hidden segments, and
 * excluded directory names before any path is ever handed to the shell.
 * Returns the cleaned relative path ("" for the root) or null if invalid.
 */
export function safeRelativePath(rel: string): string | null {
  if (rel.includes("\0")) return null;
  const norm = rel.replace(/^\/+/, "").replace(/\/+$/, "");
  if (norm === "") return "";
  const segs = norm.split("/").filter((s) => s.length > 0);
  if (segs.length > MAX_DEPTH) return null;
  for (const s of segs) {
    if (s === "." || s === "..") return null;
    if (s.startsWith(".")) return null;
    if (DENYLIST.has(s)) return null;
  }
  return segs.join("/");
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
export function isImageExt(name: string): boolean {
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  return IMAGE_EXT.has(name.slice(i).toLowerCase());
}

export function extToMime(name: string): string {
  const i = name.lastIndexOf(".");
  const ext = i < 0 ? "" : name.slice(i).toLowerCase();
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

/** Shared prefix of every generated remote script: resolve+contain repoPath/rel. */
export function containBlock(repoPath: string, rel: string): string {
  const repoQ = shQuote(repoPath);
  const relQ = shQuote(rel);
  return `BASE=$(cd ${repoQ} 2>/dev/null && pwd -P) || exit 10
if [ -z ${relQ} ]; then TARGET="$BASE"; else TARGET=$(cd ${repoQ} 2>/dev/null && realpath -- ${relQ} 2>/dev/null) || exit 11; fi
case "$TARGET" in "$BASE"|"$BASE"/*) ;; *) exit 12;; esac`;
}

/** Maps the exit codes produced by containBlock (+ callers' own exit 13/20) to a message. */
export function describeExitCode(code: number | null): string {
  switch (code) {
    case 10: return "repo path not reachable on the Mac";
    case 11: return "path not found";
    case 12: return "path escapes repo root";
    case 13: return "not the expected file type";
    case 20: return "file too large";
    default: return "SSH command failed";
  }
}
