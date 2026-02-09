import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { GaiaClient } from "@gaia/shared";
import {
  formatTodoList,
  formatTodo,
  formatBotError,
  truncateMessage,
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const subcommand = interaction.options.getSubcommand();
    let response: string;

    switch (subcommand) {
      case "list": {
        const todos = await gaia.listTodos({ completed: false });
        response = formatTodoList(todos.todos);
        break;
      }

      case "add": {
        const title = interaction.options.getString("title", true);
        const priority = interaction.options.getString("priority") as
          | "low"
          | "medium"
          | "high"
          | undefined;
        const description = interaction.options.getString("description") || undefined;

        const todo = await gaia.createTodo({ title, priority, description });
        response = `✅ Todo created!\n\n${formatTodo(todo)}`;
        break;
      }

      case "complete": {
        const id = interaction.options.getString("id", true);
        const todo = await gaia.completeTodo(id);
        response = `✅ Todo marked as complete: ${todo.title}`;
        break;
      }

      case "delete": {
        const id = interaction.options.getString("id", true);
        await gaia.deleteTodo(id);
        response = "✅ Todo deleted successfully";
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
