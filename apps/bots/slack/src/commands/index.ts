import type { GaiaClient } from "@gaia/shared";
import type { App } from "@slack/bolt";
import { registerAuthCommand } from "./auth";
import { registerConversationCommand } from "./conversation";
import { registerGaiaCommand } from "./gaia";
import { registerNewCommand } from "./new";

import { registerStatusCommand } from "./status";
import { registerTodoCommand } from "./todo";
import { registerWorkflowCommand } from "./workflow";

export function registerCommands(app: App, gaia: GaiaClient) {
  registerGaiaCommand(app, gaia);
  registerAuthCommand(app, gaia);
  registerStatusCommand(app, gaia);
  registerWorkflowCommand(app, gaia);
  registerTodoCommand(app, gaia);
  registerConversationCommand(app, gaia);


  registerNewCommand(app, gaia);
}
