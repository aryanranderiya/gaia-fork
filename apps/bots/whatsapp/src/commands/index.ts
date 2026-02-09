import type { Message } from "whatsapp-web.js";
import type { GaiaClient } from "@gaia/shared";
import {
  formatWorkflowList,
  formatWorkflow,
  formatTodoList,
  formatTodo,
  formatConversationList,
  formatBotError,
  truncateMessage,
} from "@gaia/shared";

type CommandHandler = (
  message: Message,
  gaia: GaiaClient,
  args: string[],
) => Promise<void>;

export function registerCommands(
  gaia: GaiaClient,
): Map<string, CommandHandler> {
  const commands = new Map<string, CommandHandler>();

  // Help command
  commands.set("help", async (message) => {
    const helpText =
      "🤖 *GAIA WhatsApp Bot Commands*\n\n" +
      "*General:*\n" +
      "• /help - Show this help message\n" +
      "• /auth - Link your GAIA account\n\n" +
      "*Workflows:*\n" +
      "• /workflow list - List workflows\n" +
      "• /workflow get <id> - Get workflow details\n" +
      "• /workflow execute <id> - Execute workflow\n\n" +
      "*Todos:*\n" +
      "• /todo list - List your todos\n" +
      "• /todo add <title> - Create a todo\n" +
      "• /todo complete <id> - Mark as complete\n" +
      "• /todo delete <id> - Delete a todo\n\n" +
      "*Other:*\n" +
      "• /conversations - List recent chats\n" +
      "• /weather <location> - Get weather\n" +
      "• /search <query> - Search your data";

    await message.reply(helpText);
  });

  // Auth command
  commands.set("auth", async (message, gaia) => {
    const userId = message.from;
    const authUrl = gaia.getAuthUrl("whatsapp", userId);
    await message.reply(
      `🔗 Link your GAIA account:\n${authUrl}\n\nAfter linking, you can use all bot commands!`,
    );
  });

  // Workflow commands
  commands.set("workflow", async (message, gaia, args) => {
    const subcommand = args[0] || "list";

    switch (subcommand) {
      case "list": {
        const workflows = await gaia.listWorkflows();
        const response = formatWorkflowList(workflows.workflows);
        await message.reply(truncateMessage(response, "whatsapp"));
        break;
      }

      case "get": {
        const id = args[1];
        if (!id) {
          await message.reply("Usage: /workflow get <workflow-id>");
          return;
        }
        const workflow = await gaia.getWorkflow(id);
        await message.reply(truncateMessage(formatWorkflow(workflow), "whatsapp"));
        break;
      }

      case "execute": {
        const id = args[1];
        if (!id) {
          await message.reply("Usage: /workflow execute <workflow-id>");
          return;
        }
        const result = await gaia.executeWorkflow({ workflow_id: id });
        await message.reply(
          `✅ Workflow execution started!\nExecution ID: ${result.execution_id}\nStatus: ${result.status}`,
        );
        break;
      }

      default:
        await message.reply("Usage: /workflow [list|get|execute]");
    }
  });

  // Todo commands
  commands.set("todo", async (message, gaia, args) => {
    const subcommand = args[0] || "list";

    switch (subcommand) {
      case "list": {
        const todos = await gaia.listTodos({ completed: false });
        const response = formatTodoList(todos.todos);
        await message.reply(truncateMessage(response, "whatsapp"));
        break;
      }

      case "add": {
        const title = args.slice(1).join(" ");
        if (!title) {
          await message.reply("Usage: /todo add <title>");
          return;
        }
        const todo = await gaia.createTodo({ title });
        await message.reply(`✅ Todo created!\n\n${formatTodo(todo)}`);
        break;
      }

      case "complete": {
        const id = args[1];
        if (!id) {
          await message.reply("Usage: /todo complete <todo-id>");
          return;
        }
        const todo = await gaia.completeTodo(id);
        await message.reply(`✅ Todo marked as complete: ${todo.title}`);
        break;
      }

      case "delete": {
        const id = args[1];
        if (!id) {
          await message.reply("Usage: /todo delete <todo-id>");
          return;
        }
        await gaia.deleteTodo(id);
        await message.reply("✅ Todo deleted successfully");
        break;
      }

      default:
        await message.reply("Usage: /todo [list|add|complete|delete]");
    }
  });

  // Conversations command
  commands.set("conversations", async (message, gaia) => {
    const conversations = await gaia.listConversations({ page: 1, limit: 5 });
    const response = formatConversationList(
      conversations.conversations,
      gaia.getBaseUrl(),
    );
    await message.reply(truncateMessage(response, "whatsapp"));
  });

  // Weather command
  commands.set("weather", async (message, gaia, args) => {
    const location = args.join(" ");
    if (!location) {
      await message.reply("Usage: /weather <location>");
      return;
    }

    const response = await gaia.getWeather(location, "whatsapp", message.from);
    await message.reply(truncateMessage(response, "whatsapp"));
  });

  // Search command
  commands.set("search", async (message, gaia, args) => {
    const query = args.join(" ");
    if (!query) {
      await message.reply("Usage: /search <query>");
      return;
    }

    const response = await gaia.search(query);
    const totalResults =
      response.messages.length +
      response.conversations.length +
      response.notes.length;

    let result = `🔍 Search results for: "${query}"\n\n`;
    if (totalResults === 0) {
      result = `No results found for: "${query}"`;
    } else {
      if (response.messages.length > 0) {
        result += `📨 Messages: ${response.messages.length}\n`;
      }
      if (response.conversations.length > 0) {
        result += `💬 Conversations: ${response.conversations.length}\n`;
      }
      if (response.notes.length > 0) {
        result += `📝 Notes: ${response.notes.length}\n`;
      }
    }

    await message.reply(truncateMessage(result, "whatsapp"));
  });

  return commands;
}
