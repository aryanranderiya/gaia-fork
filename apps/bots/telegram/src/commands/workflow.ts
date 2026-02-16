import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import {
  dispatchWorkflowSubcommand,
  parseTextArgs,
  truncateResponse,
} from "@gaia/shared";

export function registerWorkflowCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("workflow", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const userCtx = {
      platform: "telegram" as const,
      platformUserId: userId,
      channelId: ctx.chat.id.toString(),
    };
    const { subcommand, args } = parseTextArgs(
      ctx.message?.text || "",
      true,
    );

    const loading = await ctx.reply("Loading...");

    const response = await dispatchWorkflowSubcommand(
      gaia,
      userCtx,
      subcommand,
      args,
    );
    const truncated = truncateResponse(response, "telegram");
    await ctx.api.editMessageText(
      ctx.chat.id,
      loading.message_id,
      truncated,
    );
  });
}
