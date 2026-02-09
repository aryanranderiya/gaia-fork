import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import { formatBotError, truncateMessage } from "@gaia/shared";

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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const response = await gaia.getWeather(location, "discord", userId);
    const truncated = truncateMessage(response, "discord");
    await interaction.editReply({ content: truncated });
  } catch (error) {
    await interaction.editReply({ content: formatBotError(error) });
  }
}
