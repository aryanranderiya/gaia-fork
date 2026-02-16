import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import { handleConversationList, truncateResponse } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("conversations")
  .setDescription("View your GAIA conversations")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("List your recent conversations")
      .addIntegerOption((option) =>
        option
          .setName("page")
          .setDescription("Page number")
          .setMinValue(1),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  const userId = interaction.user.id;
  const ctx = {
    platform: "discord" as const,
    platformUserId: userId,
    channelId: interaction.channelId,
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const page = interaction.options.getInteger("page") || 1;
  const response = await handleConversationList(gaia, ctx, page);
  const truncated = truncateResponse(response, "discord");
  await interaction.editReply({ content: truncated });
}
