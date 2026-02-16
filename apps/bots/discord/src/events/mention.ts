import type { Message } from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import {
  handleMentionChat,
  STREAMING_DEFAULTS,
  formatBotError,
} from "@gaia/shared";

export async function handleMention(message: Message, gaia: GaiaClient) {
  const content = message.content.trim();

  if (!content) {
    await message.reply("How can I help you?");
    return;
  }

  const isDM = !message.guild;

  // In DMs, send normal messages; in guilds, reply to the mention
  const send = isDM
    ? (text: string) => message.channel.send(text)
    : (text: string) => message.reply(text);

  try {
    const hasTyping = "sendTyping" in message.channel;
    if (hasTyping) {
      await message.channel.sendTyping();
    }

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

    let currentMsg: Message | null = null;

    const sendOrEdit = async (text: string) => {
      clearTyping();
      if (!currentMsg) {
        currentMsg = await send(text);
      } else {
        await currentMsg.edit(text);
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
        currentMsg = await send(text);
        return async (updatedText) => {
          await currentMsg?.edit(updatedText);
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
    await send(formatBotError(error));
  }
}
