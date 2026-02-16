import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Check your GAIA account link status");

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const status = await gaia.checkAuthStatus("discord", interaction.user.id);

    if (status.authenticated) {
      await interaction.editReply(
        "✅ Your Discord account is linked to GAIA!\n\nYou can use all commands.",
      );
    } else {
      const authUrl = gaia.getAuthUrl("discord", interaction.user.id);
      await interaction.editReply(
        `❌ Not linked yet.\n\n🔗 Link your account: ${authUrl}`,
      );
    }
  } catch (error) {
    await interaction.editReply("Error checking status. Please try again.");
  }
}
