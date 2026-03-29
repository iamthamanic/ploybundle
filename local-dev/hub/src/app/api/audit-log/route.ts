import { Client } from "pg";
import { NextResponse } from "next/server";
import { assertHubActionAllowed } from "@/lib/hub-action-auth";

export async function GET(req: Request) {
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;
  const db = process.env.DATABASE_URL;
  if (!db) {
    return NextResponse.json({ rows: [], hint: "DATABASE_URL not set on hub" });
  }
  const client = new Client({ connectionString: db });
  try {
    await client.connect();
    const res = await client.query(
      `select id, created_at, action, detail, ip from ploybundle_hub_audit order by id desc limit 100`
    );
    return NextResponse.json({ rows: res.rows });
  } catch {
    return NextResponse.json({ rows: [], hint: "no audit table yet — run a POST action once to create it" });
  } finally {
    await client.end().catch(() => undefined);
  }
}
