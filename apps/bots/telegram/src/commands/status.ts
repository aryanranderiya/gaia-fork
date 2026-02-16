import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";

export function registerStatusCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("status", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const status = await gaia.checkAuthStatus("telegram", userId);

      if (status.authenticated) {
        await ctx.reply(
          "✅ Your Telegram account is linked to GAIA!\n\nYou can use all commands.",
        );
      } else {
        const authUrl = gaia.getAuthUrl("telegram", userId);
        await ctx.reply(
          `❌ Not linked yet.\n\n🔗 Link your account: ${authUrl}`,
        );
      }
    } catch (error) {
      await ctx.reply("Error checking status. Please try again.");
    }
  });
}
