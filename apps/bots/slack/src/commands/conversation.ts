import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import {
  formatConversationList,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

export function registerConversationCommand(app: App, gaia: GaiaClient) {
  app.command("/conversations", async ({ command, ack, respond }) => {
    await ack();

    try {
      const conversations = await gaia.listConversations({ page: 1, limit: 5 });
      const response = formatConversationList(
        conversations.conversations,
        gaia.getBaseUrl(),
      );
      const truncated = truncateMessage(response, "slack");

      await respond({ text: truncated, response_type: "ephemeral" });
    } catch (error) {
      await respond({
        text: formatBotError(error),
        response_type: "ephemeral",
      });
    }
  });
}
