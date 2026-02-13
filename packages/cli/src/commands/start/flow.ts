import { readDockerComposePortOverrides } from "../../lib/env-writer.js";
import {
  detectSetupMode,
  findRepoRoot,
  startServices,
} from "../../lib/service-starter.js";
import type { CLIStore } from "../../ui/store.js";

export async function runStartFlow(store: CLIStore): Promise<void> {
  store.setStep("Starting");
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

  const mode = await detectSetupMode(repoPath);
  if (!mode) {
    store.setError(
      new Error(
        "No .env file found. Run 'gaia setup' first to configure the environment.",
      ),
    );
    return;
  }

  const portOverrides = readDockerComposePortOverrides(repoPath);
  const webPort = portOverrides[3000] ?? 3000;
  const apiPort = portOverrides[8000] ?? 8000;

  store.updateData("setupMode", mode);
  store.updateData("webPort", webPort);
  store.updateData("apiPort", apiPort);
  store.setStatus(`Starting GAIA in ${mode} mode...`);

  try {
    await startServices(repoPath, mode, (status) => {
      store.setStatus(status);
    }, portOverrides);

    store.setStep("Running");
    store.setStatus("GAIA is running!");
    store.updateData("started", true);
  } catch (e) {
    store.setError(
      new Error(`Failed to start services: ${(e as Error).message}`),
    );
    return;
  }

  await store.waitForInput("exit");
}
