import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const execFileP = promisify(execFile);

async function checkService(name: string, check: () => Promise<boolean>): Promise<{ name: string; up: boolean }> {
  try {
    return { name, up: await check() };
  } catch {
    return { name, up: false };
  }
}

async function dockerRunning(container: string): Promise<boolean> {
  const { stdout } = await execFileP("docker", ["inspect", "-f", "{{.State.Running}}", container]);
  return stdout.trim() === "true";
}

async function pm2Running(app: string): Promise<boolean> {
  const { stdout } = await execFileP("pm2", ["jlist"]).catch(() => ({ stdout: "[]" }));
  try {
    const list = JSON.parse(stdout);
    const found = list.find((p: { name: string }) => p.name === app);
    return found?.pm2_env?.status === "online";
  } catch {
    return false;
  }
}

async function httpOk(url: string): Promise<boolean> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  return res.ok || res.status < 500;
}

export async function GET() {
  const [hermes, caddy, honcho, hermyHq, bridge, n8n, musicApi] = await Promise.all([
    checkService("hermes", () => dockerRunning("hermes")),
    checkService("caddy", () => dockerRunning("caddy")),
    checkService("honcho", () => dockerRunning("honcho-api")),
    checkService("hermy-hq", () => pm2Running("hermy-hq")),
    checkService("hermes-bridge", () => pm2Running("hermes-bridge")),
    checkService("n8n", () => dockerRunning("n8n-q590-n8n-1")),
    checkService("music-landing-api", () => pm2Running("music-landing-api")),
  ]);

  // Mac mounts (sshfs over Tailscale) — whole home + DATA2
  const mounts = [
    { label: "Mac Home (annguyen)", path: "/home/andy/mac" },
    { label: "DATA2 Drive", path: "/home/andy/data2" },
  ].map((m) => ({
    ...m,
    mounted: (() => {
      try {
        const st = fs.statSync(m.path);
        return st.isDirectory();
      } catch {
        return false;
      }
    })(),
  }));

  // Vault mirror freshness
  let vaultSyncedAt: string | null = null;
  try {
    const st = fs.statSync("/home/andy/vault-mirror/Projects");
    vaultSyncedAt = st.mtime.toISOString();
  } catch {
    /* not synced yet */
  }

  const services = [hermes, caddy, honcho, hermyHq, bridge, n8n, musicApi];
  const allUp = services.every((s) => s.up);

  return NextResponse.json(
    {
      services,
      allUp,
      mounts,
      macConnected: mounts.some((m) => m.mounted),
      vaultSyncedAt,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, no-cache" } }
  );
}
