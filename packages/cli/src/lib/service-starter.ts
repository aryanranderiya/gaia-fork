import * as fs from "fs";
import * as path from "path";
import type { SetupMode } from "./env-parser.js";

const delay = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export const DEV_LOG_FILE = "dev-start.log";
export const WEB_LOG_FILE = "web-start.log";

export async function startServices(
  repoPath: string,
  setupMode: SetupMode,
  onStatus?: (status: string) => void,
): Promise<void> {
  if (setupMode === "selfhost") {
    onStatus?.("Starting backend stack (Docker)...");
    await runCommand(
      "docker",
      ["compose", "--profile", "all", "up", "-d", "--remove-orphans"],
      path.join(repoPath, "infra/docker"),
    );

    onStatus?.("Building web frontend...");
    await runCommand("nx", ["build", "web"], repoPath);

    onStatus?.("Starting web frontend...");
    const { spawn } = await import("child_process");
    const webLog = fs.openSync(path.join(repoPath, WEB_LOG_FILE), "a");
    spawn("nx", ["next:start", "web"], {
      cwd: repoPath,
      stdio: ["ignore", webLog, webLog],
      detached: true,
      shell: true,
    }).unref();

    onStatus?.("All services started!");
  } else {
    onStatus?.("Starting development servers...");
    const { spawn } = await import("child_process");
    const devLog = fs.openSync(path.join(repoPath, DEV_LOG_FILE), "a");
    spawn("mise", ["dev"], {
      cwd: repoPath,
      stdio: ["ignore", devLog, devLog],
      detached: true,
      shell: true,
    }).unref();
    await delay(1500);
    onStatus?.("Development servers started!");
  }
}

export async function stopServices(
  repoPath: string,
  onStatus?: (status: string) => void,
): Promise<void> {
  const dockerComposePath = path.join(repoPath, "infra/docker");

  onStatus?.("Stopping Docker services...");
  try {
    await runCommand("docker", ["compose", "down"], dockerComposePath);
  } catch {
    // Docker compose may not be running
  }

  onStatus?.("Stopping local processes...");
  try {
    // Kill processes on all GAIA service ports
    // API (8000), Web (3000), Redis (6379), PostgreSQL (5432),
    // MongoDB (27017), RabbitMQ (5672), ChromaDB (8080)
    for (const port of [8000, 3000, 6379, 5432, 27017, 5672, 8080]) {
      try {
        await runCommand("lsof", ["-ti", `:${port}`], repoPath);
        await runCommand(
          "sh",
          ["-c", `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`],
          repoPath,
        );
      } catch {
        // Port not in use
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  onStatus?.("All services stopped.");
}

export async function detectSetupMode(
  repoPath: string,
): Promise<SetupMode | null> {
  const apiEnvPath = path.join(repoPath, "apps", "api", ".env");
  if (!fs.existsSync(apiEnvPath)) return null;

  const content = fs.readFileSync(apiEnvPath, "utf-8");
  // Selfhost uses Docker container hostnames, developer uses localhost
  if (content.includes("mongodb://mongo:")) return "selfhost";
  if (content.includes("mongodb://localhost:")) return "developer";
  return "developer";
}

export async function checkUrl(url: string, retries = 30): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await delay(1000);
  }
  return false;
}

export async function areServicesRunning(repoPath: string): Promise<boolean> {
  const dockerComposePath = path.join(repoPath, "infra/docker");
  try {
    const { execSync } = await import("child_process");
    const output = execSync(
      "docker compose ps --format json --status running",
      { cwd: dockerComposePath, stdio: ["pipe", "pipe", "pipe"] },
    ).toString();
    const lines = output.trim().split("\n").filter(Boolean);
    return lines.length >= 3;
  } catch {
    return false;
  }
}

export async function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  onProgress?: (progress: number) => void,
  onLog?: (chunk: string) => void,
): Promise<void> {
  const { spawn } = await import("child_process");

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
      shell: true,
    });

    let output = "";
    let progress = 0;

    proc.stdout?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      onLog?.(chunk);
      progress = Math.min(progress + 5, 95);
      onProgress?.(progress);
    });

    proc.stderr?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      onLog?.(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        reject(
          new Error(`Command failed with code ${code}: ${output.slice(-500)}`),
        );
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

export function findRepoRoot(startDir?: string): string | null {
  let currentDir = startDir || process.cwd();
  while (currentDir !== "/") {
    if (
      fs.existsSync(
        path.join(currentDir, "apps/api/app/config/settings_validator.py"),
      )
    ) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}
