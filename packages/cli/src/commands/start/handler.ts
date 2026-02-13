import { render } from "ink";
import React from "react";
import { App } from "../../ui/app.js";
import { createStore } from "../../ui/store.js";
import { runStartFlow } from "./flow.js";

export async function runStart(): Promise<void> {
  const store = createStore();

  const { unmount } = render(
    React.createElement(App, { store, command: "start" }),
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  try {
    await runStartFlow(store);
  } catch (error) {
    store.setError(error as Error);
  }

  if (store.currentState.error) {
    await store.waitForInput("exit");
  }

  unmount();
  process.exit(store.currentState.error ? 1 : 0);
}
