import type { Message } from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import {
  handleMentionChat,
  STREAMING_DEFAULTS,
  formatBotError,
} from "@gaia/shared";

export async function handleMention(message: Message, gaia: GaiaClient) {
  const content = message.content.replace(/<@!?\d+>/g, "").trim();

  if (!content) {
    await message.reply("How can I help you?");
    return;
  }

  try {
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }

    let currentReply: Awaited<ReturnType<typeof message.reply>> | null = null;

    const sendOrEdit = async (text: string) => {
      if (!currentReply) {
        currentReply = await message.reply(text);
      } else {
        await currentReply.edit(text);
      }
    };

    await handleMentionChat(
      gaia,
      {
        message: content,
        platform: "discord",
        platformUserId: message.author.id,
        channelId: message.guildId || message.channelId,
      },
      sendOrEdit,
      async (text) => {
        currentReply = await message.reply(text);
        return async (updatedText) => {
          await currentReply?.edit(updatedText);
        };
      },
      async (errMsg) => {
        await sendOrEdit(errMsg);
      },
      STREAMING_DEFAULTS.discord,
    );
  } catch (error) {
    await message.reply(formatBotError(error));
  }
}
