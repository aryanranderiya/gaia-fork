import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import {
  formatWorkflowList,
  formatWorkflow,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("workflow")
  .setDescription("Manage your GAIA workflows")
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List all your workflows"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("get")
      .setDescription("Get details of a specific workflow")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("Workflow ID")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("execute")
      .setDescription("Execute a workflow")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("Workflow ID")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Create a new workflow")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Workflow name")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription("Workflow description")
          .setRequired(true),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  gaia: GaiaClient,
) {
  const userId = interaction.user.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const subcommand = interaction.options.getSubcommand();

    let response: string;

    switch (subcommand) {
      case "list": {
        const workflows = await gaia.listWorkflows();
        response = formatWorkflowList(workflows.workflows);
        break;
      }

      case "get": {
        const id = interaction.options.getString("id", true);
        const workflow = await gaia.getWorkflow(id);
        response = formatWorkflow(workflow);
        break;
      }

      case "execute": {
        const id = interaction.options.getString("id", true);
        const result = await gaia.executeWorkflow({ workflow_id: id });
        response = `✅ Workflow execution started!\nExecution ID: \`${result.execution_id}\`\nStatus: ${result.status}`;
        break;
      }

      case "create": {
        const name = interaction.options.getString("name", true);
        const description = interaction.options.getString("description", true);
        const workflow = await gaia.createWorkflow({ name, description });
        response = `✅ Workflow created!\n\n${formatWorkflow(workflow)}`;
        break;
      }

      default:
        response = "Unknown subcommand";
    }

    const truncated = truncateMessage(response, "discord");
    await interaction.editReply({ content: truncated });
  } catch (error) {
    await interaction.editReply({ content: formatBotError(error) });
  }
}
