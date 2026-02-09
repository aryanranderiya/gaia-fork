import type { App } from "@slack/bolt";
import type { GaiaClient } from "@gaia/shared";
import {
  formatTodoList,
  formatTodo,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

export function registerTodoCommand(app: App, gaia: GaiaClient) {
  app.command("/todo", async ({ command, ack, respond }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0] || "list";

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
          if (!title) {
            response = "Usage: /todo add <title>";
            break;
          }
          const todo = await gaia.createTodo({ title });
          response = `✅ Todo created!\n\n${formatTodo(todo)}`;
          break;
        }

        case "complete": {
          const id = args[1];
          if (!id) {
            response = "Usage: /todo complete <todo-id>";
            break;
          }
          const todo = await gaia.completeTodo(id);
          response = `✅ Todo marked as complete: ${todo.title}`;
          break;
        }

        case "delete": {
          const id = args[1];
          if (!id) {
            response = "Usage: /todo delete <todo-id>";
            break;
          }
          await gaia.deleteTodo(id);
          response = "✅ Todo deleted successfully";
          break;
        }

        case "help":
        default: {
          response =
            "Available commands:\n" +
            "• `/todo list` - List your todos\n" +
            "• `/todo add <title>` - Create a new todo\n" +
            "• `/todo complete <id>` - Mark todo as complete\n" +
            "• `/todo delete <id>` - Delete a todo";
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
