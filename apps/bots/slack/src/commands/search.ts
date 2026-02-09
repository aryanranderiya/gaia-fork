import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { formatBotError, truncateMessage } from "@gaia/shared";

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

    try {
      const response = await gaia.search(query);
      const totalResults =
        response.messages.length +
        response.conversations.length +
        response.notes.length;

      let result = `🔍 Search results for: "${query}"\n\n`;
      if (totalResults === 0) {
        result = `No results found for: "${query}"`;
      } else {
        if (response.messages.length > 0) {
          result += `📨 Messages: ${response.messages.length}\n`;
        }
        if (response.conversations.length > 0) {
          result += `💬 Conversations: ${response.conversations.length}\n`;
        }
        if (response.notes.length > 0) {
          result += `📝 Notes: ${response.notes.length}\n`;
        }
      }

      const truncated = truncateMessage(result, "slack");
      await respond({ text: truncated, response_type: "ephemeral" });
    } catch (error) {
      await respond({
        text: formatBotError(error),
        response_type: "ephemeral",
      });
    }
  });
}
