import { REST, Routes } from "discord.js";
import { data as authCommand } from "./commands/auth";
import { data as conversationCommand } from "./commands/conversation";
import { data as gaiaCommand } from "./commands/gaia";
import { data as helpCommand } from "./commands/help";
import { data as newCommand } from "./commands/new";

import { data as settingsCommand } from "./commands/settings";
import { data as statusCommand } from "./commands/status";
import { data as todoCommand } from "./commands/todo";
import { data as workflowCommand } from "./commands/workflow";

const commands = [
  gaiaCommand.toJSON(),
  authCommand.toJSON(),
  statusCommand.toJSON(),
  helpCommand.toJSON(),
  settingsCommand.toJSON(),
  workflowCommand.toJSON(),
  todoCommand.toJSON(),
  conversationCommand.toJSON(),

  newCommand.toJSON(),
];

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID");
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Successfully registered slash commands");
  } catch (error) {
    console.error("Failed to register commands:", error);
    process.exit(1);
  }
})();
