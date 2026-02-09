import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import {
  formatWorkflowList,
  formatWorkflow,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

export function registerWorkflowCommand(app: App, gaia: GaiaClient) {
  app.command("/workflow", async ({ command, ack, respond }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0] || "list";

    try {
      let response: string;

      switch (subcommand) {
        case "list": {
          const workflows = await gaia.listWorkflows();
          response = formatWorkflowList(workflows.workflows);
          break;
        }

        case "get": {
          const id = args[1];
          if (!id) {
            response = "Usage: /workflow get <workflow-id>";
            break;
          }
          const workflow = await gaia.getWorkflow(id);
          response = formatWorkflow(workflow);
          break;
        }

        case "execute": {
          const id = args[1];
          if (!id) {
            response = "Usage: /workflow execute <workflow-id>";
            break;
          }
          const result = await gaia.executeWorkflow({ workflow_id: id });
          response = `✅ Workflow execution started!\nExecution ID: \`${result.execution_id}\`\nStatus: ${result.status}`;
          break;
        }

        case "help":
        default: {
          response =
            "Available commands:\n" +
            "• `/workflow list` - List all workflows\n" +
            "• `/workflow get <id>` - Get workflow details\n" +
            "• `/workflow execute <id>` - Execute a workflow";
          break;
        }
      }

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
