import type { GaiaClient } from "@gaia/shared";
import { handleNewConversation } from "@gaia/shared";
import type { Bot } from "grammy";

export function registerNewCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("new", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const userCtx = {
      platform: "telegram" as const,
      platformUserId: userId,
      channelId: ctx.chat.id.toString(),
    };

    const response = await handleNewConversation(gaia, userCtx);
    await ctx.reply(response);
  });
}
