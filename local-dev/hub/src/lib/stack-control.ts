import { existsSync } from "node:fs";
import Docker from "dockerode";

const ALLOWED = new Set([
  "nextjs",
  "hub",
  "directus",
  "windmill",
  "windmill-worker",
  "redis",
  "postgres",
  "adminer",
  "seaweedfs",
  "vite",
]);

export async function restartComposeService(
  projectName: string,
  service: string
): Promise<{ ok: boolean; message: string }> {
  const s = service.toLowerCase().trim();
  if (!ALLOWED.has(s)) {
    return { ok: false, message: "service not on restart whitelist" };
  }
  const sock = "/var/run/docker.sock";
  if (!existsSync(sock)) {
    return { ok: false, message: "docker socket not available" };
  }
  const needle = (projectName + "-" + s).toLowerCase();
  const docker = new Docker({ socketPath: sock });
  const list = await docker.listContainers({ all: true });
  const c = list.find((x) =>
    (x.Names || []).some((n) => n.replace(/^\//, "").toLowerCase().includes(needle))
  );
  if (!c?.Id) {
    return { ok: false, message: "container not found for " + s };
  }
  await docker.getContainer(c.Id).restart();
  return { ok: true, message: "restarted " + s };
}
