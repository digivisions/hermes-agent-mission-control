/**
 * Bridge-side Claude Code transport (Spec E, E4/E17).
 *
 * Dispatches `kind='claude-code'` requests to the Mac runner
 * (hermes-bridge/mac/hermes-cc-run.mjs) over ssh. The ssh argv is a FIXED
 * array with zero template interpolation of any request field — the prompt,
 * repo, model and timeout all travel as one JSON object on the runner's
 * stdin, never as part of a shell string (E17). `user@host` is the only
 * per-deploy interpolation, and it comes from env, not from a request.
 *
 * ── E1 OVERRIDE (Hermes, verified from the VPS) ──────────────────────────
 * The original design assumed the VPS could never reach the Mac and called
 * for a Mac-initiated reverse SSH tunnel (CC_SSH_HOST=127.0.0.1,
 * CC_SSH_PORT=2222). That assumption does not hold: the Mac and the VPS
 * share a Tailscale tailnet, and Tailscale SSH authenticates by node
 * identity. The VPS dials the Mac directly:
 *   CC_SSH_HOST=100.73.30.127 (Mac's Tailscale IP), CC_SSH_PORT=22,
 *   CC_SSH_KEY="" (empty — no key file; sshArgs() omits -i entirely).
 * See hermes-bridge/mac/README.md for the full writeup. §5.3 (reverse
 * tunnel) and §5.4 (Cloudflare fallback) are NOT built; they stay
 * documented escape hatches in case Tailscale SSH is ever disabled.
 */
import { spawn } from "node:child_process";

const CC_ENABLED_RAW   = process.env.CC_ENABLED ?? "1";
const CC_SSH_HOST      = process.env.CC_SSH_HOST || "100.73.30.127";
const CC_SSH_PORT      = process.env.CC_SSH_PORT || "22";
const CC_SSH_USER      = process.env.CC_SSH_USER || "annguyen";
const CC_SSH_KEY       = (process.env.CC_SSH_KEY ?? "").trim(); // empty ⇒ Tailscale SSH, no -i
const CC_NODE_BIN      = process.env.CC_NODE_BIN || "/Users/annguyen/.hermes/node/bin/node";
const CC_RUNNER        = process.env.CC_RUNNER || "/Users/annguyen/.hermes/bin/hermes-cc-run.mjs";
const CC_SSH_TIMEOUT_S = Number(process.env.CC_SSH_TIMEOUT_S || 900);
const CC_PROBE_TIMEOUT_S = Number(process.env.CC_PROBE_TIMEOUT_S || 15);

const log = (...a) => console.log(new Date().toISOString(), ...a);

let bootAssertionFailed = false;
if (/\s/.test(CC_NODE_BIN) || /\s/.test(CC_RUNNER)) {
  bootAssertionFailed = true;
  log("cc: CC_NODE_BIN or CC_RUNNER contains whitespace — they are concatenated into a remote " +
      "shell command by ssh itself; a space would break the invocation. Claude Code offload disabled.");
}

/** `0` disables triage/claiming entirely (the rollback switch, E6/E-6). */
export function ccEnabled() {
  if (bootAssertionFailed) return false;
  if (CC_ENABLED_RAW === "0") return false;
  return Boolean(CC_SSH_HOST && CC_SSH_USER && CC_RUNNER);
}

/** Fixed argv — no request field ever appears in a template literal here. */
function sshArgs() {
  const args = ["-p", String(CC_SSH_PORT)];
  if (CC_SSH_KEY) args.push("-i", CC_SSH_KEY);
  args.push(
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=4",
    `${CC_SSH_USER}@${CC_SSH_HOST}`,
    "--", CC_NODE_BIN, CC_RUNNER
  );
  return args;
}

/**
 * Run one ssh round trip: write `payload` as JSON to the runner's stdin,
 * parse its stdout as JSON. Never rejects — every failure mode (spawn error,
 * timeout, non-zero exit with empty stdout, unparseable stdout) resolves to
 * `{ok:false, error}` so a wedged Mac never throws out of the caller.
 */
function sshRun(payload, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(killer);
      resolve(result);
    };
    try {
      child = spawn("ssh", sshArgs(), { stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      finish({ ok: false, error: `ssh spawn failed: ${String(e.message || e)}` });
      return;
    }
    const killer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      finish({ ok: false, error: `ssh timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (d) => { if (stdout.length < 2 * 1024 * 1024) stdout += d.toString(); });
    child.stderr.on("data", (d) => { if (stderr.length < 8 * 1024) stderr += d.toString(); });
    child.on("error", (e) => finish({ ok: false, error: `ssh error: ${String(e.message || e)}` }));
    child.on("close", () => {
      const trimmed = stdout.trim();
      if (!trimmed) {
        finish({ ok: false, error: `ssh returned no output${stderr ? `: ${stderr.split("\n")[0].slice(0, 300)}` : ""}` });
        return;
      }
      try {
        finish(JSON.parse(trimmed));
      } catch {
        // A stray ssh banner / motd landing in stdout is the classic failure here.
        finish({ ok: false, error: `unparseable runner output: ${trimmed.slice(0, 200)}` });
      }
    });

    try {
      child.stdin.end(JSON.stringify(payload));
    } catch (e) {
      finish({ ok: false, error: `failed writing to ssh stdin: ${String(e.message || e)}` });
    }
  });
}

/** For log lines only — never used to build the ssh argv itself. */
export function ccTarget() {
  return `${CC_SSH_HOST}:${CC_SSH_PORT}`;
}

/** One round trip that validates ssh + node + the runner + `claude` at once. */
export async function ccProbe() {
  const r = await sshRun({ ping: true }, CC_PROBE_TIMEOUT_S * 1000);
  return r?.ok === true;
}

export async function ccRun({ requestId, repo, model, prompt }) {
  return sshRun(
    { requestId, repo, model, prompt, timeoutS: CC_SSH_TIMEOUT_S },
    (CC_SSH_TIMEOUT_S + 30) * 1000
  );
}

/** The markdown block that becomes AgentRequest.result and the assistant ChatMessage. */
export function formatCcResult(r) {
  const parts = [r.output || ""];
  if (r.diffStat) {
    parts.push(
      "",
      "---",
      `**Diff** · \`${r.branch}\``,
      "```",
      r.diffStat,
      "```",
      `Worktree: \`${r.worktree}\` · patch: \`${r.patchPath}\``
    );
  } else {
    parts.push("", "_No file changes._");
  }
  if (r.permissionDenials > 0) {
    parts.push("", `⚠️ ${r.permissionDenials} permission denial(s)`);
  }
  return parts.join("\n");
}
