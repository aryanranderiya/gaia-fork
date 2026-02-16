import type { GaiaClient } from "@gaia/shared";
import { handleNewConversation } from "@gaia/shared";
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("new")
  .setDescription("Start a new conversation with GAIA");

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ctx = {
    platform: "discord" as const,
    platformUserId: interaction.user.id,
    channelId: interaction.channelId,
  };

  const response = await handleNewConversation(gaia, ctx);
  await interaction.editReply({ content: response });
}
