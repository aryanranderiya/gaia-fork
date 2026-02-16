import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { handleWeather, truncateResponse } from "@gaia/shared";

export function registerWeatherCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("weather", async (ctx) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    const location = args.join(" ");

    if (!location) {
      await ctx.reply("Usage: /weather <location>");
      return;
    }

    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const userCtx = {
      platform: "telegram" as const,
      platformUserId: userId,
      channelId: ctx.chat.id.toString(),
    };

    const loading = await ctx.reply("Checking weather...");

    const response = await handleWeather(gaia, location, userCtx);
    const truncated = truncateResponse(response, "telegram");
    await ctx.api.editMessageText(
      ctx.chat.id,
      loading.message_id,
      truncated,
    );
  });
}
