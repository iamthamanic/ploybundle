import { readFile } from "fs/promises";
import path from "path";

export type BoardJson = {
  projectName: string;
  target: string;
  preset: string;
  /** Which product UI compose service maps to app URL (hub overview internal fetches). */
  productFrontend?: "nextjs" | "vite-react";
  domainRoot: string;
  urls: {
    app: string;
    admin: string;
    storage: string;
    storageBrowser: string;
    functions: string;
    deploy: string;
    dashboard: string;
    databaseBrowser?: string;
  };
  /** Edit in board.json: deployed product app URLs (prod / staging). */
  productDeploymentUrls?: { serverProd?: string; serverTest?: string };
  bucketCount: number;
  /** Human-readable sidebar title; empty → formatted projectName. */
  displayName?: string;
  /** Repository URL for sidebar link. */
  repositoryUrl?: string;
  title: string;
  subtitle: string;
  theme: { primaryColor: string; secondaryColor: string };
  sections: {
    kind: string;
    id: string;
    title: string;
    serviceBadge?: string;
    summary?: string;
  }[];
  apps: {
    name: string;
    description: string;
    iconUrl: string;
    href: string;
    pingUrl?: string;
    section: string;
    providerConsole?: boolean;
  }[];
  widgets: { kind: string; section: string; title?: string; config: Record<string, unknown> }[];
  projectsRegistry?: { id: string; label: string; hubUrl: string; note?: string }[];
};

export async function loadBoard(): Promise<BoardJson> {
  const raw = await readFile(path.join(process.cwd(), "config", "board.json"), "utf-8");
  return JSON.parse(raw) as BoardJson;
}
