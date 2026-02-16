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
  let isFirstMessage = true;
  let lastFollowUp: Awaited<ReturnType<typeof interaction.followUp>> | null =
    null;

  await handleStreamingChat(
    gaia,
    { message, platform: "discord", platformUserId: userId, channelId },
    async (text) => {
      if (isFirstMessage) {
        await interaction.editReply({ content: text });
      } else if (lastFollowUp) {
        await lastFollowUp.edit({ content: text });
      }
    },
    async (text) => {
      if (isFirstMessage) {
        isFirstMessage = false;
      }
      lastFollowUp = await interaction.followUp({
        content: text,
        flags: MessageFlags.Ephemeral,
      });
      return async (updatedText) => {
        if (lastFollowUp) {
          await lastFollowUp.edit({ content: updatedText });
        }
      };
    },
    async (authUrl) => {
      if (isFirstMessage) {
        await interaction.editReply({
          content: `Please authenticate first: ${authUrl}`,
        });
      } else if (lastFollowUp) {
        await lastFollowUp.edit({
          content: `Please authenticate first: ${authUrl}`,
        });
      }
    },
    async (errMsg) => {
      if (isFirstMessage) {
        await interaction.editReply({ content: errMsg });
      } else if (lastFollowUp) {
        await lastFollowUp.edit({ content: errMsg });
      }
    },
    STREAMING_DEFAULTS.discord,
  );
}
