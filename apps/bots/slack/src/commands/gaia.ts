import type { GaiaClient } from "@gaia/shared";
import { handleStreamingChat, STREAMING_DEFAULTS } from "@gaia/shared";
import type { App } from "@slack/bolt";

export function registerGaiaCommand(app: App, gaia: GaiaClient) {
  app.command("/gaia", async ({ command, ack, client }) => {
    await ack();

    const userId = command.user_id;
    const channelId = command.channel_id;
    const message = command.text;

    if (!message) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Please provide a message. Usage: /gaia <your message>",
      });
      return;
    }

    const result = await client.chat.postMessage({
      channel: channelId,
      text: "Thinking...",
    });

    const ts = result.ts;
    if (!ts) return;

    await handleStreamingChat(
      gaia,
      { message, platform: "slack", platformUserId: userId, channelId },
      async (text) => {
        await client.chat.update({
          channel: channelId,
          ts,
          text,
        });
      },
      async (authUrl) => {
        await client.chat.update({
          channel: channelId,
          ts,
          text: `Please authenticate first: ${authUrl}`,
        });
      },
      async (errMsg) => {
        await client.chat.update({
          channel: channelId,
          ts,
          text: errMsg,
        });
      },
      STREAMING_DEFAULTS.slack,
    );
  });
}
