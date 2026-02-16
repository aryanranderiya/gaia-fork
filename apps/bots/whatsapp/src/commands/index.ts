import type { CommandContext, GaiaClient } from "@gaia/shared";
import {
  dispatchTodoSubcommand,
  dispatchWorkflowSubcommand,
  handleConversationList,
  handleNewConversation,
  truncateResponse,
} from "@gaia/shared";
import type { Message } from "whatsapp-web.js";

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
      "• /conversations - List recent chats";


    await message.reply(helpText);
  });

  commands.set("auth", async (message, gaia) => {
    const userId = message.from;
    try {
      const { authUrl } = await gaia.createLinkToken("whatsapp", userId);
      await message.reply(
        `🔗 Link your GAIA account:\n${authUrl}\n\nAfter linking, you can use all bot commands!`,
      );
    } catch {
      await message.reply("❌ Failed to generate auth link. Please try again.");
    }
  });

  commands.set("new", async (message, gaia) => {
    const ctx = getContext(message);
    const response = await handleNewConversation(gaia, ctx);
    await message.reply(response);
  });

  // TODO: Replace with streaming chat once WhatsApp bot is fully implemented.
  // gaia.chat() (non-streaming) has been removed. Use handleStreamingChat() instead,
  // which requires a message edit callback compatible with WhatsApp's reply API.
  commands.set("gaia", async (message) => {
    await message.reply("Chat is not yet available. Check back soon!");
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
    await message.reply(truncateResponse(response, "whatsapp"));
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
    await message.reply(truncateResponse(response, "whatsapp"));
  });

  commands.set("conversations", async (message, gaia) => {
    const ctx = getContext(message);
    const response = await handleConversationList(gaia, ctx);
    await message.reply(truncateResponse(response, "whatsapp"));
  });





  return commands;
}
