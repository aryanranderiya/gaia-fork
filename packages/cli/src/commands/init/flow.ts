import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CLI_VERSION, writeConfig } from "../../lib/config.js";
import { runEnvSetup, selectSetupMode } from "../../lib/env-setup.js";
import { portOverridesToDockerEnv } from "../../lib/env-writer.js";
import * as git from "../../lib/git.js";
import { ensureGaiaInPath } from "../../lib/path-setup.js";
import * as prereqs from "../../lib/prerequisites.js";
import {
  findRepoRoot,
  runCommand,
  startServices,
} from "../../lib/service-starter.js";
import type { CLIStore } from "../../ui/store.js";

const DEV_MODE = process.env.GAIA_CLI_DEV === "true";

const delay = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function runInitFlow(
  store: CLIStore,
  branch?: string,
): Promise<void> {
  // 0. Welcome
  store.setStep("Welcome");
  store.setStatus("Waiting for user input...");
  await store.waitForInput("welcome");

  const logHandler = (chunk: string) => {
    const currentLogs = store.currentState.data.dependencyLogs || [];
    const lines = chunk
      .split("\n")
      .filter((line: string) => line.trim() !== "");
    const newLogs = [...currentLogs, ...lines].slice(-20);
    store.updateData("dependencyLogs", newLogs);
  };

  // 1. Prerequisites
  store.setStep("Prerequisites");
  store.setStatus("Checking system requirements...");

  store.updateData("checks", {
    git: "pending",
    docker: "pending",
    mise: "pending",
  });

  await delay(800);

  store.setStatus("Checking Git...");
  const gitStatus = await prereqs.checkGit();
  store.updateData("checks", {
    ...store.currentState.data.checks,
    git: gitStatus,
  });

  store.setStatus("Checking Docker...");
  const dockerInfo = await prereqs.checkDockerDetailed();
  const dockerStatus = dockerInfo.working ? "success" : "error";
  store.updateData("checks", {
    ...store.currentState.data.checks,
    docker: dockerStatus,
  });
  if (!dockerInfo.working) {
    store.updateData("dockerError", dockerInfo.errorMessage);
  }

  // Check mise but don't block on it yet (selfhost mode doesn't need it)
  store.setStatus("Checking Mise...");
  let miseStatus = await prereqs.checkMise();
  store.updateData("checks", {
    ...store.currentState.data.checks,
    mise: miseStatus,
  });

  if (miseStatus === "missing") {
    store.setStatus("Installing Mise...");
    const installed = await prereqs.installMise();
    miseStatus = installed ? "success" : "error";
    store.updateData("checks", {
      ...store.currentState.data.checks,
      mise: miseStatus,
    });
  }

  // Check for failed prerequisites before proceeding to port checks
  // Note: mise failure is deferred - only enforced for developer mode later
  const failedChecks: Array<{ name: string; message?: string }> = [];
  if (gitStatus === "error") failedChecks.push({ name: "Git" });
  if (dockerStatus === "error")
    failedChecks.push({ name: "Docker", message: dockerInfo.errorMessage });

  if (failedChecks.length > 0) {
    const errorLines: string[] = [];
    errorLines.push("Prerequisites failed:");
    for (const check of failedChecks) {
      errorLines.push(
        `  • ${check.name}: ${check.message || "Not installed or not working"}`,
      );
    }
    errorLines.push("\nInstallation guides:");
    if (gitStatus === "error")
      errorLines.push(`  • Git: ${prereqs.PREREQUISITE_URLS.git}`);
    if (dockerStatus === "error") {
      if (dockerInfo.installed) {
        errorLines.push(
          `  • Docker: Start Docker Desktop or run 'sudo systemctl start docker'`,
        );
      } else {
        errorLines.push(`  • Docker: ${prereqs.PREREQUISITE_URLS.docker}`);
      }
    }

    store.setError(new Error(errorLines.join("\n")));
    return;
  }

  // Check Ports
  store.setStatus("Checking Ports...");
  // Note: 8083 (Mongo Express) is only used in dev mode, but we check it here
  // since mode selection happens later in the flow.
  const requiredPorts = [8000, 5432, 6379, 27017, 5672, 3000, 8080, 8083];
  const portResults = await prereqs.checkPortsWithFallback(requiredPorts);
  const portOverrides: Record<number, number> = {};
  const conflicts = portResults.filter((r) => !r.available);

  if (conflicts.length > 0) {
    // Check for ports with no available alternative before presenting dialog
    const unresolvable = conflicts.filter((r) => !r.alternative);
    if (unresolvable.length > 0) {
      store.setError(
        new Error(
          `Cannot find free alternative ports for: ${unresolvable.map((r) => `${r.port} (${r.service})`).join(", ")}. Free these ports and try again.`,
        ),
      );
      return;
    }

    store.updateData("portConflicts", portResults);
    const resolution = (await store.waitForInput("port_conflicts")) as
      | "accept"
      | "abort";

    if (resolution === "abort") {
      store.setError(
        new Error(
          "Port conflicts not resolved. Please free the ports and try again.",
        ),
      );
      return;
    }

    for (const result of portResults) {
      if (!result.available && result.alternative) {
        portOverrides[result.port] = result.alternative;
      }
    }
  }

  store.updateData("portOverrides", portOverrides);
  store.setStatus("Prerequisites check complete!");
  await delay(1000);

  // 2. Setup Mode
  const setupMode = await selectSetupMode(store);

  let repoPath = "";

  if (DEV_MODE) {
    repoPath = findRepoRoot() || "";
    if (!repoPath) {
      store.setError(
        new Error(
          "DEV_MODE: Could not find workspace root. Run from within the gaia repo.",
        ),
      );
      return;
    }
    store.setStep("Repository Setup");
    store.setStatus("[DEV MODE] Using current workspace...");
    await delay(500);
    store.setStatus("Repository ready!");
  } else {
    store.setStep("Repository Setup");
    const defaultPath =
      setupMode === "selfhost"
        ? path.join(os.homedir(), "gaia")
        : path.resolve("gaia");

    let cloneFresh = true;
    repoPath = defaultPath;

    while (true) {
      repoPath = (await store.waitForInput("repo_path", {
        default: defaultPath,
      })) as string;

      // Resolve relative paths
      if (!path.isAbsolute(repoPath)) {
        repoPath = path.resolve(repoPath);
      }

      if (fs.existsSync(repoPath)) {
        const stat = fs.statSync(repoPath);
        if (!stat.isDirectory()) {
          store.setError(
            new Error(`Path ${repoPath} exists and is not a directory.`),
          );
          await delay(2000);
          store.setError(null);
          continue;
        }

        // Check if it's already a gaia repo
        const isGaiaRepo = fs.existsSync(
          path.join(repoPath, "apps/api/app/config/settings_validator.py"),
        );

        if (isGaiaRepo) {
          store.updateData("existingRepoPath", repoPath);
          const action = (await store.waitForInput("existing_repo")) as string;

          if (action === "use_existing") {
            cloneFresh = false;
            break;
          } else if (action === "delete_reclone") {
            store.setStatus("Removing existing installation...");
            fs.rmSync(repoPath, { recursive: true, force: true });
            break;
          } else if (action === "different_path") {
            continue;
          } else {
            // exit
            store.setError(new Error("Setup cancelled by user."));
            return;
          }
        }

        // Non-empty directory that isn't a gaia repo
        const files = fs.readdirSync(repoPath);
        if (files.length > 0) {
          store.setError(
            new Error(
              `Directory ${repoPath} is not empty and is not a GAIA installation. Please choose another path.`,
            ),
          );
          await delay(2000);
          store.setError(null);
          continue;
        }
      }
      break;
    }

    if (cloneFresh) {
      store.setStep("Repository Setup");
      store.setStatus("Preparing repository...");
      store.updateData("repoProgress", 0);
      store.updateData("repoPhase", "");

      try {
        await git.setupRepo(
          repoPath,
          "https://github.com/theexperiencecompany/gaia.git",
          (progress, phase) => {
            store.updateData("repoProgress", progress);
            if (phase) {
              store.updateData("repoPhase", phase);
              store.setStatus(`${phase}...`);
            } else {
              store.setStatus(
                `Cloning repository to ${repoPath}... ${progress}%`,
              );
            }
          },
          branch,
        );
        store.setStatus("Repository ready!");
      } catch (e) {
        store.setError(e as Error);
        return;
      }
    } else {
      store.setStatus("Using existing repository!");
    }
  }

  await delay(1000);

  // 3. Environment Setup (moved before tool install so we know the mode)
  await runEnvSetup(store, repoPath, setupMode, portOverrides);

  if (store.currentState.error) {
    return; // Abort if env setup failed
  }

  if (setupMode === "selfhost") {
    // Selfhost mode: everything runs in Docker, no local tools needed
    store.setStep("Installing CLI");
    store.setStatus("Installing gaia CLI globally...");
    try {
      await runCommand("npm", ["install", "-g", "@heygaia/cli"], repoPath);
      store.setStatus("Verifying PATH...");
      const pathResult = await ensureGaiaInPath();
      if (pathResult.inPath) {
        store.setStatus("CLI installed! gaia command is ready.");
      } else if (pathResult.pathAdded) {
        store.setStatus(pathResult.message);
      } else {
        store.setStatus(pathResult.message);
      }
    } catch {
      store.setStatus(
        "CLI install failed. Install manually: npm install -g @heygaia/cli",
      );
    }

    await delay(500);

    // Build and start services automatically on first init
    store.setStep("Project Setup");
    store.setStatus("Building and starting all services in Docker...");
    store.updateData(
      "dependencyPhase",
      "Building and starting Docker services...",
    );
    store.updateData("dependencyProgress", 0);
    store.updateData("dependencyLogs", []);
    store.updateData("dependencyComplete", false);

    const dockerLogHandler = (chunk: string) => {
      const lines = chunk
        .split("\n")
        .map((l: string) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
        .filter((l: string) => l.length > 0);
      if (lines.length === 0) return;
      const current: string[] = store.currentState.data.dependencyLogs || [];
      store.updateData("dependencyLogs", [...current, ...lines].slice(-50));
    };

    try {
      await startServices(
        repoPath,
        "selfhost",
        (status) => store.setStatus(status),
        portOverrides,
        dockerLogHandler,
        { build: true },
      );
    } catch (e) {
      store.setError(
        new Error(`Failed to start services: ${(e as Error).message}`),
      );
      return;
    }

    store.updateData("dependencyProgress", 100);
    store.updateData("dependencyComplete", true);

    const envMethod = (store.currentState.data.envMethod as string) || "manual";
    writeConfig({
      version: CLI_VERSION,
      setupComplete: true,
      setupMethod: envMethod as "manual" | "infisical",
      repoPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    store.updateData("setupMode", setupMode);
    store.setStep("Finished");
    store.setStatus("Setup complete! GAIA is running.");
    await store.waitForInput("exit");
    return;
  }

  // Developer mode: mise is required
  if (miseStatus === "error") {
    store.setError(
      new Error(
        `Developer mode requires Mise but it failed to install.\n  • Mise: ${prereqs.PREREQUISITE_URLS.mise}`,
      ),
    );
    return;
  }

  // 4. Install Tools (developer mode only)
  store.setStep("Install Tools");
  store.setStatus("Installing toolchain...");
  store.updateData("dependencyPhase", "Initializing mise...");
  store.updateData("dependencyProgress", 0);
  store.updateData("dependencyLogs", []);

  try {
    store.updateData("dependencyPhase", "Trusting mise configuration...");
    await runCommand("mise", ["trust"], repoPath, undefined, logHandler);
    store.updateData("dependencyProgress", 50);

    store.updateData(
      "dependencyPhase",
      "Installing tools (node, python, uv, nx)...",
    );
    await runCommand(
      "mise",
      ["install"],
      repoPath,
      (progress) => {
        store.updateData("dependencyProgress", 50 + progress * 0.5);
      },
      logHandler,
    );

    store.updateData("dependencyProgress", 100);
    store.updateData("toolComplete", true);
  } catch (e) {
    store.setError(
      new Error(`Failed to install tools: ${(e as Error).message}`),
    );
    return;
  }

  await delay(1000);

  // 5. Project Setup (developer mode only)
  store.setStep("Project Setup");
  store.updateData("dependencyPhase", "Setting up project...");
  store.updateData("dependencyProgress", 0);
  store.updateData("dependencyComplete", false);
  store.updateData("repoPath", repoPath);
  store.updateData("dependencyLogs", []);

  try {
    store.updateData("dependencyProgress", 0);
    store.updateData(
      "dependencyPhase",
      "Running mise setup (all dependencies)...",
    );

    const dockerEnv =
      Object.keys(portOverrides).length > 0
        ? portOverridesToDockerEnv(portOverrides)
        : undefined;

    await runCommand(
      "mise",
      ["setup"],
      repoPath,
      (progress) => {
        store.updateData("dependencyProgress", progress);
      },
      logHandler,
      dockerEnv,
    );

    store.updateData("dependencyProgress", 100);
    store.updateData("dependencyPhase", "Setup complete!");
    store.updateData("dependencyComplete", true);
  } catch (e) {
    store.setError(
      new Error(`Failed to setup project: ${(e as Error).message}`),
    );
    return;
  }

  await delay(1000);

  const envMethod = (store.currentState.data.envMethod as string) || "manual";
  writeConfig({
    version: "0.1.8",
    setupComplete: true,
    setupMethod: envMethod as "manual" | "infisical",
    repoPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  store.setStep("Installing CLI");
  store.setStatus("Installing gaia CLI globally...");
  try {
    await runCommand("npm", ["install", "-g", "@heygaia/cli"], repoPath);
    store.setStatus("Verifying PATH...");
    const pathResult = await ensureGaiaInPath();
    if (pathResult.inPath) {
      store.setStatus("CLI installed! gaia command is ready.");
    } else if (pathResult.pathAdded) {
      store.setStatus(pathResult.message);
    } else {
      store.setStatus(pathResult.message);
    }
  } catch {
    store.setStatus(
      "CLI install failed. Install manually: npm install -g @heygaia/cli",
    );
  }

  await delay(500);

  store.setStep("Finished");
  store.setStatus("Setup complete!");
  await store.waitForInput("exit");
}
