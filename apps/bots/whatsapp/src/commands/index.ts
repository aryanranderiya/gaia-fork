import type { Message } from "whatsapp-web.js";
import type { GaiaClient, CommandContext } from "@gaia/shared";
import {
  truncateMessage,
  dispatchTodoSubcommand,
  dispatchWorkflowSubcommand,
  handleConversationList,
  handleWeather,
  handleSearch,
  handleNewConversation,
} from "@gaia/shared";

type CommandHandler = (
  message: Message,
  gaia: GaiaClient,
  args: string[],
) => Promise<void>;

function getContext(message: Message): CommandContext {
  return {
    platform: "whatsapp",
    platformUserId: message.from,
  };
}

export function registerCommands(
  gaia: GaiaClient,
): Map<string, CommandHandler> {
  const commands = new Map<string, CommandHandler>();

  commands.set("help", async (message) => {
    const helpText =
      "🤖 *GAIA WhatsApp Bot Commands*\n\n" +
      "*General:*\n" +
      "• /help - Show this help message\n" +
      "• /auth - Link your GAIA account\n" +
      "• /gaia <message> - Chat with GAIA\n" +
      "• /new - Start a new conversation\n\n" +
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

  commands.set("auth", async (message, gaia) => {
    const userId = message.from;
    const authUrl = gaia.getAuthUrl("whatsapp", userId);
    await message.reply(
      `🔗 Link your GAIA account:\n${authUrl}\n\nAfter linking, you can use all bot commands!`,
    );
  });

  commands.set("new", async (message, gaia) => {
    const ctx = getContext(message);
    const response = await handleNewConversation(gaia, ctx);
    await message.reply(response);
  });

  commands.set("gaia", async (message, gaia, args) => {
    const userMessage = args.join(" ");
    if (!userMessage) {
      await message.reply("Usage: /gaia <your message>");
      return;
    }

    const ctx = getContext(message);

    try {
      const response = await gaia.chat({
        message: userMessage,
        platform: ctx.platform,
        platformUserId: ctx.platformUserId,
      });

      if (!response.authenticated) {
        const authUrl = gaia.getAuthUrl(ctx.platform, ctx.platformUserId);
        await message.reply(
          `🔗 Please link your GAIA account first:\n${authUrl}\n\nAfter linking, you can chat with GAIA!`,
        );
        return;
      }

      await message.reply(truncateMessage(response.response, "whatsapp"));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await message.reply(`Error: ${errorMessage}`);
    }
  });

  commands.set("workflow", async (message, gaia, args) => {
    const ctx = getContext(message);
    const subcommand = args[0] || "list";
    const remainingArgs = args.slice(1);
    const response = await dispatchWorkflowSubcommand(
      gaia,
      ctx,
      subcommand,
      remainingArgs,
    );
    await message.reply(truncateMessage(response, "whatsapp"));
  });

  commands.set("todo", async (message, gaia, args) => {
    const ctx = getContext(message);
    const subcommand = args[0] || "list";
    const remainingArgs = args.slice(1);
    const response = await dispatchTodoSubcommand(
      gaia,
      ctx,
      subcommand,
      remainingArgs,
    );
    await message.reply(truncateMessage(response, "whatsapp"));
  });

  commands.set("conversations", async (message, gaia) => {
    const ctx = getContext(message);
    const response = await handleConversationList(gaia, ctx);
    await message.reply(truncateMessage(response, "whatsapp"));
  });

  commands.set("weather", async (message, gaia, args) => {
    const ctx = getContext(message);
    const location = args.join(" ");
    if (!location) {
      await message.reply("Usage: /weather <location>");
      return;
    }
    const response = await handleWeather(gaia, location, ctx);
    await message.reply(truncateMessage(response, "whatsapp"));
  });

  commands.set("search", async (message, gaia, args) => {
    const ctx = getContext(message);
    const query = args.join(" ");
    if (!query) {
      await message.reply("Usage: /search <query>");
      return;
    }
    const response = await handleSearch(gaia, query, ctx);
    await message.reply(truncateMessage(response, "whatsapp"));
  });

  return commands;
}
