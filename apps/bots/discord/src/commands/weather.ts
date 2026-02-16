import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import { handleWeather, truncateResponse } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("weather")
  .setDescription("Get weather information")
  .addStringOption((option) =>
    option
      .setName("location")
      .setDescription("City or location name")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  const location = interaction.options.getString("location", true);
  const userId = interaction.user.id;
  const ctx = {
    platform: "discord" as const,
    platformUserId: userId,
    channelId: interaction.channelId,
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const response = await handleWeather(gaia, location, ctx);
  const truncated = truncateResponse(response, "discord");
  await interaction.editReply({ content: truncated });
}
