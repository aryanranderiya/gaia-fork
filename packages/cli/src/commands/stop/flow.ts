import { readDockerComposePortOverrides } from "../../lib/env-writer.js";
import { findRepoRoot, stopServices } from "../../lib/service-starter.js";
import type { CLIStore } from "../../ui/store.js";

export async function runStopFlow(store: CLIStore): Promise<void> {
  store.setStep("Stopping");
  store.setStatus("Locating GAIA repository...");

  const repoPath = findRepoRoot();
  if (!repoPath) {
    store.setError(
      new Error(
        "Could not find GAIA repository. Run from within a cloned gaia repo.",
      ),
    );
    return;
  }

  store.updateData("repoPath", repoPath);
  const portOverrides = readDockerComposePortOverrides(repoPath);

  try {
    await stopServices(
      repoPath,
      (status) => {
        store.setStatus(status);
      },
      portOverrides,
    );

    store.setStep("Stopped");
    store.setStatus("All services stopped.");
    store.updateData("stopped", true);
  } catch (e) {
    store.setError(
      new Error(`Failed to stop services: ${(e as Error).message}`),
    );
    return;
  }

  await store.waitForInput("exit");
}
