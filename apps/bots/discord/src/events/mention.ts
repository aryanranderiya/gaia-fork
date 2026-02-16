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
    const hasTyping = "sendTyping" in message.channel;
    if (hasTyping) {
      await message.channel.sendTyping();
    }

    // Discord's typing indicator only lasts 10 seconds - keep refreshing it
    // until the first response arrives so the user knows we're still working.
    let typingInterval: ReturnType<typeof setInterval> | null = hasTyping
      ? setInterval(async () => {
          try {
            await (
              message.channel as { sendTyping: () => Promise<void> }
            ).sendTyping();
          } catch {}
        }, 8000)
      : null;

    const clearTyping = () => {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    };

    let currentReply: Awaited<ReturnType<typeof message.reply>> | null = null;

    const sendOrEdit = async (text: string) => {
      clearTyping();
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
        clearTyping();
        currentReply = await message.reply(text);
        return async (updatedText) => {
          await currentReply?.edit(updatedText);
        };
      },
      async (errMsg) => {
        clearTyping();
        await sendOrEdit(errMsg);
      },
      STREAMING_DEFAULTS.discord,
    );

    clearTyping();
  } catch (error) {
    await message.reply(formatBotError(error));
  }
}
