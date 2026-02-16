import type { GaiaClient } from "@gaia/shared";
import { handleStreamingChat, STREAMING_DEFAULTS } from "@gaia/shared";
import type { Bot } from "grammy";

export function registerGaiaCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("gaia", async (ctx) => {
    const message = ctx.match;
    const userId = ctx.from?.id.toString();
    const chatId = ctx.chat.id.toString();

    if (!userId) return;

    if (!message) {
      await ctx.reply("Usage: /gaia <your message>");
      return;
    }

    const loading = await ctx.reply("Thinking...");
    let currentMessageId = loading.message_id;

    await handleStreamingChat(
      gaia,
      {
        message,
        platform: "telegram",
        platformUserId: userId,
        channelId: chatId,
      },
      async (text) => {
        await ctx.api.editMessageText(ctx.chat.id, currentMessageId, text);
      },
      async (text) => {
        const newMessage = await ctx.reply(text);
        currentMessageId = newMessage.message_id;
        return async (updatedText) => {
          await ctx.api.editMessageText(
            ctx.chat.id,
            newMessage.message_id,
            updatedText,
          );
        };
      },
      async (authUrl) => {
        await ctx.api.editMessageText(
          ctx.chat.id,
          currentMessageId,
          `Please authenticate first.\n\nOpen this link to sign in:\n${authUrl}`,
        );
      },
      async (errMsg) => {
        await ctx.api.editMessageText(ctx.chat.id, currentMessageId, errMsg);
      },
      STREAMING_DEFAULTS.telegram,
    );
  });
}
