import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";

export function registerStatusCommand(app: App, gaia: GaiaClient) {
  app.command("/status", async ({ command, ack, respond }) => {
    await ack();

    try {
      const status = await gaia.checkAuthStatus("slack", command.user_id);

      if (status.authenticated) {
        await respond({
          text: "✅ Your Slack account is linked to GAIA!\n\nYou can use all commands.",
          response_type: "ephemeral",
        });
      } else {
        const authUrl = gaia.getAuthUrl("slack", command.user_id);
        await respond({
          text: `❌ Not linked yet.\n\n🔗 Link your account: ${authUrl}`,
          response_type: "ephemeral",
        });
      }
    } catch (error) {
      await respond({
        text: "Error checking status. Please try again.",
        response_type: "ephemeral",
      });
    }
  });
}
