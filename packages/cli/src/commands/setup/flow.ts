import { runEnvSetup } from "../../lib/env-setup.js";
import * as prereqs from "../../lib/prerequisites.js";
import { findRepoRoot, runCommand } from "../../lib/service-starter.js";
import type { CLIStore } from "../../ui/store.js";

const delay = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function runSetupFlow(store: CLIStore): Promise<void> {
  // 1. Detect repo root
  store.setStep("Detect Repo");
  store.setStatus("Looking for GAIA repository...");

  const repoPath = findRepoRoot();
  if (!repoPath) {
    store.setError(
      new Error(
        "Could not find GAIA repository. Run this command from within a cloned gaia repo, or use 'gaia init' to set up from scratch.",
      ),
    );
    return;
  }

  store.updateData("repoPath", repoPath);
  store.setStatus(`Found repository at ${repoPath}`);
  await delay(1000);

  // 2. Prerequisites
  store.setStep("Prerequisites");
  store.setStatus("Checking system requirements...");

  store.updateData("checks", {
    git: "pending",
    docker: "pending",
    mise: "pending",
  });

  await delay(500);

  const gitStatus = await prereqs.checkGit();
  store.updateData("checks", {
    ...store.currentState.data.checks,
    git: gitStatus,
  });

  const dockerStatus = await prereqs.checkDocker();
  store.updateData("checks", {
    ...store.currentState.data.checks,
    docker: dockerStatus,
  });

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
  const failedChecks: string[] = [];
  if (gitStatus === "error") failedChecks.push("Git");
  if (dockerStatus === "error") failedChecks.push("Docker");
  if (miseStatus === "error") failedChecks.push("Mise");

  if (failedChecks.length > 0) {
    store.setError(
      new Error(
        `Prerequisites failed: ${failedChecks.join(", ")} ${failedChecks.length === 1 ? "is" : "are"} not installed or not working. Please install and try again.`,
      ),
    );
    return;
  }

  // Port check
  store.setStatus("Checking Ports...");
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

  // 3. Environment Setup
  await runEnvSetup(store, repoPath, portOverrides);

  if (store.currentState.error) {
    return; // Abort if env setup failed
  }

  // 4. Project Setup (mise setup)
  store.setStep("Project Setup");
  store.updateData("dependencyPhase", "Setting up project...");
  store.updateData("dependencyProgress", 0);
  store.updateData("dependencyComplete", false);
  store.updateData("dependencyLogs", []);

  const logHandler = (chunk: string) => {
    const currentLogs = store.currentState.data.dependencyLogs || [];
    const lines = chunk
      .split("\n")
      .filter((line: string) => line.trim() !== "");
    const newLogs = [...currentLogs, ...lines].slice(-20);
    store.updateData("dependencyLogs", newLogs);
  };

  try {
    store.updateData("dependencyPhase", "Trusting mise configuration...");
    await runCommand("mise", ["trust"], repoPath, undefined, logHandler);
    store.updateData("dependencyProgress", 20);

    store.updateData("dependencyPhase", "Installing tools...");
    await runCommand(
      "mise",
      ["install"],
      repoPath,
      (progress) => {
        store.updateData("dependencyProgress", 20 + progress * 0.3);
      },
      logHandler,
    );

    store.updateData("dependencyPhase", "Running mise setup...");
    await runCommand(
      "mise",
      ["setup"],
      repoPath,
      (progress) => {
        store.updateData("dependencyProgress", 50 + progress * 0.5);
      },
      logHandler,
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

  store.setStep("Finished");
  store.setStatus("Setup complete!");
}
