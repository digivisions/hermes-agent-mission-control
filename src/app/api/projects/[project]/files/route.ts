import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sshMac, sshMacBuffer, shQuote, MacSshError, safeRelativePath,
  containBlock, describeExitCode, isImageExt, extToMime,
} from "@/lib/macssh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_TEXT_BYTES = 1024 * 1024;      // 1 MB — above this, file is "too large to preview"
const PREVIEW_BYTES = 256 * 1024;        // 256 KB — text preview truncation
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB — image proxy cap

type Entry = { name: string; path: string; type: "dir" | "file"; size: number; mtime: string };
type RecentFile = { name: string; path: string; size: number; mtime: string };

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

function sshErrorResponse(e: unknown, notFoundCodes: number[] = [11, 13]) {
  if (e instanceof MacSshError) {
    const status = e.code != null && notFoundCodes.includes(e.code) ? 404 : 502;
    return NextResponse.json({ error: describeExitCode(e.code) }, { status });
  }
  return NextResponse.json({ error: "SSH command failed" }, { status: 502 });
}

async function handleList(repoPath: string, rawPath: string) {
  if (!repoPath) return NextResponse.json({ entries: [], noRepo: true });
  const rel = safeRelativePath(rawPath);
  if (rel === null) return NextResponse.json({ error: "invalid path" }, { status: 400 });

  const cmd = `${containBlock(repoPath, rel)}
[ -d "$TARGET" ] || exit 13
find "$TARGET" -mindepth 1 -maxdepth 1 -not -name '.*' -not -name 'node_modules' -not -name '_backup' -exec stat -f '%m|%z|%HT|%N' {} \\; 2>/dev/null`;

  let out: string;
  try {
    out = await sshMac(cmd, {});
  } catch (e) {
    return sshErrorResponse(e);
  }

  const entries: Entry[] = out
    .split("\n")
    .filter(Boolean)
    .map((line): Entry | null => {
      const parts = line.split("|");
      if (parts.length < 4) return null;
      const mtime = Number(parts[0]);
      const size = Number(parts[1]);
      const kind = parts[2];
      const full = parts.slice(3).join("|");
      const name = baseName(full);
      return {
        name,
        path: rel ? `${rel}/${name}` : name,
        type: kind === "Directory" ? "dir" : "file",
        size,
        mtime: new Date(mtime * 1000).toISOString(),
      };
    })
    .filter((e): e is Entry => e !== null);

  entries.sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)));

  return NextResponse.json({ entries });
}

async function handleRecent(repoPath: string) {
  if (!repoPath) return NextResponse.json({ files: [], noRepo: true });
  const repoQ = shQuote(repoPath);
  const cmd = `BASE=$(cd ${repoQ} 2>/dev/null && pwd -P) || exit 10
echo "BASE_LINE:$BASE"
find "$BASE" -maxdepth 2 -type f -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.venv/*" -not -path "*/.next/*" -not -path "*/_backup/*" -not -name ".*" -exec stat -f "%m|%z|%N" {} \\; 2>/dev/null | sort -rn | head -12`;

  let out: string;
  try {
    out = await sshMac(cmd, {});
  } catch (e) {
    return sshErrorResponse(e, []);
  }

  const lines = out.split("\n").filter(Boolean);
  const baseLine = lines.find((l) => l.startsWith("BASE_LINE:"));
  const base = baseLine ? baseLine.slice("BASE_LINE:".length) : repoPath.replace(/\/+$/, "");

  const files: RecentFile[] = lines
    .filter((l) => !l.startsWith("BASE_LINE:"))
    .map((line): RecentFile | null => {
      const idx1 = line.indexOf("|");
      const idx2 = line.indexOf("|", idx1 + 1);
      if (idx1 < 0 || idx2 < 0) return null;
      const mtime = Number(line.slice(0, idx1));
      const size = Number(line.slice(idx1 + 1, idx2));
      const full = line.slice(idx2 + 1);
      const rel = full.startsWith(base) ? full.slice(base.length).replace(/^\/+/, "") : baseName(full);
      return { name: baseName(full), path: rel, size, mtime: new Date(mtime * 1000).toISOString() };
    })
    .filter((f): f is RecentFile => f !== null);

  return NextResponse.json({ files });
}

