import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";

export function registerAuthCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("auth", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const authUrl = gaia.getAuthUrl("telegram", userId);
    await ctx.reply(
      `🔗 **Link your Telegram to GAIA**\n\nClick the link below to sign in with GAIA and link your Telegram account:\n${authUrl}\n\nAfter linking, you'll be able to use all GAIA commands directly from Telegram!`,
    );
  });
}
