import * as fs from "fs";
import * as path from "path";
import { readConfig } from "./config.js";
import type { SetupMode } from "./env-parser.js";
import { portOverridesToDockerEnv } from "./env-writer.js";

const delay = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export const DEV_LOG_FILE = "dev-start.log";
export const WEB_LOG_FILE = "web-start.log";

function getEnvFileArgs(dockerDir: string): string[] {
  const envPath = path.join(dockerDir, ".env");
  if (fs.existsSync(envPath)) {
    return ["--env-file", ".env"];
  }
  return [];
}

export interface StartServicesOptions {
  build?: boolean;
  pull?: boolean;
}

export async function startServices(
  repoPath: string,
  setupMode: SetupMode,
  onStatus?: (status: string) => void,
  portOverrides?: Record<number, number>,
  onLog?: (chunk: string) => void,
  options?: StartServicesOptions,
): Promise<void> {
  if (setupMode === "selfhost") {
    const isBuild = options?.build ?? false;
    const isPull = options?.pull ?? false;

    if (isBuild) {
      onStatus?.("Building and starting all services in Docker...");
    } else {
      onStatus?.("Starting all services in Docker (selfhost mode)...");
    }

    const dockerComposePath = path.join(repoPath, "infra/docker");
    const envArgs = getEnvFileArgs(dockerComposePath);
    const dockerEnv =
      portOverrides && Object.keys(portOverrides).length > 0
        ? portOverridesToDockerEnv(portOverrides)
        : undefined;

    const upArgs = [
      "compose",
      "-f",
      "docker-compose.selfhost.yml",
      ...envArgs,
      "up",
      "-d",
      "--remove-orphans",
    ];

    if (isBuild) upArgs.push("--build");
    if (isPull) upArgs.push("--pull", "always");

    const timeoutMs = isBuild ? 15 * 60 * 1000 : 5 * 60 * 1000;

    await runCommand(
      "docker",
      upArgs,
      dockerComposePath,
      undefined,
      onLog,
      dockerEnv,
      timeoutMs,
    );
    onStatus?.("All services started in Docker!");
  } else {
    onStatus?.("Starting development servers...");
    const { spawn } = await import("child_process");
    const logPath = path.join(repoPath, DEV_LOG_FILE);
    const devLog = fs.openSync(logPath, "a");
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("mise", ["dev"], {
        cwd: repoPath,
        stdio: ["ignore", devLog, devLog],
        detached: true,
        shell: true,
      });
      child.unref();
    } finally {
      fs.closeSync(devLog);
    }
    await delay(1500);

    // Verify the spawned process is still running
    if (child.pid != null) {
      try {
        // Sending signal 0 checks if the process is alive without killing it
        process.kill(child.pid, 0);
      } catch {
        throw new Error(
          `Development servers crashed on startup. Check logs at: ${logPath}`,
        );
      }
    }

    onStatus?.(`Development servers started! Logs: ${logPath}`);
  }
}

export async function stopServices(
  repoPath: string,
  onStatus?: (status: string) => void,
  portOverrides?: Record<number, number>,
): Promise<void> {
  const dockerComposePath = path.join(repoPath, "infra/docker");
  const mode = await detectSetupMode(repoPath);

  onStatus?.("Stopping Docker services...");
  try {
    const envArgs = getEnvFileArgs(dockerComposePath);
    const composeArgs =
      mode === "selfhost"
        ? ["compose", "-f", "docker-compose.selfhost.yml", ...envArgs, "down"]
        : ["compose", ...envArgs, "down"];
    await runCommand("docker", composeArgs, dockerComposePath);
  } catch {
    // Docker compose may not be running
  }

  // In selfhost mode everything runs in Docker, no local processes to kill
  if (mode !== "selfhost") {
    onStatus?.("Stopping local processes...");
    try {
      const apiPort = portOverrides?.[8000] ?? 8000;
      const webPort = portOverrides?.[3000] ?? 3000;

      if (process.platform === "win32") {
        for (const port of [apiPort, webPort]) {
          try {
            await runCommand(
              "powershell",
              [
                "-Command",
                `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
              ],
              repoPath,
            );
          } catch {
            // Port not in use
          }
        }
      } else {
        for (const port of [apiPort, webPort]) {
          try {
            await runCommand(
              "sh",
              [
                "-c",
                `lsof -ti :${port} -sTCP:LISTEN | xargs kill 2>/dev/null || true`,
              ],
              repoPath,
            );
          } catch {
            // Port not in use
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  onStatus?.("All services stopped.");
}

export async function detectSetupMode(
  repoPath: string,
): Promise<SetupMode | null> {
  const apiEnvPath = path.join(repoPath, "apps", "api", ".env");
  if (!fs.existsSync(apiEnvPath)) return null;

  const content = fs.readFileSync(apiEnvPath, "utf-8");

  // First, check for explicit SETUP_MODE marker (most robust)
  const setupModeMatch = content.match(/^SETUP_MODE=(.+)$/m);
  if (setupModeMatch?.[1]) {
    const mode = setupModeMatch[1].trim().replace(/^["']|["']$/g, "");
    if (mode === "selfhost" || mode === "developer") {
      return mode;
    }
  }

  if (content.includes("mongodb://mongo:"))
    // Fallback: string matching for backward compatibility
    return "selfhost";
  if (content.includes("mongodb://localhost:")) return "developer";

  return "developer";
}

export async function checkUrl(url: string, retries = 30): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
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
    const mode = await detectSetupMode(repoPath);
    const fileFlag =
      mode === "selfhost" ? "-f docker-compose.selfhost.yml " : "";
    const envFlag = fs.existsSync(path.join(dockerComposePath, ".env"))
      ? "--env-file .env "
      : "";
    const composeCmd = `docker compose ${fileFlag}${envFlag}ps --format json --status running`;
    const output = execSync(composeCmd, {
      cwd: dockerComposePath,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();
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
  env?: Record<string, string>,
  timeoutMs?: number,
): Promise<void> {
  const { spawn } = await import("child_process");

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: env ? { ...process.env, ...env } : undefined,
    });

    let output = "";
    let progress = 0;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        reject(
          new Error(
            `Command timed out after ${Math.round(timeoutMs / 60000)}m. Check \`docker compose logs\` to debug.`,
          ),
        );
      }, timeoutMs);
    }

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
      progress = Math.min(progress + 5, 95);
      onProgress?.(progress);
    });

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) return;
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
      if (timer) clearTimeout(timer);
      if (timedOut) return;
      reject(err);
    });
  });
}

export function findRepoRoot(startDir?: string): string | null {
  let currentDir = startDir || process.cwd();
  while (currentDir !== path.dirname(currentDir)) {
    if (
      fs.existsSync(
        path.join(currentDir, "apps/api/app/config/settings_validator.py"),
      )
    ) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  const config = readConfig();
  if (
    config?.repoPath &&
    fs.existsSync(
      path.join(config.repoPath, "apps/api/app/config/settings_validator.py"),
    )
  ) {
    return config.repoPath;
  }

  return null;
}
