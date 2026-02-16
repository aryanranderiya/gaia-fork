import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { registerGaiaCommand } from "./gaia";
import { registerAuthCommand } from "./auth";
import { registerStatusCommand } from "./status";
import { registerWorkflowCommand } from "./workflow";
import { registerTodoCommand } from "./todo";
import { registerConversationCommand } from "./conversation";
import { registerWeatherCommand } from "./weather";
import { registerNewCommand } from "./new";
import { registerSearchCommand } from "./search";

export function registerCommands(app: App, gaia: GaiaClient) {
  registerGaiaCommand(app, gaia);
  registerAuthCommand(app, gaia);
  registerStatusCommand(app, gaia);
  registerWorkflowCommand(app, gaia);
  registerTodoCommand(app, gaia);
  registerConversationCommand(app, gaia);
  registerWeatherCommand(app, gaia);
  registerSearchCommand(app, gaia);
  registerNewCommand(app, gaia);
}
