import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";

export async function GET() {
  const board = await loadBoard();
  const exposed = process.env.HUB_SHOW_ENV_KEY_NAMES === "1";
  const envKeyNames = exposed
    ? Object.keys(process.env)
        .filter((k) => /^[A-Z_][A-Z0-9_]*$/.test(k))
        .sort()
    : [];
  return NextResponse.json({
    board,
    envKeyNames,
    envKeysExposed: exposed,
    hubSecretsPolicy: {
      actionTokenConfigured: Boolean(process.env.HUB_ACTION_TOKEN),
      sessionSecretConfigured: Boolean(process.env.HUB_SESSION_SECRET),
      readOnly: process.env.HUB_READ_ONLY === "1",
      allowUnauthenticatedActions: process.env.HUB_ALLOW_UNAUTHENTICATED_ACTIONS === "1",
    },
    hint: exposed
      ? "Only key names are listed — values are never sent to the browser."
      : "Set HUB_SHOW_ENV_KEY_NAMES=1 on the hub service to list env variable names (values stay hidden).",
  });
}
