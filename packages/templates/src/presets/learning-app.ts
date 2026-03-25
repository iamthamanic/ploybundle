import type { PresetDefinition } from "@ploybundle/shared";

export const learningAppPreset: PresetDefinition = {
  name: "learning-app",
  displayName: "Learning App",
  description: "Gamified learning platform with missions, progress tracking, and content authoring. Modeled after the Questolin reference project.",
  services: {
    nextjs: true,
    postgres: true,
    redis: true,
    directus: true,
    seaweedfs: true,
    windmill: true,
    homarr: true,
  },
  buckets: [
    { name: "assets", public: true },
    { name: "missions", public: false },
    { name: "uploads", public: false },
  ],
  directusCollections: [
    {
      collection: "missions",
      fields: [
        { field: "id", type: "integer", meta: { hidden: true, interface: "input", readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: "title", type: "string", meta: { interface: "input", width: "full" }, schema: { is_nullable: false } },
        { field: "description", type: "text", meta: { interface: "input-rich-text-md" } },
        { field: "difficulty", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Easy", value: "easy" }, { text: "Medium", value: "medium" }, { text: "Hard", value: "hard" }] } } },
        { field: "xp_reward", type: "integer", meta: { interface: "input" }, schema: { default_value: 10 } },
        { field: "status", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Draft", value: "draft" }, { text: "Published", value: "published" }, { text: "Archived", value: "archived" }] } }, schema: { default_value: "draft" } },
        { field: "content_json", type: "json", meta: { interface: "input-code", options: { language: "json" } } },
        { field: "cover_image", type: "uuid", meta: { interface: "file-image" } },
        { field: "sort", type: "integer", meta: { interface: "input", hidden: true } },
        { field: "date_created", type: "timestamp", meta: { interface: "datetime", readonly: true, hidden: true, special: ["date-created"] } },
        { field: "date_updated", type: "timestamp", meta: { interface: "datetime", readonly: true, hidden: true, special: ["date-updated"] } },
      ],
    },
    {
      collection: "skill_trees",
      fields: [
        { field: "id", type: "integer", meta: { hidden: true, readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: "name", type: "string", meta: { interface: "input" }, schema: { is_nullable: false } },
        { field: "description", type: "text", meta: { interface: "input-multiline" } },
        { field: "icon", type: "string", meta: { interface: "input" } },
        { field: "color", type: "string", meta: { interface: "select-color" } },
        { field: "sort", type: "integer", meta: { interface: "input", hidden: true } },
      ],
    },
    {
      collection: "pattern_cards",
      fields: [
        { field: "id", type: "integer", meta: { hidden: true, readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: "title", type: "string", meta: { interface: "input" }, schema: { is_nullable: false } },
        { field: "content", type: "text", meta: { interface: "input-rich-text-md" } },
        { field: "category", type: "string", meta: { interface: "input" } },
        { field: "media", type: "uuid", meta: { interface: "file-image" } },
        { field: "sort", type: "integer", meta: { interface: "input", hidden: true } },
      ],
    },
  ],
  windmillFlows: [
    {
      name: "daily_xp_recalculation",
      description: "Recalculates XP totals and streak data for all active users daily",
      type: "cron",
      schedule: "0 3 * * *",
      language: "typescript",
      content: `// Daily XP Recalculation
// Runs at 3am UTC. Recalculates XP totals and updates streak data.

import { Client } from "pg";

export async function main() {
  const client = new Client({ connectionString: Deno.env.get("DATABASE_URL") });
  await client.connect();

  try {
    // Recalculate XP totals
    await client.queryObject(\`
      UPDATE users SET xp_total = (
        SELECT COALESCE(SUM(xp_earned), 0)
        FROM mission_completions
        WHERE mission_completions.user_id = users.id
      )
    \`);

    // Update streaks
    await client.queryObject(\`
      UPDATE users SET
        streak_days = CASE
          WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day' THEN streak_days + 1
          WHEN last_activity_date = CURRENT_DATE THEN streak_days
          ELSE 0
        END
    \`);

    return { success: true, timestamp: new Date().toISOString() };
  } finally {
    await client.end();
  }
}`,
    },
    {
      name: "review_scheduler",
      description: "Schedules spaced repetition reviews based on completion history",
      type: "cron",
      schedule: "0 4 * * *",
      language: "typescript",
      content: `// Review Scheduler
// Schedules spaced repetition reviews for completed missions.

import { Client } from "pg";

export async function main() {
  const client = new Client({ connectionString: Deno.env.get("DATABASE_URL") });
  await client.connect();

  try {
    // Find missions due for review using simple spaced repetition intervals
    const result = await client.queryObject(\`
      INSERT INTO scheduled_reviews (user_id, mission_id, review_date)
      SELECT
        mc.user_id,
        mc.mission_id,
        CURRENT_DATE + (POWER(2, mc.review_count) || ' days')::interval
      FROM mission_completions mc
      WHERE mc.next_review_date <= CURRENT_DATE
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_reviews sr
          WHERE sr.user_id = mc.user_id
            AND sr.mission_id = mc.mission_id
            AND sr.review_date = CURRENT_DATE + (POWER(2, mc.review_count) || ' days')::interval
        )
      RETURNING id
    \`);

    return { scheduled: result.rows.length, timestamp: new Date().toISOString() };
  } finally {
    await client.end();
  }
}`,
    },
    {
      name: "notification_webhook",
      description: "Webhook handler for sending notifications on mission completion",
      type: "script",
      language: "typescript",
      content: `// Notification Webhook
// Triggered when a user completes a mission. Can be extended with email/push.

export async function main(event: {
  userId: string;
  missionId: string;
  xpEarned: number;
  totalXp: number;
}) {
  console.log(\`User \${event.userId} completed mission \${event.missionId}\`);
  console.log(\`XP earned: \${event.xpEarned}, Total XP: \${event.totalXp}\`);

  // Placeholder for notification logic:
  // - Send push notification
  // - Update leaderboard cache
  // - Trigger achievement check

  return {
    notified: true,
    userId: event.userId,
    missionId: event.missionId,
    timestamp: new Date().toISOString(),
  };
}`,
    },
  ],
  homarrBoard: {
    title: "Learning App",
    subtitle: "Gamified learning platform powered by Ploybundle",
    theme: {
      primaryColor: "#7C3AED",
      secondaryColor: "#A78BFA",
      opacity: 100,
      itemRadius: "md",
      customCss: `:root { --mantine-color-body: #0f0a1e; }
.board-section-title { font-weight: 700; letter-spacing: 0.02em; }`,
    },
    sections: [
      { kind: "category", title: "Overview" },
      { kind: "category", title: "Data & Content" },
      { kind: "category", title: "Users & Auth" },
      { kind: "category", title: "Files" },
      { kind: "category", title: "Jobs & Functions" },
      { kind: "category", title: "Deploy" },
    ],
    apps: [
      { name: "Learning App", description: "Frontend application", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/nextdotjs.svg", href: "{{urls.app}}", pingUrl: "{{urls.app}}/api/health", section: "Overview" },
      { name: "Directus Admin", description: "Content & user management", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Data & Content" },
      { name: "Collections", description: "Missions, skill trees, pattern cards", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/databricks.svg", href: "{{urls.admin}}/content", section: "Data & Content" },
      { name: "Users", description: "User accounts and roles", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/auth0.svg", href: "{{urls.admin}}/users", section: "Users & Auth" },
      { name: "Roles", description: "Permission roles", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/shieldsdotio.svg", href: "{{urls.admin}}/settings/roles", section: "Users & Auth" },
      { name: "SeaweedFS", description: "Asset & mission media storage", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Files" },
      { name: "File Manager", description: "Browse uploaded files", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/files.svg", href: "{{urls.admin}}/files", section: "Files" },
      { name: "Windmill", description: "XP recalc, reviews, notifications", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Jobs & Functions" },
      { name: "Schedules", description: "Cron jobs and scheduled tasks", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/clockify.svg", href: "{{urls.functions}}/schedules", section: "Jobs & Functions" },
      { name: "Deploy Console", description: "Platform control plane", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Deploy" },
    ],
    widgets: [
      { kind: "iframe", section: "Overview", title: "Content Preview", config: { embedUrl: "{{urls.admin}}/content/missions", allowScrolling: true }, grid: { x: 0, y: 0, width: 8, height: 3 } },
      { kind: "clock", section: "Overview", config: {}, grid: { x: 8, y: 0, width: 2, height: 1 } },
      { kind: "bookmarks", section: "Overview", title: "Quick Links", config: {}, grid: { x: 8, y: 1, width: 2, height: 2 } },
      { kind: "iframe", section: "Jobs & Functions", title: "Recent Runs", config: { embedUrl: "{{urls.functions}}/runs", allowScrolling: true }, grid: { x: 0, y: 0, width: 10, height: 3 } },
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "Learning App",
    NEXT_PUBLIC_GAMIFICATION_ENABLED: "true",
    NEXT_PUBLIC_STREAK_ENABLED: "true",
  },
  nextjsFeatures: ["feed", "mission-player", "progress-tracker", "leaderboard", "profile"],
};
