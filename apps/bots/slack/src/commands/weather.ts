import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import { handleWeather, truncateResponse } from "@gaia/shared";

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

    const ctx = {
      platform: "slack" as const,
      platformUserId: command.user_id,
      channelId: command.channel_id,
    };

    const response = await handleWeather(gaia, location, ctx);
    const truncated = truncateResponse(response, "slack");
    await respond({ text: truncated, response_type: "ephemeral" });
  });
}
