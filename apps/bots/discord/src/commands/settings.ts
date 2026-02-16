import type { GaiaClient } from "@gaia/shared";
import { formatBotError } from "@gaia/shared";
import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("View your GAIA account settings and connected integrations");

/**
 * Helper to convert relative URLs to absolute URLs.
 * Discord embeds require absolute URLs (https://...).
 */
function toAbsoluteUrl(
  url: string | null | undefined,
  frontendUrl: string,
): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url; // Already absolute
  }
  // Relative URL - prepend frontend URL
  return `${frontendUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const settings = await gaia.getSettings("discord", interaction.user.id);

    if (!settings.authenticated) {
      try {
        const { authUrl } = await gaia.createLinkToken(
          "discord",
          interaction.user.id,
        );
        await interaction.editReply(
          `❌ Not linked yet.\n\n🔗 Link your Discord account to GAIA to view settings:\n${authUrl}\n\nSign in to GAIA and connect Discord in Settings → Linked Accounts.`,
        );
      } catch {
        await interaction.editReply(
          "❌ Not linked yet. Use /auth to link your account.",
        );
      }
      return;
    }

    const frontendUrl = gaia.getFrontendUrl();

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
        .map((i) => {
          const statusDot = i.status === "connected" ? "🟢" : "🟠";
          return `${statusDot} ${i.name}`;
        })
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

    // Set profile image in author section and thumbnail
    const profileImageUrl = toAbsoluteUrl(
      settings.profileImageUrl,
      frontendUrl,
    );
    if (profileImageUrl) {
      embed.setAuthor({
        name: settings.userName || "GAIA User",
        iconURL: profileImageUrl,
      });
      embed.setThumbnail(profileImageUrl);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply(formatBotError(error));
  }
}
