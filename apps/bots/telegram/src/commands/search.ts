import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { formatBotError, truncateMessage } from "@gaia/shared";

export function registerSearchCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("search", async (ctx) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    const query = args.join(" ");

    if (!query) {
      await ctx.reply("Usage: /search <query>");
      return;
    }

    const loading = await ctx.reply("Searching...");

    try {
      const response = await gaia.search(query);
      const totalResults =
        response.messages.length +
        response.conversations.length +
        response.notes.length;

      let result = `Search results for: "${query}"\n\n`;
      if (totalResults === 0) {
        result = `No results found for: "${query}"`;
      } else {
        if (response.messages.length > 0) {
          result += `Messages: ${response.messages.length}\n`;
        }
        if (response.conversations.length > 0) {
          result += `Conversations: ${response.conversations.length}\n`;
        }
        if (response.notes.length > 0) {
          result += `Notes: ${response.notes.length}\n`;
        }
      }

      const truncated = truncateMessage(result, "telegram");
      await ctx.api.editMessageText(
        ctx.chat.id,
        loading.message_id,
        truncated,
      );
    } catch (error) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        loading.message_id,
        formatBotError(error),
      );
    }
  });
}
