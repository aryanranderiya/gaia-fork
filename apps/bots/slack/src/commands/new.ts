import type { GaiaClient } from "@gaia/shared";
import { handleNewConversation } from "@gaia/shared";
import type { App } from "@slack/bolt";

export function registerNewCommand(app: App, gaia: GaiaClient) {
  app.command("/new", async ({ command, ack, respond }) => {
    await ack();

    const ctx = {
      platform: "slack" as const,
      platformUserId: command.user_id,
      channelId: command.channel_id,
    };

    const response = await handleNewConversation(gaia, ctx);
    await respond({ text: response, response_type: "ephemeral" });
  });
}
