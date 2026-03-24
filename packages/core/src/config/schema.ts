import { z } from "zod";
import {
  VALID_TARGETS,
  VALID_PRESETS,
  VALID_RESOURCE_PROFILES,
  VALID_PROVIDER_HINTS,
  DEFAULT_SSH_PORT,
  DEFAULT_RESOURCE_PROFILE,
  DEFAULT_PROVIDER_HINT,
  DEFAULT_WINDMILL_WORKSPACE,
  DEFAULT_SERVICE_TOGGLE,
} from "@ploybundle/shared";

const sshTargetSchema = z.object({
  host: z.string().min(1, "SSH host is required"),
  port: z.number().int().min(1).max(65535).default(DEFAULT_SSH_PORT),
  user: z.string().min(1, "SSH user is required").default("root"),
  privateKeyPath: z.string().optional(),
});

const domainConfigSchema = z.object({
  root: z.string().min(1, "Root domain is required"),
  app: z.string().optional(),
  admin: z.string().optional(),
  storage: z.string().optional(),
  functions: z.string().optional(),
  deploy: z.string().optional(),
  dashboard: z.string().optional(),
});

const bucketDefinitionSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Bucket names must be lowercase alphanumeric with dashes"),
  public: z.boolean().default(false),
});

const directusOptionsSchema = z.object({
  adminEmail: z.string().email("Valid admin email required"),
  collections: z.array(z.string()).optional(),
});

const windmillOptionsSchema = z.object({
  workspace: z.string().min(1).default(DEFAULT_WINDMILL_WORKSPACE),
  exampleFlows: z.boolean().default(true),
});

const serviceToggleSchema = z.object({
  nextjs: z.boolean().default(DEFAULT_SERVICE_TOGGLE.nextjs),
  postgres: z.boolean().default(DEFAULT_SERVICE_TOGGLE.postgres),
  redis: z.boolean().default(DEFAULT_SERVICE_TOGGLE.redis),
  directus: z.boolean().default(DEFAULT_SERVICE_TOGGLE.directus),
  seaweedfs: z.boolean().default(DEFAULT_SERVICE_TOGGLE.seaweedfs),
  windmill: z.boolean().default(DEFAULT_SERVICE_TOGGLE.windmill),
  homepage: z.boolean().default(DEFAULT_SERVICE_TOGGLE.homepage),
});

export const projectConfigSchema = z.object({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .max(63, "Project name must be 63 characters or fewer")
    .regex(/^[a-z][a-z0-9-]*$/, "Project name must start with a letter and contain only lowercase letters, numbers, and dashes"),
  target: z.enum(VALID_TARGETS as unknown as [string, ...string[]]).default("lite"),
  preset: z.enum(VALID_PRESETS as unknown as [string, ...string[]]),
  domain: domainConfigSchema,
  ssh: sshTargetSchema,
  email: z.string().email("Valid email is required"),
  services: serviceToggleSchema.default(DEFAULT_SERVICE_TOGGLE),
  buckets: z.array(bucketDefinitionSchema).default([{ name: "assets", public: false }]),
  directus: directusOptionsSchema,
  windmill: windmillOptionsSchema.default({ workspace: DEFAULT_WINDMILL_WORKSPACE, exampleFlows: true }),
  resourceProfile: z.enum(VALID_RESOURCE_PROFILES as unknown as [string, ...string[]]).default(DEFAULT_RESOURCE_PROFILE),
  providerHint: z.enum(VALID_PROVIDER_HINTS as unknown as [string, ...string[]]).default(DEFAULT_PROVIDER_HINT),
});

export type ProjectConfigInput = z.input<typeof projectConfigSchema>;
export type ProjectConfigParsed = z.output<typeof projectConfigSchema>;
