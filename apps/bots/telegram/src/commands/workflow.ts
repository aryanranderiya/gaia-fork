import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import {
  formatWorkflowList,
  formatWorkflow,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

export function registerWorkflowCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("workflow", async (ctx) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    const subcommand = args[0] || "list";

    // Fast responses that don't need loading
    if (subcommand === "help" || (subcommand === "get" && !args[1]) || (subcommand === "execute" && !args[1])) {
      const usageMap: Record<string, string> = {
        get: "Usage: /workflow get <workflow-id>",
        execute: "Usage: /workflow execute <workflow-id>",
      };
      await ctx.reply(
        usageMap[subcommand] ||
          "Available commands:\n" +
          "/workflow list - List all workflows\n" +
          "/workflow get <id> - Get workflow details\n" +
          "/workflow execute <id> - Execute a workflow",
      );
      return;
    }

    const loading = await ctx.reply("Loading...");

    try {
      let response: string;

      switch (subcommand) {
        case "list": {
          const workflows = await gaia.listWorkflows();
          response = formatWorkflowList(workflows.workflows);
          break;
        }

        case "get": {
          const workflow = await gaia.getWorkflow(args[1]);
          response = formatWorkflow(workflow);
          break;
        }

        case "execute": {
          const result = await gaia.executeWorkflow({ workflow_id: args[1] });
          response = `Workflow execution started!\nExecution ID: ${result.execution_id}\nStatus: ${result.status}`;
          break;
        }

        default: {
          response = "Unknown subcommand. Use /workflow help";
          break;
        }
      }

      const truncated = truncateMessage(response, "telegram");
      await ctx.api.editMessageText(
        ctx.chat.id,
        loading.message_id,
        truncated,
      );
    } catch (error) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        loading.message_id,
        formatBotError(error),
      );
    }
  });
}
