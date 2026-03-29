#!/usr/bin/env node
/**
 * End-user–style demo: same artifacts + ploybundle.yaml as after `init` render, locally via Docker.
 * Run from repo root: pnpm run demo:user
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localDev = join(root, "local-dev");

function main() {
  execSync("node scripts/materialize-local-stack.mjs", { cwd: root, stdio: "inherit" });
  execSync("pnpm turbo run build --filter=@ploybundle/cli", { cwd: root, stdio: "inherit" });

  const cliBin = join(root, "packages/cli/dist/bin.js");
  if (!existsSync(cliBin)) {
    console.error("Expected CLI at packages/cli/dist/bin.js — build failed.");
    process.exit(1);
  }
  if (!existsSync(join(localDev, "ploybundle.yaml"))) {
    console.error("Expected local-dev/ploybundle.yaml after materialize.");
    process.exit(1);
  }

  const openHint = `node "${cliBin}" open localdev`;
  const openAdmin = `node "${cliBin}" open localdev --service admin`;

  console.log(`
══════════════════════════════════════════════════════════════════════════
 Ploybundle — Demo wie ein Nutzerprojekt (lokal)
══════════════════════════════════════════════════════════════════════════

 Was ein echter Nutzer auf dem VPS macht
 ─────────────────────────────────────────
  ploybundle init <name> \\
    --host root@DEINE_IP \\
    --preset crud-saas \\
    --domain <deine-domain.de>

  Ablauf im Orchestrator: Validierung → SSH → Host/Docker → Plattform (CapRover/Coolify)
  → Bundle rendern → Deploy → Seeds → Verify.

  Referenz-Config (gleiche Felder wie bei dir): fixtures/local-demo/ploybundle.yaml


 Was du lokal siehst (Parität mit „generiertem Bundle“)
 ───────────────────────────────────────────────────────
  • Materialize schreibt local-dev/ wie nach Render: compose, .env, App, Hub, Skripte.
  • local-dev/ploybundle.yaml = dieselbe Form wie Nutzer-ploybundle.yaml (localhost-Hosts).

  Stack starten (Docker ist Pfad — nicht einzelne Services von Hand):
    pnpm run docker:up
    (entspricht: Materialize + docker compose up -d --build im Ordner local-dev/)

  Bei DB/Passwort-Problemen (frischer Start):
    cd local-dev && docker compose down -v && docker compose up -d --build


 URLs (Browser)
 ──────────────
  Hub (Einstieg)     http://localhost:7580
  Overview API       http://localhost:7580/api/overview
  Next.js App        http://localhost:3001
  Directus Admin     http://localhost:8055
  Windmill           http://localhost:8000
  SeaweedFS S3 API   http://localhost:8333   UI http://localhost:9333
  Adminer            http://localhost:8088

  Zugangsdaten: local-dev/.env — Directus: DIRECTUS_ADMIN_* / ADMIN_* · Adminer: POSTGRES_USER (= Projektname), POSTGRES_PASSWORD, POSTGRES_DB · Windmill: erstes Konto in der UI anlegen; WINDMILL_SECRET ist für API/Bootstrap


 CLI wie beim Nutzer (URLs aus ploybundle.yaml; Arbeitsverzeichnis local-dev/)
 ─────────────────────────────────────────────────────────────────────────────
  cd local-dev
  node "${cliBin}" deploy localdev --mode local
  node "${cliBin}" status localdev --mode local
  ${openHint}
  ${openAdmin}
  ${openHint.replace("open localdev", "open localdev --service app")}
  ${openHint.replace("open localdev", "open localdev --service functions")}


 Checkliste „sieht gut aus“
 ─────────────────────────
  [ ] Hub lädt, Integrationen / Links sind sinnvoll
  [ ] GET /api/overview liefert JSON (nach Start der Dienste)
  [ ] Directus: Collections tenants + records, Demo-Zeilen (Bootstrap)
  [ ] Windmill: Workspace/Scripts je nach Bootstrap
  [ ] Seaweed: Buckets vorhanden (Bootstrap)


 Was noch fehlt / UX-Lücken (für „einwandfrei“)
 ───────────────────────────────────────────────
  • Geführtes Onboarding im Hub (erste Schritte, Preset-Hinweise) ist noch Ausbau.
  • Einheitliche Fehlermeldungen wenn ein Dienst noch nicht bereit ist (Overview/Hub).
  • Preset-Doku und „was als Nächstes tun“ direkt im Produkt, nicht nur im Repo.
  • Optional: globales npm-Paket ploybundle + installierbare CLI für Nicht-Repo-Nutzer.


 Nächster Schritt: Docker starten, dann Hub öffnen.
══════════════════════════════════════════════════════════════════════════
`);
}

main();
