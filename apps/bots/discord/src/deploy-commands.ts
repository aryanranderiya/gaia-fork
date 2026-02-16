import { REST, Routes } from "discord.js";
import { data as gaiaCommand } from "./commands/gaia";
import { data as authCommand } from "./commands/auth";
import { data as statusCommand } from "./commands/status";
import { data as workflowCommand } from "./commands/workflow";
import { data as todoCommand } from "./commands/todo";
import { data as conversationCommand } from "./commands/conversation";
import { data as weatherCommand } from "./commands/weather";
import { data as newCommand } from "./commands/new";
import { data as searchCommand } from "./commands/search";
import { data as helpCommand } from "./commands/help";
import { data as settingsCommand } from "./commands/settings";

const commands = [
  gaiaCommand.toJSON(),
  authCommand.toJSON(),
  statusCommand.toJSON(),
  helpCommand.toJSON(),
  settingsCommand.toJSON(),
  workflowCommand.toJSON(),
  todoCommand.toJSON(),
  conversationCommand.toJSON(),
  weatherCommand.toJSON(),
  searchCommand.toJSON(),
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
