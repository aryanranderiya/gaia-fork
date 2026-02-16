import type { GaiaClient } from "@gaia/shared";
import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Learn how to use GAIA and view available commands");

export async function execute(
  interaction: ChatInputCommandInteraction,
  _gaia: GaiaClient,
) {
  const embed = new EmbedBuilder()
    .setTitle("🤖 GAIA - Your Personal AI Assistant")
    .setDescription(
      "GAIA is your proactive AI assistant that helps manage your digital life. Here's how to get started:",
    )
    .setColor(0x7c3aed)
    .addFields(
      {
        name: "✨ Getting Started",
        value: [
          "1. Use `/auth` to link your Discord account with GAIA",
          "2. Once linked, you can use all commands and features",
          "3. Mention me (@GAIA) in any channel for quick questions",
        ].join("\n"),
        inline: false,
      },
      {
        name: "📝 Available Commands",
        value: [
          "`/auth` - Link your Discord account to GAIA",
          "`/status` - Check your account link status",
          "`/settings` - View your GAIA settings and integrations",
          "`/gaia <message>` - Chat with GAIA (private)",
          "`/conversation` - Manage conversations",
          "`/new` - Start a new conversation",
          "`/todo` - Manage your tasks",
          "`/workflow` - Manage workflows",
        ].join("\n"),
        inline: false,
      },
      {
        name: "💬 Mention Mode",
        value:
          "Mention @GAIA in any channel to ask questions or get help. Your conversations are remembered!",
        inline: false,
      },
      {
        name: "🔗 Useful Links",
        value: [
          "[Website](https://heygaia.io)",
          "[Documentation](https://docs.heygaia.io)",
          "[Support](https://discord.gg/gaia)",
        ].join(" • "),
        inline: false,
      },
    )
    .setFooter({ text: "GAIA - General AI Assistant" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
