import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { handleConversationList, truncateResponse } from "@gaia/shared";

export function registerConversationCommand(app: App, gaia: GaiaClient) {
  app.command("/conversations", async ({ command, ack, respond }) => {
    await ack();

    const ctx = {
      platform: "slack" as const,
      platformUserId: command.user_id,
      channelId: command.channel_id,
    };

    const response = await handleConversationList(gaia, ctx);
    const truncated = truncateResponse(response, "slack");
    await respond({ text: truncated, response_type: "ephemeral" });
  });
}
