import type { Bot } from "grammy";
import type { GaiaClient } from "@gaia/shared";
import {
  formatTodoList,
  formatTodo,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

export function registerTodoCommand(bot: Bot, gaia: GaiaClient) {
  bot.command("todo", async (ctx) => {
    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    const subcommand = args[0] || "list";

    // Fast responses that don't need loading
    if (
      subcommand === "help" ||
      (subcommand === "add" && !args[1]) ||
      (subcommand === "complete" && !args[1]) ||
      (subcommand === "delete" && !args[1])
    ) {
      const usageMap: Record<string, string> = {
        add: "Usage: /todo add <title>",
        complete: "Usage: /todo complete <todo-id>",
        delete: "Usage: /todo delete <todo-id>",
      };
      await ctx.reply(
        usageMap[subcommand] ||
          "Available commands:\n" +
          "/todo list - List your todos\n" +
          "/todo add <title> - Create a new todo\n" +
          "/todo complete <id> - Mark todo as complete\n" +
          "/todo delete <id> - Delete a todo",
      );
      return;
    }

    const loading = await ctx.reply("Loading...");

    try {
      let response: string;

      switch (subcommand) {
        case "list": {
          const todos = await gaia.listTodos({ completed: false });
          response = formatTodoList(todos.todos);
          break;
        }

        case "add": {
          const title = args.slice(1).join(" ");
          const todo = await gaia.createTodo({ title });
          response = `Todo created!\n\n${formatTodo(todo)}`;
          break;
        }

        case "complete": {
          const todo = await gaia.completeTodo(args[1]);
          response = `Todo marked as complete: ${todo.title}`;
          break;
        }

        case "delete": {
          await gaia.deleteTodo(args[1]);
          response = "Todo deleted successfully";
          break;
        }

        default: {
          response = "Unknown subcommand. Use /todo help";
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
