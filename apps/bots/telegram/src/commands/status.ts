import type { GaiaClient } from "@gaia/shared";
import type { Bot } from "grammy";

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
        try {
          const { authUrl } = await gaia.createLinkToken("telegram", userId);
          await ctx.reply(
            `❌ Not linked yet.\n\n🔗 Link your account: ${authUrl}`,
          );
        } catch {
          await ctx.reply("❌ Not linked yet. Use /auth to get a link.");
        }
      }
    } catch {
      await ctx.reply("Error checking status. Please try again.");
    }
  });
}
