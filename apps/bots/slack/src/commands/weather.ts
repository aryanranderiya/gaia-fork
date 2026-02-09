import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { formatBotError, truncateMessage } from "@gaia/shared";

export function registerWeatherCommand(app: App, gaia: GaiaClient) {
  app.command("/weather", async ({ command, ack, respond }) => {
    await ack();

    const location = command.text.trim();
    if (!location) {
      await respond({
        text: "Usage: /weather <location>",
        response_type: "ephemeral",
      });
      return;
    }

    try {
      const response = await gaia.getWeather(
        location,
        "slack",
        command.user_id,
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
