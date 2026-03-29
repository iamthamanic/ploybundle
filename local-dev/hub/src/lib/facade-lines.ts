/** Curated facade copy per area — not live data; deep work stays in the source tools. */
export const FACADE_LINES: Record<string, string[]> = {
  overview: [],
  app: ["Local product URL vs server prod/test (set in board.json)", "Health endpoint checks", "Release notes from your pipeline (when wired)"],
  auth: ["Users, roles, invitations", "Sign-in/session policy controls", "Authentication settings in Directus"],
  database: ["Collections and schema management", "Data records and relational views", "SQL browser (Adminer) for direct queries"],
  functions: ["Workspace scripts and flows", "API-triggered backend logic", "Execution endpoints and troubleshooting"],
  storage: ["Buckets and upload targets", "Directus file library", "Raw S3 API endpoint for integrations"],
  jobs: ["Cron and schedules", "Recent runs and failures", "Operational background processing"],
  deploy: ["Current release and history", "Logs and env snapshot (in deploy UI)", "Restart / redeploy shortcuts"],
  logs: ["Tail logs from compose services (when Docker socket is mounted)", "Fallback: docker compose logs from your terminal"],
  settings: [
    "board.json is the hub’s source of truth for URLs and shortcuts",
    "Sidebar display name and repository link: edit in the nav header or PATCH /api/board (not ploybundle.yaml).",
    "Secrets stay in .env — never shown here",
  ],
};
