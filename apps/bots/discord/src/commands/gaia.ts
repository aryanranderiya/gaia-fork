import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import { handleStreamingChat, STREAMING_DEFAULTS } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("gaia")
  .setDescription("Chat with GAIA")
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Your message to GAIA")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  const message = interaction.options.getString("message", true);
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await handleStreamingChat(
    gaia,
    { message, platform: "discord", platformUserId: userId, channelId },
    async (text) => {
      await interaction.editReply({ content: text });
    },
    async (authUrl) => {
      await interaction.editReply({
        content: `Please authenticate first: ${authUrl}`,
      });
    },
    async (errMsg) => {
      await interaction.editReply({ content: errMsg });
    },
    STREAMING_DEFAULTS.discord,
  );
}
