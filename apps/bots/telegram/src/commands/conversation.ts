import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { handleConversationList, truncateResponse } from "@gaia/shared";

export function registerConversationCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("conversations", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const userCtx = {
      platform: "telegram" as const,
      platformUserId: userId,
      channelId: ctx.chat.id.toString(),
    };

    const loading = await ctx.reply("Loading...");

    const response = await handleConversationList(gaia, userCtx);
    const truncated = truncateResponse(response, "telegram");
    await ctx.api.editMessageText(
      ctx.chat.id,
      loading.message_id,
      truncated,
    );
  });
}
