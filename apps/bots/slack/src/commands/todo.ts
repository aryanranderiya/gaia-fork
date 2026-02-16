import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import {
  dispatchTodoSubcommand,
  parseTextArgs,
  truncateResponse,
} from "@gaia/shared";

export function registerTodoCommand(app: App, gaia: GaiaClient) {
  app.command("/todo", async ({ command, ack, respond }) => {
    await ack();

    const ctx = {
      platform: "slack" as const,
      platformUserId: command.user_id,
      channelId: command.channel_id,
    };
    const { subcommand, args } = parseTextArgs(command.text);

    const response = await dispatchTodoSubcommand(gaia, ctx, subcommand, args);
    const truncated = truncateResponse(response, "slack");
    await respond({ text: truncated, response_type: "ephemeral" });
  });
}
