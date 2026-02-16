import type { GaiaClient } from "@gaia/shared";
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

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
      try {
        const { authUrl } = await gaia.createLinkToken(
          "discord",
          interaction.user.id,
        );
        await interaction.editReply(
          `❌ Not linked yet.\n\n🔗 Link your account: ${authUrl}`,
        );
      } catch {
        await interaction.editReply(
          "❌ Not linked yet. Use /auth to link your account.",
        );
      }
    }
  } catch {
    await interaction.editReply("Error checking status. Please try again.");
  }
}