function looksBinary(buf: Buffer): boolean {
  const sniffLen = Math.min(buf.length, 8000);
  if (buf.subarray(0, sniffLen).includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return false;
  } catch {
    return true;
  }
}

async function handleFile(repoPath: string, rawPath: string) {
  if (!repoPath) return NextResponse.json({ error: "no repo path configured" }, { status: 400 });
  const rel = safeRelativePath(rawPath);
  if (rel === null || rel === "") return NextResponse.json({ error: "invalid path" }, { status: 400 });

  const cmd = `${containBlock(repoPath, rel)}
[ -f "$TARGET" ] || exit 13
SZ=$(stat -f '%z' "$TARGET")
if [ "$SZ" -gt ${MAX_TEXT_BYTES} ]; then echo "TOO_LARGE:$SZ"; exit 0; fi
MT=$(stat -f '%m' "$TARGET")
echo "META:$SZ:$MT"
base64 < "$TARGET"`;

  let out: string;
  try {
    out = await sshMac(cmd, { maxBuffer: 2 * 1024 * 1024 });
  } catch (e) {
    return sshErrorResponse(e);
  }

  const nl = out.indexOf("\n");
  const firstLine = nl < 0 ? out : out.slice(0, nl);
  if (firstLine.startsWith("TOO_LARGE:")) {
    return NextResponse.json({ error: "file too large to preview" }, { status: 413 });
  }
  if (!firstLine.startsWith("META:")) {
    return NextResponse.json({ error: "unexpected SSH response" }, { status: 502 });
  }
  const [, sizeStr, mtimeStr] = firstLine.split(":");
  const size = Number(sizeStr);
  const mtime = Number(mtimeStr);
  const b64 = out.slice(nl + 1).replace(/\n/g, "");
  const buf = Buffer.from(b64, "base64");
  const name = baseName(rel);
  const mtimeIso = new Date(mtime * 1000).toISOString();

  if (looksBinary(buf)) {
    return NextResponse.json({ binary: true, name, size, mtime: mtimeIso });
  }

  const truncated = buf.length > PREVIEW_BYTES;
  const content = buf.subarray(0, PREVIEW_BYTES).toString("utf8");
  return NextResponse.json({ content, name, size, mtime: mtimeIso, truncated });
}

async function handleImage(repoPath: string, rawPath: string) {
  if (!repoPath) return NextResponse.json({ error: "no repo path configured" }, { status: 400 });
  const rel = safeRelativePath(rawPath);
  if (rel === null || rel === "" || !isImageExt(rel)) {
    return NextResponse.json({ error: "invalid image path" }, { status: 400 });
  }

  const cmd = `${containBlock(repoPath, rel)}
[ -f "$TARGET" ] || exit 13
SZ=$(stat -f '%z' "$TARGET")
if [ "$SZ" -gt ${MAX_IMAGE_BYTES} ]; then exit 20; fi
cat "$TARGET"`;

  let buf: Buffer;
  try {
    buf = await sshMacBuffer(cmd, { maxBuffer: MAX_IMAGE_BYTES + (1 << 16) });
  } catch (e) {
    return sshErrorResponse(e, [11, 13, 20]);
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": extToMime(rel), "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { searchParams } = new URL(req.url);

  const project = await prisma.project.findUnique({ where: { slug }, select: { location: true } });
  if (!project) {
    return NextResponse.json({ error: "unknown project" }, { status: 404 });
  }
  const repoPath = project.location?.trim() || "";

  if (searchParams.has("recent")) return handleRecent(repoPath);
  if (searchParams.has("img")) return handleImage(repoPath, searchParams.get("img") || "");
  if (searchParams.has("file")) return handleFile(repoPath, searchParams.get("file") || "");
  return handleList(repoPath, searchParams.get("path") || "");
}
