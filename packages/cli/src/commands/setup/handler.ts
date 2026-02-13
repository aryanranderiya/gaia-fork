import { render } from "ink";
import React from "react";
import { App } from "../../ui/app.js";
import { createStore } from "../../ui/store.js";
import { runSetupFlow } from "./flow.js";

export async function runSetup(): Promise<void> {
  const store = createStore();

  const { unmount } = render(
    React.createElement(App, { store, command: "setup" }),
  );

  try {
    await runSetupFlow(store);
  } catch (error) {
    store.setError(error as Error);
  }

  if (store.currentState.error) {
    await store.waitForInput("exit");
  }

  unmount();
  process.exit(store.currentState.error ? 1 : 0);
}
