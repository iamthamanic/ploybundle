import type { PresetDefinition } from "@ploybundle/shared";

export const contentAppPreset: PresetDefinition = {
  name: "content-app",
  displayName: "Content App",
  description: "Content-heavy application with rich media management, publishing workflows, and editorial tools.",
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
    { name: "media", public: true },
    { name: "uploads", public: false },
    { name: "thumbnails", public: true },
  ],
  directusCollections: [
    {
      collection: "articles",
      fields: [
        { field: "id", type: "integer", meta: { hidden: true, readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: "title", type: "string", meta: { interface: "input", width: "full" }, schema: { is_nullable: false } },
        { field: "slug", type: "string", meta: { interface: "input" }, schema: { is_nullable: false, is_unique: true } },
        { field: "body", type: "text", meta: { interface: "input-rich-text-md" } },
        { field: "excerpt", type: "text", meta: { interface: "input-multiline" } },
        { field: "cover_image", type: "uuid", meta: { interface: "file-image" } },
        { field: "status", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Draft", value: "draft" }, { text: "In Review", value: "review" }, { text: "Published", value: "published" }, { text: "Archived", value: "archived" }] } }, schema: { default_value: "draft" } },
        { field: "publish_date", type: "timestamp", meta: { interface: "datetime" } },
        { field: "date_created", type: "timestamp", meta: { readonly: true, hidden: true, special: ["date-created"] } },
        { field: "date_updated", type: "timestamp", meta: { readonly: true, hidden: true, special: ["date-updated"] } },
      ],
    },
    {
      collection: "categories",
      fields: [
        { field: "id", type: "integer", meta: { hidden: true, readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: "name", type: "string", meta: { interface: "input" }, schema: { is_nullable: false } },
        { field: "slug", type: "string", meta: { interface: "input" }, schema: { is_nullable: false, is_unique: true } },
        { field: "description", type: "text", meta: { interface: "input-multiline" } },
        { field: "sort", type: "integer", meta: { interface: "input", hidden: true } },
      ],
    },
    {
      collection: "pages",
      fields: [
        { field: "id", type: "integer", meta: { hidden: true, readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: "title", type: "string", meta: { interface: "input" }, schema: { is_nullable: false } },
        { field: "slug", type: "string", meta: { interface: "input" }, schema: { is_nullable: false, is_unique: true } },
        { field: "body", type: "text", meta: { interface: "input-rich-text-md" } },
        { field: "status", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Draft", value: "draft" }, { text: "Published", value: "published" }] } }, schema: { default_value: "draft" } },
      ],
    },
  ],
  windmillFlows: [
    {
      name: "thumbnail_generator",
      description: "Generates thumbnails for uploaded media",
      type: "script",
      language: "typescript",
      content: `// Thumbnail Generator
// Processes uploaded images and generates thumbnails for the thumbnails bucket.

export async function main(imageId: string) {
  console.log(\`Generating thumbnails for image: \${imageId}\`);
  // Placeholder: fetch image from SeaweedFS, resize, upload thumbnails
  return { imageId, thumbnails: ["small", "medium"], timestamp: new Date().toISOString() };
}`,
    },
    {
      name: "publish_scheduler",
      description: "Publishes scheduled articles when their publish date arrives",
      type: "cron",
      schedule: "*/5 * * * *",
      language: "typescript",
      content: `// Publish Scheduler
// Checks for articles with a publish_date in the past that are still in review status.

export async function main() {
  console.log("Checking for scheduled publications...");
  // Placeholder: query articles where status='review' AND publish_date <= NOW()
  // Update status to 'published'
  return { success: true, timestamp: new Date().toISOString() };
}`,
    },
  ],
  homarrLayout: {
    title: "Content App",
    subtitle: "Content management and publishing platform powered by Ploybundle",
    links: [
      { label: "App", url: "{{urls.app}}", icon: "mdi-newspaper", description: "Content application" },
      { label: "Directus Admin", url: "{{urls.admin}}", icon: "mdi-shield-crown", description: "Content management" },
      { label: "Media", url: "{{urls.storage}}", icon: "mdi-image-multiple", description: "Media library" },
      { label: "Functions", url: "{{urls.functions}}", icon: "mdi-function", description: "Publishing workflows" },
      { label: "Deploy", url: "{{urls.deploy}}", icon: "mdi-rocket-launch", description: "Platform control plane" },
    ],
    widgets: [
      { type: "status", service: "nextjs", label: "App" },
      { type: "status", service: "directus", label: "CMS" },
      { type: "status", service: "postgres", label: "Database" },
      { type: "status", service: "redis", label: "Cache" },
      { type: "status", service: "seaweedfs", label: "Media Storage" },
      { type: "status", service: "windmill", label: "Workflows" },
    ],
    notes: [
      "Articles and pages are managed in Directus",
      "Media is stored in SeaweedFS buckets: media, uploads, thumbnails",
      "Scheduled publishing runs every 5 minutes via Windmill",
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "Content App",
    NEXT_PUBLIC_CMS_MODE: "headless",
  },
  nextjsFeatures: ["article-listing", "article-reader", "page-renderer", "search", "rss-feed"],
};
