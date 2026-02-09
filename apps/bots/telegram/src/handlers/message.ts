import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { truncateResponse, formatError } from "@gaia/shared";

export function registerMessageHandler(bot: Bot, gaia: GaiaClient) {
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (ctx.chat.type !== "private") return;

    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const loading = await ctx.reply("Thinking...");

    try {
      const response = await gaia.chat({
        message: ctx.message.text,
        platform: "telegram",
        platformUserId: userId,
        channelId: ctx.chat.id.toString(),
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
