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
  homarrBoard: {
    title: "Content App",
    subtitle: "Content management and publishing platform powered by Ploybundle",
    theme: {
      primaryColor: "#059669",
      secondaryColor: "#34D399",
      opacity: 100,
      itemRadius: "md",
      customCss: `:root { --mantine-color-body: #041f14; }
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
      { name: "Content App", description: "Frontend application", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/nextdotjs.svg", href: "{{urls.app}}", pingUrl: "{{urls.app}}/api/health", section: "Overview" },
      { name: "Directus CMS", description: "Content management", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Data & Content" },
      { name: "Articles", description: "Article management", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/medium.svg", href: "{{urls.admin}}/content/articles", section: "Data & Content" },
      { name: "Pages", description: "Static page management", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/notion.svg", href: "{{urls.admin}}/content/pages", section: "Data & Content" },
      { name: "Users", description: "User accounts and roles", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/auth0.svg", href: "{{urls.admin}}/users", section: "Users & Auth" },
      { name: "Media Library", description: "Images, thumbnails, uploads", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Files" },
      { name: "File Manager", description: "Browse all files", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/files.svg", href: "{{urls.admin}}/files", section: "Files" },
      { name: "Windmill", description: "Thumbnail generation, publishing", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Jobs & Functions" },
      { name: "Deploy Console", description: "Platform control plane", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Deploy" },
    ],
    widgets: [
      { kind: "iframe", section: "Overview", title: "Recent Articles", config: { embedUrl: "{{urls.admin}}/content/articles", allowScrolling: true }, grid: { x: 0, y: 0, width: 8, height: 3 } },
      { kind: "clock", section: "Overview", config: {}, grid: { x: 8, y: 0, width: 2, height: 1 } },
      { kind: "bookmarks", section: "Overview", title: "Quick Links", config: {}, grid: { x: 8, y: 1, width: 2, height: 2 } },
      { kind: "iframe", section: "Files", title: "Media Browser", config: { embedUrl: "{{urls.admin}}/files", allowScrolling: true }, grid: { x: 0, y: 0, width: 10, height: 3 } },
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "Content App",
    NEXT_PUBLIC_CMS_MODE: "headless",
  },
  nextjsFeatures: ["article-listing", "article-reader", "page-renderer", "search", "rss-feed"],
};
