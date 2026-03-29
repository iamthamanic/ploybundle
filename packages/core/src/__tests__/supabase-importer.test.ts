import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { importSupabaseProject } from "../importers/supabase-importer.js";

const tempDirs: string[] = [];

async function makeSupabaseFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ploybundle-supabase-"));
  tempDirs.push(root);

  await mkdir(path.join(root, "supabase", "migrations"), { recursive: true });
  await mkdir(path.join(root, "supabase", "functions", "hello"), { recursive: true });
  await mkdir(path.join(root, "supabase", "functions", "preview_worker"), { recursive: true });
  await mkdir(path.join(root, "supabase", "functions", "nightly_sync"), { recursive: true });

  await writeFile(
    path.join(root, ".env.local"),
    [
      "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key",
      "SUPABASE_SERVICE_ROLE_KEY=super-secret-service-role",
      "OPENAI_API_KEY=sk-secret-openai",
      "",
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    path.join(root, "supabase", "migrations", "20260329_init.sql"),
    `
      create table public.profiles (
        id uuid primary key,
        user_id uuid not null unique,
        full_name text not null,
        created_at timestamp with time zone not null
      );

      create table public.projects (
        id uuid primary key,
        profile_id uuid references public.profiles(id),
        workspace_id uuid not null,
        metadata jsonb,
        is_active boolean not null default true
      );

      create table public.memberships (
        id uuid primary key,
        workspace_id uuid not null,
        user_id uuid not null
      );

      alter table public.profiles enable row level security;
      create policy "users can read own profile"
        on public.profiles
        for select
        to authenticated
        using (auth.uid() = user_id);

      alter table public.projects enable row level security;
      create policy "members can read projects"
        on public.projects
        for select
        to authenticated
        using (true);

      alter table public.memberships enable row level security;
      create policy "workspace members only"
        on public.memberships
        for select
        to authenticated
        using (((auth.jwt() ->> 'workspace_id')::uuid = workspace_id));

      alter publication supabase_realtime add table public.projects;
    `,
    "utf8"
  );

  await writeFile(
    path.join(root, "supabase", "functions", "hello", "index.ts"),
    `Deno.serve(() => new Response("ok"));`,
    "utf8"
  );
  await writeFile(
    path.join(root, "supabase", "functions", "preview_worker", "index.ts"),
    `Deno.serve(() => new Response("preview"));`,
    "utf8"
  );
  await writeFile(
    path.join(root, "supabase", "functions", "nightly_sync", "index.ts"),
    `Deno.serve(() => new Response("sync"));`,
    "utf8"
  );
  await writeFile(
    path.join(root, "src-realtime.ts"),
    `client.channel("project-feed").on("postgres_changes", {}, () => {});`,
    "utf8"
  );

  return root;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("importSupabaseProject", () => {
  it("generates an AppSpec v2 and wrapper files from a Supabase repo", async () => {
    const sourceRoot = await makeSupabaseFixture();
    const result = await importSupabaseProject({
      sourceRoot,
      projectRef: "abcd1234",
      frontend: "vite-react",
    });

    expect(result.spec.version).toBe(2);
    expect(result.spec.app.frontend).toBe("vite-react");
    expect(result.spec.import?.source).toBe("supabase");
    expect(result.entities.map((entity) => entity.id)).toEqual(["profiles", "projects", "memberships"]);
    expect(result.functions.map((fn) => fn.name)).toEqual(["hello", "nightly_sync", "preview_worker"]);
    expect(result.spec.modules.customApis?.map((api) => api.id)).toEqual(["hello", "nightly_sync", "core"]);
    expect(result.spec.modules.workers?.map((worker) => worker.id)).toEqual(["preview_worker", "realtime-events"]);
    expect(result.spec.generation?.scaffoldCustomApis).toBe(false);
    expect(result.spec.generation?.scaffoldCustomApiIds).toEqual(["core"]);
    expect(result.spec.generation?.scaffoldWorkers).toBe(false);
    expect(result.spec.generation?.scaffoldWorkerIds).toEqual(["realtime-events"]);
    expect(result.spec.generation?.realtimeChannels).toEqual([
      expect.objectContaining({
        id: "projects",
        transport: "hybrid",
        subscribeAcl: "team",
        publishAcl: "service",
        ownership: "team",
      }),
      expect.objectContaining({
        id: "src-realtime-ts",
        transport: "sse",
        subscribeAcl: "authenticated",
        publishAcl: "service",
      }),
    ]);
    expect(result.spec.generation?.modulePlans).toEqual([
      expect.objectContaining({
        moduleType: "custom-api",
        moduleId: "core",
        template: "supabase-core-api",
      }),
      expect.objectContaining({
        moduleType: "worker",
        moduleId: "realtime-events",
        template: "supabase-realtime-worker",
      }),
    ]);
    expect(result.warnings.some((warning) => warning.includes("nightly_sync"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('custom API module "core"'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('worker module "realtime-events"'))).toBe(true);
    expect(result.report.env.variables.map((variable) => variable.key)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
    ]);
    expect(result.report.secrets.keys).toEqual(["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    expect(result.report.rls.enabledTables).toEqual(["memberships", "profiles", "projects"]);
    expect(result.report.rls.policies).toHaveLength(3);
    expect(result.report.rls.tableStrategies).toEqual([
      expect.objectContaining({
        table: "memberships",
        recommendedTarget: "custom-api-authz",
        recommendedOwnership: "team",
        generatedCrudReadiness: "avoid",
      }),
      expect.objectContaining({
        table: "profiles",
        recommendedTarget: "directus-filter-permissions",
        recommendedOwnership: "user",
        generatedCrudReadiness: "review",
      }),
      expect.objectContaining({
        table: "projects",
        recommendedTarget: "directus-role-permissions",
        recommendedOwnership: "global",
        generatedCrudReadiness: "safe",
      }),
    ]);
    expect(result.report.realtime.publicationTables).toEqual(["projects"]);
    expect(result.report.realtime.codeReferences.some((reference) => reference.pattern === "postgres_changes")).toBe(true);
    expect(result.report.realtime.strategies).toEqual([
      expect.objectContaining({
        scope: "projects",
        recommendedTarget: "worker-event-pipeline",
        usage: "event-fanout",
      }),
      expect.objectContaining({
        scope: "src-realtime.ts",
        recommendedTarget: "custom-api-sse",
        usage: "table-subscription",
      }),
    ]);
    expect(result.report.unresolved.some((entry) => entry.includes("RLS"))).toBe(true);
    expect(result.reportPath).toContain("ploybundle.import-report.json");

    const yaml = await readFile(result.outputPath, "utf8");
    expect(yaml).toContain("source: supabase");
    expect(yaml).toContain("frontend: vite-react");
    expect(yaml).toContain("realtimeChannels:");
    const reportJson = await readFile(result.reportPath, "utf8");
    expect(reportJson).toContain('"enabledTables": [');
    expect(reportJson).toContain('"tableStrategies": [');
    expect(reportJson).toContain('"publicationTables": [');
    expect(reportJson).toContain('"strategies": [');

    const helloDockerfile = await readFile(path.join(sourceRoot, "supabase", "functions", "hello", "Dockerfile"), "utf8");
    expect(helloDockerfile).toContain("denoland/deno");
    const helloDenoJson = await readFile(path.join(sourceRoot, "supabase", "functions", "hello", "deno.json"), "utf8");
    expect(helloDenoJson).toContain("index.ts");
  });
});
