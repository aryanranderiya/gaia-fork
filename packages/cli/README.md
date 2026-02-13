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

**Global installation is required** to use the `gaia` command. Choose your preferred method:

### Quick Install (Recommended)

Downloads and installs the CLI globally using the install script:

```bash
curl -fsSL https://heygaia.io/install.sh | sh
```

This automatically detects your system and installs using npm or bun.

### Manual Installation

#### npm

```bash
npm install -g @heygaia/cli
```

#### pnpm

```bash
pnpm add -g @heygaia/cli
```

#### bun

```bash
bun add -g @heygaia/cli
```

### Verify Installation

After installation, verify the `gaia` command is available:

```bash
gaia --version
gaia --help
```

### Alternative: Run Without Installing (Not Recommended)

You can run commands directly with `npx`, but this won't add the `gaia` command to your PATH:

```bash
npx @heygaia/cli init
```

**Note:** Using `npx` means you'll need to prefix every command with `npx @heygaia/cli` instead of just using `gaia`. We recommend installing globally for the best experience.

## What Happens When You Install

1. The `@heygaia/cli` npm package is installed globally
2. A `gaia` binary is added to your PATH (points to `dist/index.js`)
3. No background processes, daemons, or services are started — the CLI only runs when you invoke it

The CLI itself is a single bundled JavaScript file (~300KB) with no native dependencies.

## Commands

Once installed, you can use these commands from anywhere in your terminal:

### Quick Reference

```bash
gaia init          # Full setup from scratch
gaia setup         # Configure existing repo
gaia start         # Start all services
gaia stop          # Stop all services
gaia status        # Check service health
gaia --version     # Show CLI version
gaia --help        # Show all commands
```

### Command Details

| Command | Description |
|---------|-------------|
| `gaia init` | Full setup from scratch — clone repo, install tools, configure env, start services |
| `gaia setup` | Configure an existing GAIA repository (env vars, dependencies) |
| `gaia start` | Start all GAIA services (auto-detects selfhost vs developer mode) |
| `gaia stop` | Stop all running GAIA services |
| `gaia status` | Check health of all services with latency |
| `gaia --version` | Display the current CLI version |
| `gaia --help` | Show help and list all available commands |

### `gaia init`

Interactive wizard for first-time setup. This is the main entry point for new users.

**Usage:**

```bash
gaia init
```

**What it does:**

1. **Prerequisites check** — Verifies Git, Docker, and [Mise](https://mise.jdx.dev) are installed. Auto-installs Mise if missing.
2. **Port conflict detection** — Checks ports 3000, 5432, 6379, 8000, 8080, 27017, 5672. Suggests alternatives if any are in use.
3. **Repository clone** — Clones the GAIA repo to your chosen directory with progress tracking.
4. **Tool installation** — Installs Node.js, Python, uv, and Nx via Mise.
5. **Environment configuration** — Choose a setup mode and configure variables (see below).
6. **Project setup** — Runs `mise setup` to install all dependencies, start Docker services, and seed the database.
7. **Service startup** — Optionally starts all services immediately.

**First-time users:** This is the command you want! It handles everything from zero to a running GAIA instance.

### `gaia setup`

For existing repos that need configuration or reconfiguration. Skips cloning and tool installation, goes straight to environment setup.

**Usage:**

```bash
cd /path/to/gaia
gaia setup
```

**When to use:**
- You already have the GAIA repo cloned
- You want to reconfigure environment variables
- You need to switch between self-host and developer modes
- Dependencies need to be reinstalled

### `gaia start`

Starts all GAIA services. Auto-detects the setup mode from your `.env` configuration.

**Usage:**

```bash
gaia start
```

**What it does:**

- **Self-host mode**: Runs `docker compose --profile all up -d` (everything in Docker, runs in background)
- **Developer mode**: Runs `mise dev` (databases in Docker, API + web locally with hot reload)

**Access your instance:**
- Web: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### `gaia stop`

Stops all running GAIA services gracefully.

**Usage:**

```bash
gaia stop
```

**What it stops:**
- All Docker containers in the GAIA compose stack
- Local processes on ports 8000 (API) and 3000 (Web)
- Background workers and services

**Note:** Your data is preserved — stopping services doesn't delete any databases or configurations.

### `gaia status`

Shows a live health dashboard with latency for all services.

**Usage:**

```bash
gaia status
```

**Service checks:**

| Service | Port | Health Check |
|---------|------|--------------|
| API | 8000 | HTTP `GET /health` |
| Web | 3000 | HTTP `GET /` |
| PostgreSQL | 5432 | TCP connection |
| Redis | 6379 | TCP connection |
| MongoDB | 27017 | TCP connection |
| RabbitMQ | 5672 | TCP connection |
| ChromaDB | 8080 | TCP connection |

**Interactive controls:**
- Press `r` to refresh status
- Status indicators: ✓ (healthy), ✗ (down), - (checking)
- Shows response time for each service

## Setup Modes

During `gaia init` or `gaia setup`, you choose a mode:

- **Self-Host (Docker)** — Everything runs in Docker containers. Best for deployment and non-developers.
- **Developer (Local)** — Databases in Docker, API + web run locally with hot reload. Best for contributing.

## Environment Variable Configuration

Two methods are available:

- **Manual** — Interactive prompts for each variable with descriptions, documentation links, and defaults.
- **Infisical** — Enter your Infisical credentials (token, project ID, machine identity) for centralized secret management.

### Auto-Discovery

The CLI discovers environment variables from the codebase at runtime:

- **API variables** — Extracted from `apps/api/app/config/settings.py` and `settings_validator.py` via Python AST parsing
- **Web variables** — Parsed from `apps/web/.env`

When a developer adds a new variable to either location, the CLI picks it up automatically — no CLI updates needed.

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

Source of truth: `packages/cli/install.sh`. After modifying, sync to the web app:

```bash
./packages/cli/sync-install.sh
```

This copies the script to `apps/web/public/install.sh`, which is served at `https://heygaia.io/install.sh`.

### Publishing

1. Update version in `package.json`
2. Build: `pnpm run build`
3. Sync install script: `./sync-install.sh`
4. Commit and tag: `git tag cli-v<version>`
5. Push tag — GitHub Actions publishes to npm

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `command not found: gaia` | Ensure the global bin directory is in PATH. For npm: `export PATH="$(npm config get prefix)/bin:$PATH"`. For bun: `export PATH="$HOME/.bun/bin:$PATH"` |
| Raw mode not supported | The CLI requires an interactive terminal — don't run in background or pipe |
| Port conflicts not detected | Ensure `lsof` is available (macOS/Linux). Windows requires WSL2 |
| Env vars not discovered | Check that `settings_validator.py` and `apps/web/.env` exist in the repo |
| Docker prerequisite fails | Ensure Docker Desktop/Engine is running, not just installed |

## License

MIT
