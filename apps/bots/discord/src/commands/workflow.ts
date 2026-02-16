import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import {
  handleWorkflowList,
  handleWorkflowGet,
  handleWorkflowCreate,
  handleWorkflowExecute,
  truncateResponse,
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
        option.setName("id").setDescription("Workflow ID").setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("execute")
      .setDescription("Execute a workflow")
      .addStringOption((option) =>
        option.setName("id").setDescription("Workflow ID").setRequired(true),
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
  const ctx = {
    platform: "discord" as const,
    platformUserId: userId,
    channelId: interaction.channelId,
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let response: string;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "list":
      response = await handleWorkflowList(gaia, ctx);
      break;
    case "get": {
      const id = interaction.options.getString("id", true);
      response = await handleWorkflowGet(gaia, id, ctx);
      break;
    }
    case "execute": {
      const id = interaction.options.getString("id", true);
      response = await handleWorkflowExecute(gaia, id, ctx);
      break;
    }
    case "create": {
      const name = interaction.options.getString("name", true);
      const description = interaction.options.getString("description", true);
      response = await handleWorkflowCreate(gaia, name, ctx, description);
      break;
    }
    default:
      response = "Unknown subcommand";
  }

  const truncated = truncateResponse(response, "discord");
  await interaction.editReply({ content: truncated });
}
