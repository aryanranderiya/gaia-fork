import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { handleSearch, truncateResponse } from "@gaia/shared";

export function registerSearchCommand(app: App, gaia: GaiaClient) {
  app.command("/search", async ({ command, ack, respond }) => {
    await ack();

    const query = command.text.trim();
    if (!query) {
      await respond({
        text: "Usage: /search <query>",
        response_type: "ephemeral",
      });
      return;
    }

    const ctx = {
      platform: "slack" as const,
      platformUserId: command.user_id,
      channelId: command.channel_id,
    };

    const response = await handleSearch(gaia, query, ctx);
    const truncated = truncateResponse(response, "slack");
    await respond({ text: truncated, response_type: "ephemeral" });
  });
}
