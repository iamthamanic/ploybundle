import { stringify as toYaml } from "yaml";
import type { ProjectConfig, ProjectUrls, HomepageLayoutConfig } from "@ploybundle/shared";
import { buildProjectUrls } from "@ploybundle/shared";

interface HomepageServices {
  [group: string]: Array<{
    name: string;
    href: string;
    description?: string;
    icon?: string;
    server?: string;
    widget?: {
      type: string;
      url?: string;
      [key: string]: unknown;
    };
  }>;
}

export function renderHomepageConfig(config: ProjectConfig, layout: HomepageLayoutConfig): string {
  const urls = buildProjectUrls(config.domain);

  const resolvedLinks = layout.links.map((link) => ({
    ...link,
    url: resolveTemplateUrl(link.url, urls),
  }));

  // Build Homepage services.yaml format
  const services: HomepageServices = {
    "Quick Links": resolvedLinks.map((link) => ({
      name: link.label,
      href: link.url,
      description: link.description ?? "",
      icon: link.icon ?? "mdi-link",
    })),
  };

  return toYaml({ services }, { lineWidth: 120 });
}

export function renderHomepageSettingsYaml(config: ProjectConfig, layout: HomepageLayoutConfig): string {
  const settings = {
    title: `${layout.title} - ${config.projectName}`,
    favicon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg/ploybundle.svg",
    headerStyle: "clean",
    layout: {
      "Quick Links": { style: "row", columns: 3 },
      "Service Status": { style: "row", columns: 3 },
    },
  };

  return toYaml(settings, { lineWidth: 120 });
}

export function renderHomepageWidgetsYaml(_config: ProjectConfig, layout: HomepageLayoutConfig): string {
  const infoWidget = {
    resources: {
      label: "System",
      cpu: true,
      memory: true,
      disk: "/",
    },
  };

  const projectInfo = {
    greeting: {
      text_size: "xl",
      text: `${layout.subtitle}`,
    },
  };

  return toYaml([projectInfo, infoWidget], { lineWidth: 120 });
}

export function renderFullHomepageBundle(config: ProjectConfig, layout: HomepageLayoutConfig): Record<string, string> {
  const urls = buildProjectUrls(config.domain);

  const resolvedLinks = layout.links.map((link) => ({
    ...link,
    url: resolveTemplateUrl(link.url, urls),
  }));

  // services.yaml
  const services = [
    {
      "Quick Links": resolvedLinks.map((link) => ({
        [link.label]: {
          href: link.url,
          description: link.description ?? "",
          icon: link.icon ?? "mdi-link",
        },
      })),
    },
  ];

  // settings.yaml
  const settings = {
    title: `${layout.title} - ${config.projectName}`,
    headerStyle: "clean",
    layout: {
      "Quick Links": { style: "row", columns: 3 },
    },
  };

  // widgets.yaml
  const widgets = [
    {
      greeting: {
        text_size: "xl",
        text: layout.subtitle,
      },
    },
    {
      resources: {
        label: "System",
        cpu: true,
        memory: true,
        disk: "/",
      },
    },
  ];

  // bookmarks.yaml
  const bookmarks = [
    {
      "Project Info": [
        { Project: [{ abbr: config.projectName.slice(0, 2).toUpperCase(), href: urls.app }] },
        { Mode: [{ abbr: config.target.toUpperCase(), href: urls.deploy }] },
        { Preset: [{ abbr: config.preset.slice(0, 2).toUpperCase(), href: urls.admin }] },
      ],
    },
  ];

  // docker.yaml (empty - we don't expose docker socket to homepage)
  const docker = {};

  return {
    "services.yaml": toYaml(services, { lineWidth: 120 }),
    "settings.yaml": toYaml(settings, { lineWidth: 120 }),
    "widgets.yaml": toYaml(widgets, { lineWidth: 120 }),
    "bookmarks.yaml": toYaml(bookmarks, { lineWidth: 120 }),
    "docker.yaml": toYaml(docker),
  };
}

function resolveTemplateUrl(template: string, urls: ProjectUrls): string {
  return template
    .replace("{{urls.app}}", urls.app)
    .replace("{{urls.admin}}", urls.admin)
    .replace("{{urls.storage}}", urls.storage)
    .replace("{{urls.functions}}", urls.functions)
    .replace("{{urls.deploy}}", urls.deploy)
    .replace("{{urls.dashboard}}", urls.dashboard);
}
