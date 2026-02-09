import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("auth")
  .setDescription("Link your Discord account to GAIA");

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  const userId = interaction.user.id;
  const authUrl = gaia.getAuthUrl("discord", userId);

  await interaction.reply({
    content: `🔗 **Link your Discord to GAIA**\n\nClick the link below to sign in with GAIA and link your Discord account:\n${authUrl}\n\n*After linking, you'll be able to use all GAIA commands directly from Discord!*`,
    flags: MessageFlags.Ephemeral,
  });
}
