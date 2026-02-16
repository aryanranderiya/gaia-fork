import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { handleSearch, truncateResponse } from "@gaia/shared";

export function registerSearchCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("search", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    const query = args.join(" ");

    if (!query) {
      await ctx.reply("Usage: /search <query>");
      return;
    }

    const userCtx = {
      platform: "telegram" as const,
      platformUserId: userId,
      channelId: ctx.chat.id.toString(),
    };

    const loading = await ctx.reply("Searching...");

    const response = await handleSearch(gaia, query, userCtx);
    const truncated = truncateResponse(response, "telegram");
    await ctx.api.editMessageText(ctx.chat.id, loading.message_id, truncated);
  });
}
