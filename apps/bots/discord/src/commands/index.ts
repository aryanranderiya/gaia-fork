import type { GaiaClient } from "@gaia/shared";
import {
  type ChatInputCommandInteraction,
  Collection,
  type SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import * as auth from "./auth";
import * as conversation from "./conversation";
import * as gaia from "./gaia";
import * as help from "./help";
import * as newCmd from "./new";

import * as settings from "./settings";
import * as status from "./status";
import * as todo from "./todo";
import * as workflow from "./workflow";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (
    interaction: ChatInputCommandInteraction,
    client: GaiaClient,
  ) => Promise<void>;
}

export function registerCommands(): Collection<string, Command> {
  const commands = new Collection<string, Command>();
  commands.set(gaia.data.name, gaia);
  commands.set(auth.data.name, auth);
  commands.set(status.data.name, status);
  commands.set(workflow.data.name, workflow);
  commands.set(todo.data.name, todo);
  commands.set(conversation.data.name, conversation);


  commands.set(newCmd.data.name, newCmd);
  commands.set(help.data.name, help);
  commands.set(settings.data.name, settings);
  return commands;
}
