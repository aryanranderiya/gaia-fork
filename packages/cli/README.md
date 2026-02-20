# @heygaia/cli

CLI tool for setting up and managing [GAIA](https://heygaia.io) — your proactive personal AI assistant.

The CLI provides an interactive terminal UI that guides you through cloning, configuring, and running a self-hosted GAIA instance.

## Requirements

- **Node.js 18+** (for npm/npx) or **Bun** (alternative)
- **macOS or Linux** (Windows via WSL2)
- **Docker** installed and running
- **Git** installed

The CLI checks prerequisites at startup and tells you what's missing.

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://heygaia.io/install.sh | sh
```

This automatically detects your system and installs using npm or bun.

### Manual Installation

```bash
npm install -g @heygaia/cli
# or
pnpm add -g @heygaia/cli
# or
bun add -g @heygaia/cli
```

### Alternative: Run Without Installing

```bash
npx @heygaia/cli init
```

You'll need to prefix every command with `npx @heygaia/cli` instead of just `gaia`. Global installation is recommended.

## Commands

```bash
gaia init          # Full setup from scratch
gaia setup         # Configure existing repo
gaia start         # Start all services
gaia stop          # Stop all services
gaia status        # Check service health
gaia --version     # Show CLI version
gaia --help        # Show all commands
```

### `gaia init`

Interactive wizard for first-time setup. Handles everything from zero to a running GAIA instance.

**Options:**

| Flag | Description |
|------|-------------|
| `--branch <name>` | Clone a specific branch instead of the default |

**What it does:**

1. **Prerequisites check** — Verifies Git, Docker, and [Mise](https://mise.jdx.dev) are installed. Auto-installs Mise if missing.
2. **Port conflict detection** — Checks ports 3000, 5432, 6379, 8000, 8080, 27017, 5672. Suggests alternatives if any are in use.
3. **Repository clone** — Clones the GAIA repo to your chosen directory with progress tracking.
4. **Tool installation** — Installs Node.js, Python, uv, and Nx via Mise.
5. **Environment configuration** — Choose a setup mode and configure variables (see below).
6. **Project setup** — Runs `mise setup` to install all dependencies, start Docker services, and seed the database.
7. **Service startup** — Optionally starts all services immediately.

### `gaia setup`

For existing repos — skips cloning and tool installation, goes straight to environment setup. Use when you want to reconfigure environment variables, switch between self-host and developer modes, or reinstall dependencies.

```bash
cd /path/to/gaia
gaia setup
```

### `gaia start`

Starts all GAIA services. Auto-detects the setup mode from your `.env` configuration.

**Options:**

| Flag | Description |
|------|-------------|
| `--build` | Rebuild Docker images before starting |
| `--pull` | Pull latest base images before starting |

**What it does:**

- **Self-host mode**: Runs `docker compose --profile all up -d` (everything in Docker, runs in background)
- **Developer mode**: Runs `mise dev` (databases in Docker, API + web locally with hot reload). Logs are written to `dev-start.log` in the repo root:

```bash
tail -f dev-start.log
```

**Access your instance:**
- Web: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### `gaia stop`

Stops all running GAIA services gracefully — Docker containers, local processes on ports 8000 and 3000, and background workers. Your data is preserved.

### `gaia status`

Shows a live health dashboard with latency for all services.

| Service | Port | Health Check |
|---------|------|--------------|
| API | 8000 | HTTP `GET /health` |
| Web | 3000 | HTTP `GET /` |
| PostgreSQL | 5432 | TCP connection |
| Redis | 6379 | TCP connection |
| MongoDB | 27017 | TCP connection |
| RabbitMQ | 5672 | TCP connection |
| ChromaDB | 8080 | TCP connection |

Press `r` to refresh. Status indicators: ✓ (healthy), ✗ (down), - (checking).

## Setup Modes

During `gaia init` or `gaia setup`, you choose a mode:

- **Self-Host (Docker)** — Everything runs in Docker containers. Best for deployment and non-developers.
- **Developer (Local)** — Databases in Docker, API + web run locally with hot reload. Best for contributing.

### Port Overrides

When the CLI detects port conflicts, it automatically selects alternative ports and writes them to `infra/docker/.env`. These persist across `gaia start` / `gaia stop` cycles. To change port assignments after setup, edit `infra/docker/.env` directly:

| Variable | Service |
|----------|---------|
| `API_HOST_PORT` | FastAPI backend |
| `WEB_HOST_PORT` | Next.js web app |
| `POSTGRES_HOST_PORT` | PostgreSQL |
| `REDIS_HOST_PORT` | Redis |
| `MONGO_HOST_PORT` | MongoDB |
| `RABBITMQ_HOST_PORT` | RabbitMQ |
| `CHROMA_HOST_PORT` | ChromaDB |

After editing, run `gaia stop` and `gaia start` to apply changes.

## Environment Variable Configuration

Two methods are available:

- **Manual** — Interactive prompts for each variable with descriptions, documentation links, and defaults.
- **Infisical** — Enter your Infisical credentials for centralized secret management.

### Auto-Discovery

The CLI discovers environment variables from the codebase at runtime:

- **API variables** — Extracted from `apps/api/app/config/settings.py` and `settings_validator.py` via Python AST parsing
- **Web variables** — Parsed from `apps/web/.env`

When a developer adds a new variable to either location, the CLI picks it up automatically — no CLI updates needed.

## Upgrading

### Updating GAIA

```bash
cd /path/to/gaia
git pull
gaia setup  # if dependencies changed
```

### Updating the CLI

```bash
npm install -g @heygaia/cli
# or
pnpm add -g @heygaia/cli
# or
bun add -g @heygaia/cli
```

## Uninstalling

1. Stop all running services: `gaia stop`
2. Remove the repo: `rm -rf /path/to/gaia`
3. Remove CLI metadata: `rm -rf ~/.gaia`
4. Uninstall the CLI:

```bash
npm uninstall -g @heygaia/cli
# or
pnpm remove -g @heygaia/cli
# or
bun remove -g @heygaia/cli
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `command not found: gaia` | Ensure the global bin directory is in PATH. For npm: `export PATH="$(npm config get prefix)/bin:$PATH"`. For bun: `export PATH="$HOME/.bun/bin:$PATH"` |
| Raw mode not supported | The CLI requires an interactive terminal — don't run in background or pipe |
| Port conflicts not detected | Ensure `lsof` is available (macOS/Linux). Windows requires WSL2 |
| Env vars not discovered | Check that `settings_validator.py` and `apps/web/.env` exist in the repo |
| `Python 3 not found` | The CLI requires Python 3 to parse API environment variables. Install it or run `mise install python` |
| Docker prerequisite fails | Ensure Docker Desktop/Engine is running, not just installed |

## Development

```bash
# Dev mode (watch, no build needed)
GAIA_CLI_DEV=true pnpm tsx packages/cli/src/index.ts <command>

# Build
cd packages/cli && pnpm run build

# Test the built CLI
./packages/cli/dist/index.js --help

# Run the test script
./packages/cli/test-cli.sh
```

### Install Script

Source of truth: `packages/cli/install.sh`. The web app serves it at `https://heygaia.io/install.sh` by fetching directly from GitHub — no manual sync needed.

### Publishing

1. Update version in `package.json`
2. Build: `pnpm run build`
3. Commit and tag: `git tag cli-v<version>`
4. Push tag — GitHub Actions publishes to npm

## License

MIT
