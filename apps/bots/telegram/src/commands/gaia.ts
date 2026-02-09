import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { truncateResponse, formatError } from "@gaia/shared";

export function registerGaiaCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("gaia", async (ctx) => {
    const message = ctx.match;
    const userId = ctx.from?.id.toString();
    const chatId = ctx.chat.id.toString();

    if (!userId) return;

    if (!message) {
      await ctx.reply("Usage: /gaia <your message>");
      return;
    }

    const loading = await ctx.reply("Thinking...");

    try {
      const response = await gaia.chat({
        message,
        platform: "telegram",
        platformUserId: userId,
        channelId: chatId,
      });

      if (!response.authenticated) {
        const authUrl = gaia.getAuthUrl("telegram", userId);
        await ctx.api.editMessageText(
          ctx.chat.id,
          loading.message_id,
          `Please authenticate first: ${authUrl}`,
        );
        return;
      }

      const truncated = truncateResponse(response.response, "telegram");
      await ctx.api.editMessageText(
        ctx.chat.id,
        loading.message_id,
        truncated,
      );
    } catch (error) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        loading.message_id,
        formatError(error),
      );
    }
  });
}
