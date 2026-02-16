import {
  Collection,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import * as gaia from "./gaia";
import * as auth from "./auth";
import * as status from "./status";
import * as workflow from "./workflow";
import * as todo from "./todo";
import * as conversation from "./conversation";
import * as weather from "./weather";
import * as newCmd from "./new";
import * as search from "./search";

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
  commands.set(weather.data.name, weather);
  commands.set(search.data.name, search);
  commands.set(newCmd.data.name, newCmd);
  return commands;
}
