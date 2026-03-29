import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import Docker from "dockerode";
import { loadBoard } from "@/lib/load-board";

const SERVICE_SUFFIX: Record<string, string> = {
  postgres: "postgres",
  redis: "redis",
  adminer: "adminer",
  seaweedfs: "seaweedfs",
  directus: "directus",
  windmill: "windmill",
  "windmill-worker": "windmill-worker",
  app: "nextjs",
  nextjs: "nextjs",
  hub: "hub",
};

function demuxDockerLogs(buf: Buffer): string {
  let i = 0;
  let out = "";
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4);
    if (len < 0 || i + 8 + len > buf.length) break;
    out += buf.subarray(i + 8, i + 8 + len).toString("utf8");
    i += 8 + len;
  }
  return out.length > 0 ? out : buf.toString("utf8");
}

export async function GET(req: Request) {
  const board = await loadBoard();
  const { searchParams } = new URL(req.url);
  const rawSvc = (searchParams.get("service") || "hub").toLowerCase();
  const lines = Math.min(500, Math.max(20, Number(searchParams.get("lines")) || 200));
  const suffix = SERVICE_SUFFIX[rawSvc] || rawSvc;
  const needle = (board.projectName + "-" + suffix).toLowerCase();

  const enabled = process.env.HUB_LOGS_ENABLED === "1";
  const sock = "/var/run/docker.sock";
  if (!enabled || !existsSync(sock)) {
    return NextResponse.json({
      enabled: false,
      service: rawSvc,
      hint: !enabled
        ? "HUB_LOGS_ENABLED is not set to 1 on this hub instance."
        : "Docker socket missing. Local compose templates mount /var/run/docker.sock for the hub.",
      composeExample: "docker compose logs --tail=" + lines + " " + rawSvc,
    });
  }

  try {
    const docker = new Docker({ socketPath: sock });
    const list = await docker.listContainers({ all: true });
    const c = list.find((x) =>
      (x.Names || []).some((n) => n.replace(/^\//, "").toLowerCase().includes(needle))
    );
    if (!c) {
      return NextResponse.json({ error: "container not found", needle }, { status: 404 });
    }
    const raw = await docker.getContainer(c.Id).logs({
      stdout: true,
      stderr: true,
      tail: lines,
      timestamps: true,
    });
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    return NextResponse.json({
      enabled: true,
      service: rawSvc,
      container: c.Names?.[0],
      lines,
      log: demuxDockerLogs(buf),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
