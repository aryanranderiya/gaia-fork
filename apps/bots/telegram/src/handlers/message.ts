import type { GaiaClient } from "@gaia/shared";
import { handleStreamingChat, STREAMING_DEFAULTS } from "@gaia/shared";
import type { Bot } from "grammy";

export function registerMessageHandler(bot: Bot, gaia: GaiaClient) {
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (ctx.chat.type !== "private") return;

    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const loading = await ctx.reply("Thinking...");
    let currentMessageId = loading.message_id;

    await handleStreamingChat(
      gaia,
      {
        message: ctx.message.text,
        platform: "telegram",
        platformUserId: userId,
        channelId: ctx.chat.id.toString(),
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
