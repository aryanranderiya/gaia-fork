import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import {
  handleTodoList,
  handleTodoCreate,
  handleTodoComplete,
  handleTodoDelete,
  truncateResponse,
} from "@gaia/shared";

export const data = new SlashCommandBuilder()
  .setName("todo")
  .setDescription("Manage your todos")
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List your todos"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Add a new todo")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("Todo title")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("priority")
          .setDescription("Priority level")
          .addChoices(
            { name: "Low", value: "low" },
            { name: "Medium", value: "medium" },
            { name: "High", value: "high" },
          ),
      )
      .addStringOption((option) =>
        option.setName("description").setDescription("Todo description"),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("complete")
      .setDescription("Mark a todo as complete")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("Todo ID")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a todo")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("Todo ID")
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
      response = await handleTodoList(gaia, ctx, false);
      break;
    case "add": {
      const title = interaction.options.getString("title", true);
      const priority = interaction.options.getString("priority") as
        | "low"
        | "medium"
        | "high"
        | undefined;
      const description =
        interaction.options.getString("description") || undefined;
      response = await handleTodoCreate(gaia, title, ctx, {
        priority,
        description,
      });
      break;
    }
    case "complete": {
      const id = interaction.options.getString("id", true);
      response = await handleTodoComplete(gaia, id, ctx);
      break;
    }
    case "delete": {
      const id = interaction.options.getString("id", true);
      response = await handleTodoDelete(gaia, id, ctx);
      break;
    }
    default:
      response = "Unknown subcommand";
  }

  const truncated = truncateResponse(response, "discord");
  await interaction.editReply({ content: truncated });
}
