import type { BoardJson } from "./load-board";

/** Compose service hostname for the product UI (hub runs in Docker; localhost URLs must be remapped). */
export function productDockerHostFromBoard(board: BoardJson): string {
  return board.productFrontend === "vite-react" ? "vite:3000" : "nextjs:3000";
}

/**
 * Hub API routes that call other stack services should remap browser URLs (localhost:PORT) to
 * Docker DNS names when the hub shares the compose network (DATABASE_URL points at @postgres:).
 * If you run the hub with `pnpm dev` on the host and DB is localhost, no rewrite occurs.
 */
export function hubRunsInsideComposeNetwork(): boolean {
  return (process.env.DATABASE_URL ?? "").includes("@postgres");
}

export function toInternalServiceUrl(raw: string, productDockerHost: string): string {
  const u = new URL(raw);
  const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!isLocal) return raw;
  const byPort: Record<string, string> = {
    "8055": "directus:8055",
    "8000": "windmill:8000",
    "9333": "seaweedfs:9333",
    "8333": "seaweedfs:8333",
    "8088": "adminer:8080",
    "3001": productDockerHost,
    /** Product container listens on 3000; host may publish as :3000 (server mode) or :3001 (local dev). */
    "3000": productDockerHost,
  };
  const mapped = byPort[u.port];
  if (!mapped) return raw;
  return `${u.protocol}//${mapped}${u.pathname}${u.search}`;
}

export function toHubBackendServiceUrl(raw: string, productDockerHost: string): string {
  if (!hubRunsInsideComposeNetwork()) return raw;
  return toInternalServiceUrl(raw, productDockerHost);
}

/**
 * Deploy health checks: when deploy URL is CapRover on the host (:3000) while the app uses another port,
 * reach the host via host.docker.internal (hub extra_hosts). If deploy and app URLs match, use compose DNS.
 */
export function toDeployProbeUrl(deployUrl: string, appUrl: string, productDockerHost: string): string {
  if (!hubRunsInsideComposeNetwork()) return deployUrl;
  let d: URL;
  let a: URL;
  try {
    d = new URL(deployUrl);
    a = new URL(appUrl);
  } catch {
    return deployUrl;
  }
  const local = (h: string) => h === "localhost" || h === "127.0.0.1";
  if (!local(d.hostname)) return deployUrl;
  const sameAsApp = d.hostname === a.hostname && d.port === a.port;
  if (sameAsApp) return toInternalServiceUrl(deployUrl, productDockerHost);
  if (d.port === "3000") {
    return `${d.protocol}//host.docker.internal:3000${d.pathname}${d.search}`;
  }
  return toInternalServiceUrl(deployUrl, productDockerHost);
}
