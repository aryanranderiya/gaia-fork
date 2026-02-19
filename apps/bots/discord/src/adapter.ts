/**
 * Discord bot adapter for GAIA.
 *
 * Extends {@link BaseBotAdapter} to wire unified commands and events
 * to Discord.js APIs. Handles Discord-specific concerns:
 *
 * - **Slash commands** via `InteractionCreate` events
 * - **Rich embeds** via Discord's native `EmbedBuilder`
 * - **Ephemeral replies** via `MessageFlags.Ephemeral`
 * - **3-second interaction deadline** via auto-deferral
 * - **Typing indicators** via `sendTyping()` with 8s refresh
 * - **DM and @mention** handling via `MessageCreate` events
 *
 * @module
 */

import {
  BaseBotAdapter,
  type BotCommand,
  formatBotError,
  handleStreamingChat,
  type PlatformName,
  type RichMessage,
  type RichMessageTarget,
  type SentMessage,
  STREAMING_DEFAULTS,
} from "@gaia/shared";
import {
  type ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  type Message,
  MessageFlags,
  Partials,
} from "discord.js";

/**
 * Discord-specific implementation of the GAIA bot adapter.
 *
 * Manages the Discord.js `Client` lifecycle and translates between
 * Discord's interaction/message APIs and the unified command system.
 */
