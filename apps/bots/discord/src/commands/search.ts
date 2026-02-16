import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import { handleSearch, truncateResponse } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("search")
  .setDescription("Search your GAIA data")
  .addStringOption((option) =>
    option.setName("query").setDescription("Search query").setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  const query = interaction.options.getString("query", true);
  const userId = interaction.user.id;
  const ctx = {
    platform: "discord" as const,
    platformUserId: userId,
    channelId: interaction.channelId,
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const response = await handleSearch(gaia, query, ctx);
  const truncated = truncateResponse(response, "discord");
  await interaction.editReply({ content: truncated });
}
