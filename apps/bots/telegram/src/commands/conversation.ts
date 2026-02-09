import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import {
  formatConversationList,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

export function registerConversationCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("conversations", async (ctx) => {
    const loading = await ctx.reply("Loading...");

    try {
      const conversations = await gaia.listConversations({
        page: 1,
        limit: 5,
      });
      const response = formatConversationList(
        conversations.conversations,
        gaia.getBaseUrl(),
      );
      const truncated = truncateMessage(response, "telegram");

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
