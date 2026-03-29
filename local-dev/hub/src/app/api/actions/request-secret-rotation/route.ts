import { NextResponse } from "next/server";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";

export async function POST(req: Request) {
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;
  let body: { key?: string };
  try {
    body = (await req.json()) as { key?: string };
  } catch {
    body = {};
  }
  const key = typeof body.key === "string" ? body.key.trim().slice(0, 120) : "";
  await appendHubAudit(req, "request-secret-rotation", { key: key || "(unspecified)" });
  return NextResponse.json({
    ok: true,
    message:
      "Rotation is server-side only. Regenerate the secret in .env / your vault, redeploy, then update dependents. Use the Ploybundle CLI secrets workflow from your project root when available.",
  });
}
