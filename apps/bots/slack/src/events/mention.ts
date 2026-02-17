import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { handleStreamingChat, STREAMING_DEFAULTS } from "@gaia/shared";

export function registerMentionEvent(app: App, gaia: GaiaClient) {
  app.event("app_mention", async ({ event, client, context }) => {
    // Strip only the bot's own mention tag so user references remain intact
    const botMention = context.botUserId
      ? new RegExp(`<@${context.botUserId}>`, "g")
      : null;
    const content = botMention
      ? event.text.replace(botMention, "").trim()
      : event.text.trim();
    const userId = event.user;
    const channelId = event.channel;

    if (!userId) return;

    if (!content) {
      await client.chat.postMessage({
        channel: channelId,
        text: "How can I help you?",
      });
      return;
    }

    const result = await client.chat.postMessage({
      channel: channelId,
      text: "Thinking...",
    });

    const ts = result.ts;
    if (!ts) return;

    let currentTs = ts;

    await handleStreamingChat(
      gaia,
      {
        message: content,
        platform: "slack",
        platformUserId: userId,
        channelId,
      },
      async (text) => {
        await client.chat.update({ channel: channelId, ts: currentTs, text });
      },
      async (text) => {
        const newMessage = await client.chat.postMessage({
          channel: channelId,
          text,
        });
        if (newMessage.ts) {
          currentTs = newMessage.ts;
        }
        return async (updatedText) => {
          await client.chat.update({
            channel: channelId,
            ts: currentTs,
            text: updatedText,
          });
        };
      },
      async (authUrl) => {
        await client.chat.update({
          channel: channelId,
          ts: currentTs,
          text: `Please link your account first: ${authUrl}`,
        });
      },
      async (errMsg) => {
        await client.chat.update({
          channel: channelId,
          ts: currentTs,
          text: errMsg,
        });
      },
      STREAMING_DEFAULTS.slack,
    );
  });
}
