import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { registerGaiaCommand } from "./gaia";
import { registerAuthCommand } from "./auth";
import { registerWorkflowCommand } from "./workflow";
import { registerTodoCommand } from "./todo";
import { registerConversationCommand } from "./conversation";
import { registerWeatherCommand } from "./weather";
import { registerSearchCommand } from "./search";

export function registerCommands(app: App, gaia: GaiaClient) {
  registerGaiaCommand(app, gaia);
  registerAuthCommand(app, gaia);
  registerWorkflowCommand(app, gaia);
  registerTodoCommand(app, gaia);
  registerConversationCommand(app, gaia);
  registerWeatherCommand(app, gaia);
  registerSearchCommand(app, gaia);
}
