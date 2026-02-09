import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";

export function registerAuthCommand(app: App, gaia: GaiaClient) {
  app.command("/auth", async ({ command, ack, respond }) => {
    await ack();

    const userId = command.user_id;
    const authUrl = gaia.getAuthUrl("slack", userId);

    await respond({
      text: `🔗 *Link your Slack to GAIA*\n\nClick the link below to sign in with GAIA and link your Slack account:\n${authUrl}\n\n_After linking, you'll be able to use all GAIA commands directly from Slack!_`,
      response_type: "ephemeral",
    });
  });
}
