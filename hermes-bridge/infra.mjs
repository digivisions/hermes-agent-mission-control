#!/usr/bin/env node
/**
 * Fleet health probes (Infrastructure Monitoring). One SSH/local probe per
 * host, raced under Promise.allSettled — a probe that hangs or throws must
 * never take mirrorTick down with it, so every probe function catches
 * internally and returns a "down" host object instead of rejecting.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const TIMEOUT_MS = 8000;
const MAX_BUFFER = 1 << 20;

async function run(cmd, args) {
  const { stdout } = await execFileP(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  return stdout;
}

function classifyErr(e) {
  const msg = String(e?.stderr || e?.message || e).trim();
  if (/permission denied|authentication/i.test(msg)) return "auth";
  if (/timed out|ETIMEDOUT/i.test(msg)) return "timeout";
  return msg.split("\n")[0].slice(0, 200);
}

function parseLoad1(text) {
  const m = text.match(/load averages?:\s*([\d.]+)/i);
  return m ? Number(m[1]) : null;
}

function parseDiskPct(text) {
  // First % match is `df`'s Capacity column. macOS `df -h` also prints a
  // trailing %iused column, so the LAST match would grab the wrong number.
  const m = text.match(/(\d+)%/);
  return m ? Number(m[1]) : null;
}

function parseUptimeSeconds(text) {
  const m = text.match(/up\s+(?:(\d+)\s+days?,?\s*)?(?:(\d+):(\d+)|(\d+)\s*mins?)/i);
  if (!m) return null;
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || m[4] || 0);
  return days * 86400 + hours * 3600 + mins * 60;
}

function parseFreeM(text) {
  const m = text.match(/^Mem:\s+(\d+)\s+(\d+)/m);
  return m ? { totalMb: Number(m[1]), usedMb: Number(m[2]) } : null;
}

const ts = () => new Date().toISOString();

async function probeMac() {
  const host = "mac", role = "AI";
  try {
    const out = await run("ssh", [
      "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=8",
      "annguyen@100.73.30.127",
      "uptime; sysctl -n hw.memsize; vm_stat | head -3; df -h / | tail -1",
    ]);
    const load1 = parseLoad1(out);
    const memBytes = out.match(/^\s*(\d{9,13})\s*$/m);
    const memTotalMb = memBytes ? Number(memBytes[1]) / 1048576 : null;
    // `vm_stat | head -3` only carries free+active pages, not wired/compressed —
    // memUsedMb is therefore a floor, not the true resident total.
    const active = Number(out.match(/Pages active:\s+(\d+)\./)?.[1] || 0);
    const wired = Number(out.match(/Pages wired down:\s+(\d+)\./)?.[1] || 0);
    const compressed = Number(out.match(/Pages occupied by compressor:\s+(\d+)\./)?.[1] || 0);
    const memUsedMb = (active + wired + compressed) * 16384 / 1048576;
    const diskUsedPct = parseDiskPct(out);
    const uptimeS = parseUptimeSeconds(out);
    const ok = load1 != null && memTotalMb != null && diskUsedPct != null;
    return { host, role, status: ok ? "up" : "degraded", uptimeS, load1, memUsedMb, memTotalMb, diskUsedPct, ts: ts() };
  } catch (e) {
    return { host, role, status: "down", lastError: classifyErr(e), ts: ts() };
  }
}

async function probeVpsMain() {
  const host = "vps-main", role = "Dev/Deploy";
  try {
    const out = await run("/bin/sh", ["-c", "uptime; free -m | head -2; df -h / | tail -1"]);
    const load1 = parseLoad1(out);
    const mem = parseFreeM(out);
    const diskUsedPct = parseDiskPct(out);
    const uptimeS = parseUptimeSeconds(out);

    let detail;
    try {
      const jl = await run("/bin/sh", ["-c", "pm2 jlist"]);
      const list = JSON.parse(jl);
      const online = list.filter((p) => p?.pm2_env?.status === "online").length;
      detail = `${online}/${list.length} pm2 processes online`;
    } catch { /* pm2 optional, ride without detail */ }

    const ok = load1 != null && mem != null && diskUsedPct != null;
    return {
      host, role, status: ok ? "up" : "degraded", uptimeS, load1,
      memUsedMb: mem?.usedMb ?? null, memTotalMb: mem?.totalMb ?? null,
      diskUsedPct, detail, ts: ts(),
    };
  } catch (e) {
    return { host, role, status: "down", lastError: classifyErr(e), ts: ts() };
  }
}

async function probeVpsAnta() {
  const host = "vps-anta", role = "Hostinger KVM";
  try {
    const out = await run("ssh", [
      "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=8", "-p", "65002",
      "-i", "/home/andy/.ssh/id_ed25519_anta",
      "u550906860@72.60.238.152",
      "uptime; free -m | head -2; df -h / | tail -1",
    ]);
    const load1 = parseLoad1(out);
    const mem = parseFreeM(out);
    const diskUsedPct = parseDiskPct(out);
    const uptimeS = parseUptimeSeconds(out);
    const ok = load1 != null && mem != null && diskUsedPct != null;
    return {
      host, role, status: ok ? "up" : "degraded", uptimeS, load1,
      memUsedMb: mem?.usedMb ?? null, memTotalMb: mem?.totalMb ?? null,
      diskUsedPct, ts: ts(),
    };
  } catch (e) {
    return { host, role, status: "down", lastError: classifyErr(e), ts: ts() };
  }
}

async function probeHostingerShared() {
  const host = "hostinger-shared", role = "Shared hosting";
  try {
    const out = await run("ssh", [
      "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=8", "-p", "65002",
      "u229855994@72.61.211.107",
      "uptime; df -h / | tail -1",
    ]);
    const load1 = parseLoad1(out);
    const diskUsedPct = parseDiskPct(out);
    const uptimeS = parseUptimeSeconds(out);
    const ok = load1 != null && diskUsedPct != null;
    return { host, role, status: ok ? "up" : "degraded", uptimeS, load1, diskUsedPct, ts: ts() };
  } catch (e) {
    return { host, role, status: "down", lastError: classifyErr(e), ts: ts() };
  }
}

async function probeCron() {
  const host = "cron", role = "Hermes cron";
  try {
    const out = await run("/bin/sh", [
      "-c", "docker exec hermes /opt/hermes/.venv/bin/hermes cron list --all 2>&1 | head -30",
    ]);
    const count = out.split("\n").map((l) => l.trim()).filter(Boolean).length;
    return { host, role, status: "up", detail: `${count} entries`, ts: ts() };
  } catch (e) {
    return { host, role, status: "down", lastError: classifyErr(e), ts: ts() };
  }
}

const PROBES = [probeMac, probeVpsMain, probeVpsAnta, probeHostingerShared, probeCron];

export async function collectInfra() {
  const settled = await Promise.allSettled(PROBES.map((p) => p()));
  const hosts = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { host: PROBES[i].name.replace(/^probe/, "").toLowerCase(), role: "unknown", status: "down", lastError: classifyErr(r.reason), ts: ts() }
  );
  return { hosts, ts: ts() };
}
