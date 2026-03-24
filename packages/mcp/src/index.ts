/**
 * @ploybundle/mcp - MCP (Model Context Protocol) server for Ploybundle
 *
 * This package provides MCP tool definitions that wrap the core ploybundle library.
 * In v1, this is architecturally prepared but not fully implemented.
 *
 * Future MCP tools:
 * - project.init    - Initialize a new project
 * - project.deploy  - Deploy a project stack
 * - project.status  - Get project status
 * - project.logs    - Fetch service logs
 * - project.update  - Update a project
 * - project.destroy - Destroy a project
 * - project.doctor  - Run diagnostics
 * - project.open    - Get project URLs
 */

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "project.init",
    description: "Initialize and deploy a new ploybundle project on a remote VPS",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Project name (lowercase, alphanumeric with dashes)" },
        target: { type: "string", enum: ["lite", "full"], description: "Platform target" },
        preset: { type: "string", enum: ["learning-app", "crud-saas", "content-app", "workflow-app"] },
        host: { type: "string", description: "SSH target (e.g., root@1.2.3.4)" },
        domain: { type: "string", description: "Root domain for the project" },
        email: { type: "string", description: "Admin email address" },
      },
      required: ["projectName", "preset", "host", "domain"],
    },
  },
  {
    name: "project.deploy",
    description: "Deploy or re-deploy an existing ploybundle project",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        configPath: { type: "string", description: "Path to ploybundle.yaml" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "project.status",
    description: "Get the current status, health, and URLs of a ploybundle project",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "project.logs",
    description: "Fetch logs from a ploybundle project's services",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        service: { type: "string", description: "Filter to a specific service" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "project.update",
    description: "Update a ploybundle project stack while preserving config and secrets",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "project.destroy",
    description: "Destroy a ploybundle project stack",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        confirm: { type: "boolean", description: "Must be true to proceed" },
      },
      required: ["projectName", "confirm"],
    },
  },
  {
    name: "project.doctor",
    description: "Run diagnostics on a ploybundle project",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "project.open",
    description: "Get URLs for a ploybundle project's services",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        service: { type: "string", description: "Specific service to get URL for" },
      },
      required: ["projectName"],
    },
  },
];
