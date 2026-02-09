import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { registerStartCommand } from "./start";
import { registerGaiaCommand } from "./gaia";
import { registerAuthCommand } from "./auth";
import { registerWorkflowCommand } from "./workflow";
import { registerTodoCommand } from "./todo";
import { registerConversationCommand } from "./conversation";
import { registerWeatherCommand } from "./weather";
import { registerSearchCommand } from "./search";

export function registerCommands(bot: Bot, gaia: GaiaClient) {
  registerStartCommand(bot);
  registerGaiaCommand(bot, gaia);
  registerAuthCommand(bot, gaia);
  registerWorkflowCommand(bot, gaia);
  registerTodoCommand(bot, gaia);
  registerConversationCommand(bot, gaia);
  registerWeatherCommand(bot, gaia);
  registerSearchCommand(bot, gaia);
}