export class DiscordAdapter extends BaseBotAdapter {
  readonly platform: PlatformName = "discord";
  private client!: Client;
  private token!: string;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Creates the Discord.js Client with the required intents and partials. */
  protected async initialize(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      throw new Error("DISCORD_BOT_TOKEN is required");
    }
    this.token = token;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
  }

  /**
   * Registers unified commands as Discord slash command handlers.
   *
   * Each command is dispatched via the `InteractionCreate` event. The
   * `/gaia` command is special-cased to use the adapter's streaming
   * `handleGaiaInteraction` method instead of the unified execute function.
   */
  protected async registerCommands(_commands: BotCommand[]): Promise<void> {
    // Commands are dispatched in the InteractionCreate handler in registerEvents
  }

  /**
   * Registers Discord event listeners:
   * - `ClientReady` — logs the bot's tag
   * - `InteractionCreate` — dispatches slash commands
   * - `MessageCreate` — handles DMs and @mentions
   */
  protected async registerEvents(): Promise<void> {
    this.client.once(Events.ClientReady, (c) => {
      console.log(`Discord bot ready as ${c.user.tag}`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      await this.handleInteraction(interaction);
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.partial) {
        try {
          await message.fetch();
        } catch (error) {
          console.error("Failed to fetch partial message:", error);
          return;
        }
      }

      if (message.author.bot) return;
      if (!this.client.user) return;

      const isDM = !message.guild;
      if (!isDM && !message.mentions.has(this.client.user)) return;

      if (isDM) {
        await this.handleDMMessage(message);
      } else {
        await this.handleMentionMessage(message, this.client.user.id);
      }
    });
  }

  /** Logs in to Discord. */
  protected async start(): Promise<void> {
    await this.client.login(this.token);
  }

  /** Destroys the Discord client connection. */
  protected async stop(): Promise<void> {
    this.client.destroy();
  }

  /**
   * Returns the underlying Discord.js Client.
   * Exposed for `deploy-commands.ts` and testing.
   */
  getClient(): Client {
    return this.client;
  }

  // ---------------------------------------------------------------------------
  // Interaction handling
  // ---------------------------------------------------------------------------

  /**
   * Routes a Discord slash command interaction to the appropriate handler.
   *
   * Special-cases the `/gaia` command to use streaming; all other commands
   * go through the unified `dispatchCommand` path.
   */
  private async handleInteraction(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const name = interaction.commandName;

    if (name === "gaia") {
      await this.handleGaiaInteraction(interaction);
      return;
    }

    const target = this.createInteractionTarget(interaction);
    const args = this.extractInteractionArgs(interaction, name);

    await this.dispatchCommand(name, target, args);
  }

  /**
   * Handles the `/gaia` slash command with Discord-specific streaming.
   *
   * Uses a public deferred reply + `editReply` / `followUp` to stream
   * the response while respecting Discord's interaction model.
   */
  private async handleGaiaInteraction(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const message = interaction.options.getString("message", true);
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    await interaction.deferReply();
    let isFirstMessage = true;
    let lastFollowUp: Awaited<ReturnType<typeof interaction.followUp>> | null =
      null;

    await handleStreamingChat(
      this.gaia,
      { message, platform: "discord", platformUserId: userId, channelId },
      async (text: string) => {
        if (isFirstMessage) {
          await interaction.editReply({ content: text });
        } else if (lastFollowUp) {
          await lastFollowUp.edit({ content: text });
        }
      },
      async (text: string) => {
        lastFollowUp = await interaction.followUp({ content: text });
        isFirstMessage = false;
        return async (updatedText: string) => {
          if (lastFollowUp) {
            await lastFollowUp.edit({ content: updatedText });
          }
        };
      },
      async (authUrl: string) => {
        const content = `Please authenticate first: ${authUrl}`;
        if (isFirstMessage) {
          await interaction.editReply({ content });
        } else if (lastFollowUp) {
          await lastFollowUp.edit({ content });
        }
      },
      async (errMsg: string) => {
        if (isFirstMessage) {
          await interaction.editReply({ content: errMsg });
        } else if (lastFollowUp) {
          await lastFollowUp.edit({ content: errMsg });
        }
      },
      STREAMING_DEFAULTS.discord,
    );
  }

  // ---------------------------------------------------------------------------
  // Mention / DM handling
  // ---------------------------------------------------------------------------

  /**
   * Handles DM messages with authenticated streaming.
   *
   * Uses `handleStreamingChat` (requires auth) since DMs are personal
   * and users expect conversation history to be preserved.
   */
  private async handleDMMessage(message: Message): Promise<void> {
    const content = message.content.trim();
    if (!content) {
      await (message.channel as { send: (t: string) => Promise<Message> }).send(
        "How can I help you?",
      );
      return;
    }

    const send = (text: string) =>
      (message.channel as { send: (t: string) => Promise<Message> }).send(text);
    const userId = message.author.id;

    try {
      const hasTyping = "sendTyping" in message.channel;
      if (hasTyping) await message.channel.sendTyping();

      let typingInterval: ReturnType<typeof setInterval> | null = hasTyping
        ? setInterval(async () => {
            try {
              await (
                message.channel as { sendTyping: () => Promise<void> }
              ).sendTyping();
            } catch {}
          }, 8000)
        : null;

      const clearTyping = () => {
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
      };

      let currentMsg: Message | null = null;

      await handleStreamingChat(
        this.gaia,
        {
          message: content,
          platform: "discord",
          platformUserId: userId,
          channelId: message.channelId,
        },
        async (text: string) => {
          clearTyping();
          if (!currentMsg) {
            currentMsg = await send(text);
          } else {
            await currentMsg.edit(text);
          }
        },
        async (text: string) => {
          clearTyping();
          currentMsg = await send(text);
          return async (updatedText: string) => {
            await currentMsg?.edit(updatedText);
          };
        },
        async (authUrl: string) => {
          clearTyping();
          const msg = `Please authenticate first: ${authUrl}`;
          if (!currentMsg) {
            currentMsg = await send(msg);
          } else {
            await currentMsg.edit(msg);
          }
        },
        async (errMsg: string) => {
          clearTyping();
          if (!currentMsg) {
            currentMsg = await send(errMsg);
          } else {
            await currentMsg.edit(errMsg);
          }
        },
        STREAMING_DEFAULTS.discord,
      );

      clearTyping();
    } catch (error) {
      await send(formatBotError(error));
    }
  }

  /**
   * Handles @mention messages in guild channels.
   *
   * Strips the bot's own mention tag, sends a typing indicator, and
   * delegates to `handleStreamingChat` for authenticated guild-scoped streaming.
   */
  private async handleMentionMessage(
    message: Message,
    botId: string,
  ): Promise<void> {
    const content = message.content
      .replace(new RegExp(`<@!?${botId}>`, "g"), "")
      .trim();

    if (!content) {
      await message.reply("How can I help you?");
      return;
    }

    const isDM = !message.guild;
    const send = isDM
      ? (text: string) =>
          (message.channel as { send: (t: string) => Promise<Message> }).send(
            text,
          )
      : (text: string) => message.reply(text);

    try {
      const hasTyping = "sendTyping" in message.channel;
      if (hasTyping) {
        await message.channel.sendTyping();
      }

      let typingInterval: ReturnType<typeof setInterval> | null = hasTyping
        ? setInterval(async () => {
            try {
              await (
                message.channel as { sendTyping: () => Promise<void> }
              ).sendTyping();
            } catch {}
          }, 8000)
        : null;

      const clearTyping = () => {
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
      };

      let currentMsg: Message | null = null;

      const sendOrEdit = async (text: string) => {
        clearTyping();
        if (!currentMsg) {
          currentMsg = await send(text);
        } else {
          await currentMsg.edit(text);
        }
      };

      await handleStreamingChat(
        this.gaia,
        {
          message: content,
          platform: "discord",
          platformUserId: message.author.id,
          channelId: message.channelId,
        },
        sendOrEdit,
        async (text: string) => {
          clearTyping();
          currentMsg = await send(text);
          return async (updatedText: string) => {
            await currentMsg?.edit(updatedText);
          };
        },
        async (authUrl: string) => {
          clearTyping();
          try {
            await message.reply({
              content: `Please link your GAIA account to use me here: ${authUrl}`,
              flags: MessageFlags.Ephemeral,
            });
          } catch {
            // Ephemeral replies unsupported on some message types — fall back publicly
            await sendOrEdit(
              `Please link your GAIA account: ${authUrl}\n\n_This link is for you only — don't share it._`,
            );
          }
        },
        async (errMsg: string) => {
          clearTyping();
          await sendOrEdit(errMsg);
        },
        STREAMING_DEFAULTS.discord,
      );

      clearTyping();
    } catch (error) {
      await send(formatBotError(error));
    }
  }

  // ---------------------------------------------------------------------------
  // Message target factories
  // ---------------------------------------------------------------------------

  /**
   * Creates a {@link RichMessageTarget} from a Discord slash command interaction.
   *
   * Auto-defers the interaction on the first send to avoid the 3-second deadline.
   * Supports ephemeral replies and Discord-native embeds via `sendRich`.
   */
  private createInteractionTarget(
    interaction: ChatInputCommandInteraction,
  ): RichMessageTarget {
    let deferred = false;

    // Defer with the correct visibility on the first send/sendEphemeral/sendRich call.
    // send() → public reply; sendEphemeral()/sendRich() → ephemeral reply.
    const deferIfNeeded = async (ephemeral: boolean) => {
      if (!deferred && !interaction.replied && !interaction.deferred) {
        await interaction.deferReply({
          flags: ephemeral ? MessageFlags.Ephemeral : undefined,
        });
        deferred = true;
      }
    };

    return {
      platform: "discord",
      userId: interaction.user.id,
      channelId: interaction.channelId,
      profile: {
        username: interaction.user.username,
        displayName: interaction.user.globalName ?? interaction.user.username,
      },

      send: async (text: string): Promise<SentMessage> => {
        await deferIfNeeded(false);
        await interaction.editReply({ content: text });
        return {
          id: interaction.id,
          edit: async (t: string) => {
            await interaction.editReply({ content: t });
          },
        };
      },

      sendEphemeral: async (text: string): Promise<SentMessage> => {
        await deferIfNeeded(true);
        await interaction.editReply({ content: text });
        return {
          id: interaction.id,
          edit: async (t: string) => {
            await interaction.editReply({ content: t });
          },
        };
      },

      sendRich: async (msg: RichMessage): Promise<SentMessage> => {
        await deferIfNeeded(false);
        const embed = richMessageToEmbed(msg);
        await interaction.editReply({ embeds: [embed] });
        return {
          id: interaction.id,
          edit: async (t: string) => {
            await interaction.editReply({ content: t, embeds: [] });
          },
        };
      },

      startTyping: async () => {
        return () => {};
      },
    };
  }

  /**
   * Extracts slash command arguments from a Discord interaction.
   *
   * Handles both top-level options and subcommand-specific options,
   * mapping them to a flat `Record<string, ...>` for the unified command system.
   */
  private extractInteractionArgs(
    interaction: ChatInputCommandInteraction,
    commandName: string,
  ): Record<string, string | number | boolean | undefined> {
    const args: Record<string, string | number | boolean | undefined> = {};

    // Check for subcommand first
    try {
      const sub = interaction.options.getSubcommand(false);
      if (sub) {
        args.subcommand = sub;
      }
    } catch {
      // No subcommand — fine
    }

    // Extract known option names based on the command definition
    const command = this.commands.get(commandName);
    if (!command) return args;

    const optionSources = command.subcommands
      ? command.subcommands.flatMap((s) => s.options || [])
      : command.options || [];

    for (const opt of optionSources) {
      try {
        if (opt.type === "integer") {
          const val = interaction.options.getInteger(opt.name);
          if (val !== null) args[opt.name] = val;
        } else if (opt.type === "boolean") {
          const val = interaction.options.getBoolean(opt.name);
          if (val !== null) args[opt.name] = val;
        } else {
          const val = interaction.options.getString(opt.name);
          if (val !== null) args[opt.name] = val;
        }
      } catch {
        // Option not present for this subcommand — fine
      }
    }

    return args;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a {@link RichMessage} to a Discord `EmbedBuilder`.
 *
 * Used by the Discord adapter's `sendRich` method to render structured
 * content using Discord's native embed format.
 *
 * @param msg - The platform-agnostic rich message.
 * @returns A Discord `EmbedBuilder` ready to be sent.
 */
function richMessageToEmbed(msg: RichMessage): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(msg.title);

  if (msg.description) embed.setDescription(msg.description);
  if (msg.color !== undefined) embed.setColor(msg.color);
  if (msg.footer) embed.setFooter({ text: msg.footer });
  if (msg.timestamp) embed.setTimestamp();
  if (msg.thumbnailUrl) embed.setThumbnail(msg.thumbnailUrl);
  if (msg.authorName) {
    embed.setAuthor({
      name: msg.authorName,
      iconURL: msg.authorIconUrl ?? undefined,
    });
  }

  for (const field of msg.fields) {
    embed.addFields({
      name: field.name,
      value: field.value,
      inline: field.inline ?? false,
    });
  }

  if (msg.links && msg.links.length > 0) {
    const linkText = msg.links.map((l) => `[${l.label}](${l.url})`).join(" | ");
    embed.addFields({ name: "🔗 Useful Links", value: linkText });
  }

  return embed;
}
