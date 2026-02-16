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

    const reply = await message.reply("Thinking...");

    await handleMentionChat(
      gaia,
      {
        message: content,
        platform: "discord",
        platformUserId: message.author.id,
        channelId: message.guildId || message.channelId,
      },
      async (text) => {
        await reply.edit(text);
      },
      async (errMsg) => {
        await reply.edit(errMsg);
      },
      STREAMING_DEFAULTS.discord,
    );
  } catch (error) {
    await message.reply(formatBotError(error));
  }
}
