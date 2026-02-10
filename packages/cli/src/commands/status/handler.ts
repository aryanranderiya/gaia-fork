import { render } from "ink";
import React from "react";
import { createStore } from "../../ui/store.js";
import { App } from "../../ui/app.js";
import { runStatusFlow } from "./flow.js";

export async function runStatus(): Promise<void> {
  const store = createStore();

  const { unmount } = render(
    React.createElement(App, { store, command: "status" }),
  );

  // Wait a tick for ink to fully initialize and measure terminal dimensions
  // before running the flow, otherwise ink-big-text may fall back to plain text
  await new Promise((resolve) => setTimeout(resolve, 50));

  try {
    await runStatusFlow(store);
  } catch (error) {
    store.setError(error as Error);
  }

  // Keep alive until user exits
  await new Promise<void>((resolve) => {
    const check = () => {
      if (store.currentState.data.exitRequested) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });

  unmount();
  process.exit(0);
}
