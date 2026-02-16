import type { GaiaClient } from "@gaia/shared";
import type { Bot } from "grammy";
import { registerAuthCommand } from "./auth";
import { registerConversationCommand } from "./conversation";
import { registerGaiaCommand } from "./gaia";
import { registerNewCommand } from "./new";

import { registerStartCommand } from "./start";
import { registerStatusCommand } from "./status";
import { registerTodoCommand } from "./todo";
import { registerWorkflowCommand } from "./workflow";

export function registerCommands(bot: Bot, gaia: GaiaClient) {
  registerStartCommand(bot);
  registerGaiaCommand(bot, gaia);
  registerAuthCommand(bot, gaia);
  registerStatusCommand(bot, gaia);
  registerWorkflowCommand(bot, gaia);
  registerTodoCommand(bot, gaia);
  registerConversationCommand(bot, gaia);


  registerNewCommand(bot, gaia);
}
