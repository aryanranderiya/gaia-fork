import type { Message } from "whatsapp-web.js";
import type { GaiaClient } from "@gaia/shared";
import { truncateMessage, formatBotError } from "@gaia/shared";

type CommandHandler = (
  message: Message,
  gaia: GaiaClient,
  args: string[],
) => Promise<void>;

/**
 * Handles incoming WhatsApp messages and routes to commands.
 */
export async function handleMessage(
  message: Message,
  gaia: GaiaClient,
  commands: Map<string, CommandHandler>,
) {
  if (message.fromMe || !message.body) return;

  const text = message.body.trim();
  if (!text.startsWith("/")) return;

  const parts = text.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = commands.get(commandName);
  if (!handler) {
    await message.reply(
      "Unknown command. Send /help to see available commands.",
    );
    return;
  }

  try {
    await handler(message, gaia, args);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    await message.reply(formatBotError(error));
  }
}
