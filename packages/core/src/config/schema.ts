import { z } from "zod";
import {
  VALID_TARGETS,
  VALID_PRESETS,
  VALID_RESOURCE_PROFILES,
  VALID_PROVIDER_HINTS,
  VALID_MODES,
  DEFAULT_SSH_PORT,
  DEFAULT_RESOURCE_PROFILE,
  DEFAULT_PROVIDER_HINT,
  DEFAULT_WINDMILL_WORKSPACE,
  DEFAULT_SERVICE_TOGGLE,
  DEFAULT_MODE,
  DEFAULT_PRODUCT_FRONTEND,
} from "@ploybundle/shared";

const sshTargetSchema = z.object({
  host: z.string().min(1, "SSH host is required"),
  port: z.number().int().min(1).max(65535).default(DEFAULT_SSH_PORT),
  user: z.string().min(1, "SSH user is required").default("root"),
  privateKeyPath: z.string().optional(),
});

const sshTargetOverrideSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).optional(),
  privateKeyPath: z.string().optional(),
});

const domainConfigSchema = z.object({
  root: z.string().min(1, "Root domain is required"),
  app: z.string().optional(),
  admin: z.string().optional(),
  storage: z.string().optional(),
  storageBrowser: z.string().optional(),
  databaseBrowser: z.string().optional(),
  functions: z.string().optional(),
  deploy: z.string().optional(),
  dashboard: z.string().optional(),
  scheme: z.enum(["http", "https"]).optional(),
});

const domainOverrideSchema = z.object({
  root: z.string().min(1).optional(),
  app: z.string().optional(),
  admin: z.string().optional(),
  storage: z.string().optional(),
  storageBrowser: z.string().optional(),
  databaseBrowser: z.string().optional(),
  functions: z.string().optional(),
  deploy: z.string().optional(),
  dashboard: z.string().optional(),
  scheme: z.enum(["http", "https"]).optional(),
});

const bucketDefinitionSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Bucket names must be lowercase alphanumeric with dashes"),
  public: z.boolean().default(false),
});

const directusOptionsSchema = z.object({
  adminEmail: z.string().email("Valid admin email required"),
  collections: z.array(z.string()).optional(),
});

const directusOptionsOverrideSchema = z.object({
  adminEmail: z.string().email("Valid admin email required").optional(),
  collections: z.array(z.string()).optional(),
});

const windmillOptionsSchema = z.object({
  workspace: z.string().min(1).default(DEFAULT_WINDMILL_WORKSPACE),
  exampleFlows: z.boolean().default(true),
});

const windmillOptionsOverrideSchema = z.object({
  workspace: z.string().min(1).optional(),
  exampleFlows: z.boolean().optional(),
});

const serviceToggleSchema = z.object({
  nextjs: z.boolean().default(DEFAULT_SERVICE_TOGGLE.nextjs),
  postgres: z.boolean().default(DEFAULT_SERVICE_TOGGLE.postgres),
  redis: z.boolean().default(DEFAULT_SERVICE_TOGGLE.redis),
  directus: z.boolean().default(DEFAULT_SERVICE_TOGGLE.directus),
  seaweedfs: z.boolean().default(DEFAULT_SERVICE_TOGGLE.seaweedfs),
  windmill: z.boolean().default(DEFAULT_SERVICE_TOGGLE.windmill),
  hub: z.boolean().default(DEFAULT_SERVICE_TOGGLE.hub),
  adminer: z.boolean().default(DEFAULT_SERVICE_TOGGLE.adminer),
});

const serviceToggleOverrideSchema = z.object({
  nextjs: z.boolean().optional(),
  postgres: z.boolean().optional(),
  redis: z.boolean().optional(),
  directus: z.boolean().optional(),
  seaweedfs: z.boolean().optional(),
  windmill: z.boolean().optional(),
  hub: z.boolean().optional(),
  adminer: z.boolean().optional(),
});

const productFrontendSchema = z.enum(["nextjs", "vite-react"]);

const hubPresentationSchema = z
  .object({
    displayName: z.string().max(200).optional(),
    repositoryUrl: z.string().max(2048).optional(),
  })
  .optional();

