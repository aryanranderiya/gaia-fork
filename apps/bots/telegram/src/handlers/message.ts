import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import { handleStreamingChat, STREAMING_DEFAULTS } from "@gaia/shared";

export function registerMessageHandler(bot: Bot, gaia: GaiaClient) {
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (ctx.chat.type !== "private") return;

    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const loading = await ctx.reply("Thinking...");

    await handleStreamingChat(
      gaia,
      {
        message: ctx.message.text,
        platform: "telegram",
        platformUserId: userId,
        channelId: ctx.chat.id.toString(),
      },
      async (text) => {
        await ctx.api.editMessageText(
          ctx.chat.id,
          loading.message_id,
          text,
        );
      },
      async (authUrl) => {
        await ctx.api.editMessageText(
          ctx.chat.id,
          loading.message_id,
          `Please authenticate first: ${authUrl}`,
        );
      },
      async (errMsg) => {
        await ctx.api.editMessageText(
          ctx.chat.id,
          loading.message_id,
          errMsg,
        );
      },
      STREAMING_DEFAULTS.telegram,
    );
  });
}
