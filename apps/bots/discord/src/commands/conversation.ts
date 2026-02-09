import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import {
  formatConversationList,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const page = interaction.options.getInteger("page") || 1;
    const conversations = await gaia.listConversations({ page, limit: 5 });

    const response = formatConversationList(
      conversations.conversations,
      gaia.getBaseUrl(),
    );
    const truncated = truncateMessage(response, "discord");

    await interaction.editReply({ content: truncated });
  } catch (error) {
    await interaction.editReply({ content: formatBotError(error) });
  }
}
