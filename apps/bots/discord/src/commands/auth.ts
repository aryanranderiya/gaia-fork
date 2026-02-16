import type { GaiaClient } from "@gaia/shared";
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("auth")
  .setDescription("Link your Discord account to GAIA");

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;

  // Check if user is already linked
  const authStatus = await gaia.checkAuthStatus("discord", userId);

  if (authStatus.authenticated) {
    await interaction.editReply(
      `✅ **Already Connected!**\n\nYour Discord account is already linked to GAIA.\n\nUse \`/settings\` to view your account details and connected integrations.`,
    );
    return;
  }

  const authUrl = gaia.getAuthUrl("discord", userId);

  await interaction.editReply(
    `🔗 **Link your Discord to GAIA**\n\nClick the link below to sign in with GAIA and link your Discord account:\n${authUrl}\n\n*After linking, you'll be able to use all GAIA commands directly from Discord!*`,
  );
}
