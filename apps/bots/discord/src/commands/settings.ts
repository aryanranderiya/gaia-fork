import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import { formatBotError } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("View your GAIA account settings and connected integrations");

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const settings = await gaia.getSettings("discord", interaction.user.id);

    if (!settings.authenticated) {
      const authUrl = gaia.getAuthUrl("discord", interaction.user.id);
      await interaction.editReply(
        `❌ Not linked yet.\n\n🔗 Link your Discord account to GAIA to view settings:\n${authUrl}\n\nSign in to GAIA and connect Discord in Settings → Linked Accounts.`,
      );
      return;
    }

    let accountAge = "Unknown";
    if (settings.accountCreatedAt) {
      const createdDate = new Date(settings.accountCreatedAt);
      accountAge = createdDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    let integrationsText = "None connected";
    if (settings.connectedIntegrations.length > 0) {
      integrationsText = settings.connectedIntegrations
        .map((i) => `• ${i.name}`)
        .join("\n");
    }

    const embed = new EmbedBuilder()
      .setTitle("⚙️ Your GAIA Settings")
      .setColor(0x7c3aed)
      .addFields(
        {
          name: "👤 Account",
          value: [
            `**Name:** ${settings.userName || "Not set"}`,
            `**Member since:** ${accountAge}`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🤖 AI Model",
          value: settings.selectedModelName || "Default",
          inline: true,
        },
        {
          name: "🔗 Connected Integrations",
          value: integrationsText,
          inline: false,
        },
      )
      .setFooter({ text: "Manage settings at heygaia.io/settings" })
      .setTimestamp();

    if (settings.profileImageUrl) {
      embed.setThumbnail(settings.profileImageUrl);
    }

    if (settings.selectedModelIconUrl) {
      embed.setAuthor({
        name: settings.selectedModelName || "AI Model",
        iconURL: settings.selectedModelIconUrl,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply(formatBotError(error));
  }
}
