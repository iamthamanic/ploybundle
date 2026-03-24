# CLI Reference

## Global Options

| Flag         | Description                  |
|-------------|------------------------------|
| `--json`    | Output in JSON format        |
| `--quiet`   | Suppress non-essential output|
| `--no-color`| Disable colored output       |
| `--verbose` | Enable verbose output        |
| `--version` | Show version                 |
| `--help`    | Show help                    |

## Commands

### `ploybundle init <project-name>`

Bootstrap and deploy a new project on a remote VPS.

```bash
ploybundle init questolin \
  --target lite \
  --host root@1.2.3.4 \
  --preset learning-app \
  --domain questolin.example.com \
  --email admin@questolin.example.com
```

| Flag               | Required | Default   | Description                          |
|-------------------|----------|-----------|--------------------------------------|
| `--host`          | Yes      | —         | SSH target (e.g., `root@1.2.3.4`)   |
| `--preset`        | Yes      | —         | Preset name                          |
| `--domain`        | Yes      | —         | Root domain                          |
| `--target`        | No       | `lite`    | Platform target: `lite` or `full`    |
| `--email`         | No       | auto      | Admin email (defaults to `admin@domain`) |
| `--resource-profile` | No    | `small`   | Resource limits: `small`, `medium`, `large` |
| `--provider-hint` | No       | `generic` | VPS provider: `hetzner`, `hostinger`, `generic` |

The init command runs a full pipeline: validate, connect, inspect host, install platform, render artifacts, deploy stack, seed services, verify health.

### `ploybundle deploy <project-name>`

Deploy or re-deploy the current project stack. Requires a `ploybundle.yaml` config file.

```bash
ploybundle deploy questolin
ploybundle deploy questolin --config ./my-config.yaml
```

### `ploybundle status <project-name>`

Show project status including service health and URLs.

```bash
ploybundle status questolin
ploybundle status questolin --json
```

### `ploybundle logs <project-name>`

Show logs for the entire stack or a specific service.

```bash
ploybundle logs questolin
ploybundle logs questolin --service directus
ploybundle logs questolin --service postgres
```

Available services: `nextjs`, `postgres`, `redis`, `directus`, `seaweedfs`, `windmill`, `homepage`.

### `ploybundle update <project-name>`

Update the project stack. Preserves existing secrets and config. Minimizes destructive changes.

```bash
ploybundle update questolin
```

### `ploybundle destroy <project-name>`

Destroy the project stack. Requires explicit confirmation.

```bash
ploybundle destroy questolin           # interactive confirmation
ploybundle destroy questolin --yes     # non-interactive
```

This removes all containers and volumes. Data is permanently deleted.

### `ploybundle doctor <project-name>`

Run comprehensive diagnostics.

```bash
ploybundle doctor questolin
```

Checks: SSH connectivity, host requirements (Ubuntu 24.04, Docker, disk, RAM), platform health, service health, port conflicts, config integrity.

### `ploybundle open <project-name>`

Open the project dashboard or a specific service URL in the browser.

```bash
ploybundle open questolin                      # opens dashboard
ploybundle open questolin --service admin       # opens Directus
ploybundle open questolin --service functions   # opens Windmill
```

## Output Modes

### Human (default)
Colored, formatted output with spinners and status indicators.

### JSON (`--json`)
Machine-readable JSON output for automation and scripting.

### Quiet (`--quiet`)
Minimal output, errors only.

## Exit Codes

| Code | Meaning                |
|------|------------------------|
| 0    | Success                |
| 1    | Error (see output)     |
