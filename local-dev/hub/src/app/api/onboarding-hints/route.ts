import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Safe hints for the first-visit modal: no passwords in JSON (read from .env on the host). */
export async function GET() {
  const projectName = process.env.PROJECT_NAME?.trim() || "project";
  const directusEmail =
    process.env.DIRECTUS_ADMIN_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim() || "";
  const postgresUser = process.env.POSTGRES_USER?.trim() || projectName;
  const postgresDb = process.env.POSTGRES_DB?.trim() || projectName;

  return NextResponse.json({
    projectName,
    directusEmail: directusEmail.length > 0 ? directusEmail : null,
    postgresUser,
    postgresDb,
    adminerServer: "postgres",
    envFileHint: "Datei .env im selben Ordner wie docker-compose.yml (nicht committen).",
    localSecretsPathHint: ".ploybundle-state/local/secrets.json (lokal, gitignored)",
    windmill: {
      email: "admin@windmill.dev",
      passwordHint: "changeme",
      detail:
        "Im Windmill-Fenster auf Sign in klicken. WINDMILL_SECRET in .env ist für API/Bootstrap, nicht dieses UI-Passwort.",
    },
  });
}
