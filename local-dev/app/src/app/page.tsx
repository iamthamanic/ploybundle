export default function Home() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <aside
        style={{
          marginBottom: "1.75rem",
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius)",
          border: "1px solid #bae6fd",
          background: "#f0f9ff",
          color: "#0c4a6e",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ display: "block", marginBottom: "0.35rem" }}>Starter-Seite (Platzhalter)</strong>
        <span>
          Ploybundle hat diese Ansicht automatisch erzeugt, damit der App-Container eine funktionierende Route hat.
          Das ist <strong>noch keine</strong> fertige Produkt-Oberfläche — baue dein echtes Frontend z.&nbsp;B. in{" "}
          <code style={{ fontSize: "0.9em", background: "#e0f2fe", padding: "0.15rem 0.35rem", borderRadius: 4 }}>
            src/app/page.tsx
          </code>
          .
        </span>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.95rem" }}>
          <a href="http://127.0.0.1:7580" style={{ fontWeight: 600 }}>
            Zum Projekt-Hub
          </a>
          {" "}
          (Directus, Windmill, Datenbank, …)
        </p>
      </aside>

      <h1>CRUD SaaS</h1>
      <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
        Standard SaaS application with CRUD operations, user management, and background processing.
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Project: localdev</h2>
        <p>Preset: crud-saas | Runtime: local</p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Geplante Bausteine (Preset)</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
          Orientierung aus der Vorlage — noch nicht als fertige Screens umgesetzt.
        </p>
        <ul style={{ paddingLeft: "1.5rem" }}>
          <li key="dashboard">Dashboard</li>
          <li key="crud-views">Crud Views</li>
          <li key="tenant-management">Tenant Management</li>
          <li key="settings">Settings</li>
        </ul>
      </section>

      <section>
        <h2>Technik</h2>
        <ul style={{ paddingLeft: "1.5rem" }}>
          <li><a href="/api/health">Health Check API</a></li>
        </ul>
      </section>
    </main>
  );
}
