import type { Bot } from "grammy";

/**
 * Registers the /start command handler.
 * Sends a welcome message and a list of available commands.
 *
 * @param {Bot} bot - The Telegram Bot instance.
 */
export function registerStartCommand(bot: Bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Welcome to GAIA!\n\n" +
        "General:\n" +
        "/gaia <message> - Chat with GAIA\n" +
        "/auth - Link your Telegram account\n\n" +
        "Workflows:\n" +
        "/workflow list - List workflows\n" +
        "/workflow get <id> - Workflow details\n" +
        "/workflow execute <id> - Run a workflow\n\n" +
        "Todos:\n" +
        "/todo list - List your todos\n" +
        "/todo add <title> - Create a todo\n" +
        "/todo complete <id> - Mark as done\n" +
        "/todo delete <id> - Delete a todo\n\n" +
        "Other:\n" +
        "/conversations - Recent chats\n\n" +
        "You can also send messages directly in private chats.",
    );
  });
}
