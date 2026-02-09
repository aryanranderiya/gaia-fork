import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { formatBotError, truncateMessage } from "@gaia/shared";

export function registerWeatherCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("weather", async (ctx) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    const location = args.join(" ");

    if (!location) {
      await ctx.reply("Usage: /weather <location>");
      return;
    }

    const loading = await ctx.reply("Checking weather...");

    try {
      const response = await gaia.getWeather(
        location,
        "telegram",
        String(ctx.from?.id),
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