const modeOverrideSchema = z.object({
  target: z.enum(VALID_TARGETS as unknown as [string, ...string[]]).optional(),
  domain: domainOverrideSchema.optional(),
  ssh: sshTargetOverrideSchema.optional(),
  email: z.string().email("Valid email is required").optional(),
  frontend: productFrontendSchema.optional(),
  services: serviceToggleOverrideSchema.optional(),
  buckets: z.array(bucketDefinitionSchema).optional(),
  directus: directusOptionsOverrideSchema.optional(),
  windmill: windmillOptionsOverrideSchema.optional(),
  resourceProfile: z.enum(VALID_RESOURCE_PROFILES as unknown as [string, ...string[]]).optional(),
  providerHint: z.enum(VALID_PROVIDER_HINTS as unknown as [string, ...string[]]).optional(),
});

export const projectConfigFileSchema = z.object({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .max(63, "Project name must be 63 characters or fewer")
    .regex(/^[a-z][a-z0-9-]*$/, "Project name must start with a letter and contain only lowercase letters, numbers, and dashes"),
  mode: z.enum(VALID_MODES as unknown as [string, ...string[]]).optional(),
  target: z.enum(VALID_TARGETS as unknown as [string, ...string[]]).optional(),
  preset: z.enum(VALID_PRESETS as unknown as [string, ...string[]]),
  domain: domainOverrideSchema.optional(),
  ssh: sshTargetSchema.optional(),
  projectRoot: z.string().min(1).optional(),
  email: z.string().email("Valid email is required"),
  frontend: productFrontendSchema.default(DEFAULT_PRODUCT_FRONTEND),
  services: serviceToggleSchema.default(DEFAULT_SERVICE_TOGGLE),
  buckets: z.array(bucketDefinitionSchema).default([{ name: "assets", public: false }]),
  directus: directusOptionsSchema,
  windmill: windmillOptionsSchema.default({ workspace: DEFAULT_WINDMILL_WORKSPACE, exampleFlows: true }),
  resourceProfile: z.enum(VALID_RESOURCE_PROFILES as unknown as [string, ...string[]]).default(DEFAULT_RESOURCE_PROFILE),
  providerHint: z.enum(VALID_PROVIDER_HINTS as unknown as [string, ...string[]]).default(DEFAULT_PROVIDER_HINT),
  modes: z.object({
    local: modeOverrideSchema.optional(),
    server: modeOverrideSchema.optional(),
  }).optional(),
  hubPresentation: hubPresentationSchema,
});

export const projectConfigSchema = z.object({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .max(63, "Project name must be 63 characters or fewer")
    .regex(/^[a-z][a-z0-9-]*$/, "Project name must start with a letter and contain only lowercase letters, numbers, and dashes"),
  mode: z.enum(VALID_MODES as unknown as [string, ...string[]]).default(DEFAULT_MODE),
  target: z.enum(VALID_TARGETS as unknown as [string, ...string[]]).optional(),
  preset: z.enum(VALID_PRESETS as unknown as [string, ...string[]]),
  domain: domainConfigSchema,
  ssh: sshTargetSchema,
  projectRoot: z.string().min(1, "Project root is required"),
  email: z.string().email("Valid email is required"),
  frontend: productFrontendSchema.default(DEFAULT_PRODUCT_FRONTEND),
  services: serviceToggleSchema.default(DEFAULT_SERVICE_TOGGLE),
  buckets: z.array(bucketDefinitionSchema).default([{ name: "assets", public: false }]),
  directus: directusOptionsSchema,
  windmill: windmillOptionsSchema.default({ workspace: DEFAULT_WINDMILL_WORKSPACE, exampleFlows: true }),
  resourceProfile: z.enum(VALID_RESOURCE_PROFILES as unknown as [string, ...string[]]).default(DEFAULT_RESOURCE_PROFILE),
  providerHint: z.enum(VALID_PROVIDER_HINTS as unknown as [string, ...string[]]).default(DEFAULT_PROVIDER_HINT),
  hubPresentation: hubPresentationSchema,
}).superRefine((value, ctx) => {
  if (value.mode === "server" && !value.target) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target"],
      message: "Server mode requires a target (lite or full)",
    });
  }
});

export type ProjectConfigInput = z.input<typeof projectConfigSchema>;
export type ProjectConfigParsed = z.output<typeof projectConfigSchema>;
export type ProjectConfigFileInput = z.input<typeof projectConfigFileSchema>;
export type ProjectConfigFileParsed = z.output<typeof projectConfigFileSchema>;
