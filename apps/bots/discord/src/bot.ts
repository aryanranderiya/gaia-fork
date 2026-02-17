import { Client, GatewayIntentBits, Events, Partials } from "discord.js";
import { GaiaClient, loadConfig } from "@gaia/shared";
import { registerCommands } from "./commands";
import { handleMention } from "./events/mention";
import { handleInteraction } from "./events/interaction";

/**
 * Initializes and starts the Discord bot.
 * Sets up client intents, commands, and event listeners.
 *
 * @returns {Promise<Client>} The initialized Discord client instance.
 * @throws {Error} If DISCORD_BOT_TOKEN is missing in environment variables.
 */
export async function createBot() {
  const config = loadConfig();
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required");
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  const gaia = new GaiaClient(
    config.gaiaApiUrl,
    config.gaiaApiKey,
    config.gaiaFrontendUrl,
  );
  const commands = registerCommands();

  client.once(Events.ClientReady, (c) => {
    console.log(`Discord bot ready as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteraction(interaction, gaia, commands);
  });

  client.on(Events.MessageCreate, async (message) => {
    // Fetch partial messages
    if (message.partial) {
      try {
        await message.fetch();
      } catch (error) {
        console.error("Failed to fetch partial message:", error);
        return;
      }
    }

    if (message.author.bot) return;
    if (!client.user) return;

    // Handle DMs - all messages in DMs should be processed
    const isDM = !message.guild;

    // In guilds, only respond to mentions; in DMs, respond to all messages
    if (!isDM && !message.mentions.has(client.user)) return;

    await handleMention(message, gaia, client.user.id);
  });

  await client.login(token);
  return client;
}
