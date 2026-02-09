import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import { formatBotError, truncateMessage } from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("search")
  .setDescription("Search your GAIA data")
  .addStringOption((option) =>
    option
      .setName("query")
      .setDescription("Search query")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  const query = interaction.options.getString("query", true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const response = await gaia.search(query);
    const totalResults =
      response.messages.length +
      response.conversations.length +
      response.notes.length;

    let result = `🔍 Search results for: "${query}"\n\n`;
    if (totalResults === 0) {
      result = `No results found for: "${query}"`;
    } else {
      if (response.messages.length > 0) {
        result += `📨 Messages: ${response.messages.length}\n`;
      }
      if (response.conversations.length > 0) {
        result += `💬 Conversations: ${response.conversations.length}\n`;
      }
      if (response.notes.length > 0) {
        result += `📝 Notes: ${response.notes.length}\n`;
      }
    }

    const truncated = truncateMessage(result, "discord");
    await interaction.editReply({ content: truncated });
  } catch (error) {
    await interaction.editReply({ content: formatBotError(error) });
  }
}
