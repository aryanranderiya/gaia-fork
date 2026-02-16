import type { GaiaClient } from "@gaia/shared";
import type { Bot } from "grammy";

export function registerAuthCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("auth", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const { authUrl } = await gaia.createLinkToken("telegram", userId);
      await ctx.reply(
        `🔗 Link your Telegram to GAIA\n\nOpen the link below to sign in and link your account:\n${authUrl}\n\nAfter linking, you'll be able to use all GAIA commands directly from Telegram!`,
      );
    } catch {
      await ctx.reply("❌ Failed to generate auth link. Please try again.");
    }
  });
}
