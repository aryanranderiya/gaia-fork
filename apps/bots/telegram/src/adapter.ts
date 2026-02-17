/**
 * Telegram bot adapter for GAIA.
 *
 * Extends {@link BaseBotAdapter} to wire unified commands and events
 * to the grammY framework. Handles Telegram-specific concerns:
 *
 * - **Bot commands** via `bot.command()` with grammY's context
 * - **Rich messages** rendered as markdown (Telegram has no native embed)
 * - **Typing indicator** via `replyWithChatAction("typing")` with 5s refresh
 * - **Private DMs** via `message:text` handler (private chat filter)
 * - **Group @mentions** via `message:text` handler (mentions `@botUsername`)
 * - **Long polling** for message delivery
 *
 * New features gained from the unified command system:
 * - `/help` with rich content (replaces basic `/start` text)
 * - `/settings` command (previously missing)
 * - `/workflow create` subcommand (previously missing)
 * - Group @mention handling (previously missing)
 * - Typing indicator during streaming (previously missing)
 *
 * @module
 */

import {
  BaseBotAdapter,
  type BotCommand,
  handleMentionChat,
  handleStreamingChat,
  type PlatformName,
  parseTextArgs,
  type RichMessage,
  type RichMessageTarget,
  richMessageToMarkdown,
  type SentMessage,
  STREAMING_DEFAULTS,
} from "@gaia/shared";
import { Bot, type Context } from "grammy";

/**
 * Telegram-specific implementation of the GAIA bot adapter.
 *
 * Manages the grammY `Bot` lifecycle and translates between
 * Telegram's command/message APIs and the unified command system.
 */
export class TelegramAdapter extends BaseBotAdapter {
  readonly platform: PlatformName = "telegram";
  private bot!: Bot;
  private token: string;
  private botUsername: string | undefined;

  constructor() {
    super();
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    this.token = token;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Creates the grammY Bot, caches bot username, and registers the error handler. */
  protected async initialize(): Promise<void> {
    this.bot = new Bot(this.token);
    this.bot.catch((err) => {
      console.error("Bot error:", err);
    });
    // Cache the bot username upfront to avoid calling getMe() on every message
    const botInfo = await this.bot.api.getMe();
    this.botUsername = botInfo.username;
  }

  /**
   * Registers unified commands as Telegram bot command handlers.
   *
   * Maps `/start` to the help command, special-cases `/gaia` for streaming,
   * and dispatches all others through the unified command system.
   */
  protected async registerCommands(commands: BotCommand[]): Promise<void> {
    // /start → help command
    this.bot.command("start", async (ctx) => {
      const userId = ctx.from?.id.toString();
      if (!userId) return;

      const target = this.createCtxTarget(ctx, userId);
      await this.dispatchCommand("help", target);
    });

    for (const cmd of commands) {
      if (cmd.name === "gaia") {
        this.registerGaiaCommand();
        continue;
      }

      // Skip "help" as a direct command name since we map /start → help
      // But also register /help as its own command
      const commandName = cmd.name;
      this.bot.command(commandName, async (ctx) => {
        const userId = ctx.from?.id.toString();
        if (!userId) return;

        const target = this.createCtxTarget(ctx, userId);
        const args: Record<string, string | number | boolean | undefined> = {};
        // ctx.match gives text after the /command prefix (grammY strips it)
        const rawText = ctx.match || "";

        if (commandName === "todo" || commandName === "workflow") {
          const parsed = parseTextArgs(rawText);
          args.subcommand = parsed.subcommand;
        }

        await this.dispatchCommand(
          commandName,
          target,
          args,
          rawText || undefined,
        );
      });
    }
  }

  /**
   * Registers non-command event listeners.
   *
   * - Private chat messages → authenticated streaming chat (DMs)
   * - Group messages mentioning `@botUsername` → unauthenticated mention chat
   */
  protected async registerEvents(): Promise<void> {
    this.bot.on("message:text", async (ctx) => {
      if (ctx.message.text.startsWith("/")) return;

      const userId = ctx.from?.id.toString();
      if (!userId) return;

      const isPrivate = ctx.chat.type === "private";

      if (isPrivate) {
        await this.handleTelegramStreaming(ctx, userId, ctx.message.text);
        return;
      }

      // Group @mention handling — uses cached bot username
      if (!this.botUsername) return;
      if (!ctx.message.text.includes(`@${this.botUsername}`)) return;

      const content = ctx.message.text
        .replaceAll(`@${this.botUsername}`, "")
        .trim();

      if (!content) {
        await ctx.reply("How can I help you?");
        return;
      }

      await this.handleTelegramMention(ctx, userId, content);
    });
  }

  /** Starts long polling. */
  protected async start(): Promise<void> {
    this.bot.start({
      onStart: () => console.log("Telegram bot is running"),
    });
  }

  /** Stops the bot. */
  protected async stop(): Promise<void> {
    await this.bot.stop();
  }

  // ---------------------------------------------------------------------------
  // Gaia streaming
  // ---------------------------------------------------------------------------

  /**
   * Registers the `/gaia` command with Telegram-specific streaming.
   */
  private registerGaiaCommand(): void {
    this.bot.command("gaia", async (ctx) => {
      const message = ctx.match;
      const userId = ctx.from?.id.toString();

      if (!userId) return;

      if (!message) {
        await ctx.reply("Usage: /gaia <your message>");
        return;
      }

      await this.handleTelegramStreaming(ctx, userId, message);
    });
  }

  /**
   * Shared streaming handler for `/gaia`, DMs, and @mentions.
   *
   * Sends an initial "Thinking..." message with a typing indicator,
   * then updates it in place as chunks arrive.
   */
  private async handleTelegramStreaming(
    ctx: Context,
    userId: string,
    message: string,
  ): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const loading = await ctx.reply("Thinking...");
    let currentMessageId = loading.message_id;

    // Typing indicator with 5s refresh
    let typingInterval: ReturnType<typeof setInterval> | null = setInterval(
      async () => {
        try {
          await ctx.api.sendChatAction(chatId, "typing");
        } catch {}
      },
      5000,
    );
    try {
      await ctx.api.sendChatAction(chatId, "typing");
    } catch {}

    const clearTyping = () => {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    };

    try {
      await handleStreamingChat(
        this.gaia,
        {
          message,
          platform: "telegram",
          platformUserId: userId,
          channelId: chatId.toString(),
        },
        async (text: string) => {
          try {
            await ctx.api.editMessageText(chatId, currentMessageId, text);
          } catch (e) {
            console.error("Telegram editMessageText error:", e);
          }
        },
        async (text: string) => {
          const newMessage = await ctx.reply(text);
          currentMessageId = newMessage.message_id;
          return async (updatedText: string) => {
            try {
              await ctx.api.editMessageText(
                chatId,
                newMessage.message_id,
                updatedText,
              );
            } catch (e) {
              console.error("Telegram editMessageText error:", e);
            }
          };
        },
        async (authUrl: string) => {
          clearTyping();
          // Send auth URL via DM for privacy in group chats
          const isGroup = ctx.chat?.type !== "private";
          const authMsg = `Please authenticate first.\n\nOpen this link to sign in:\n${authUrl}`;
          try {
            if (isGroup) {
              await ctx.api.sendMessage(Number(userId), authMsg);
              await ctx.api.editMessageText(
                chatId,
                currentMessageId,
                "I sent you a DM with the authentication link.",
              );
            } else {
              await ctx.api.editMessageText(chatId, currentMessageId, authMsg);
            }
          } catch (e) {
            console.error("Telegram auth message error:", e);
          }
        },
        async (errMsg: string) => {
          clearTyping();
          try {
            await ctx.api.editMessageText(chatId, currentMessageId, errMsg);
          } catch (e) {
            console.error("Telegram editMessageText error:", e);
          }
        },
        STREAMING_DEFAULTS.telegram,
      );
    } finally {
      clearTyping();
    }
  }

  /**
   * Handles group @mention messages with unauthenticated streaming.
   *
   * Uses `handleMentionChat` (guild-based rate limiting, no auth required)
   * matching the pattern used by the Discord adapter for @mentions.
   */
  private async handleTelegramMention(
    ctx: Context,
    userId: string,
    message: string,
  ): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const loading = await ctx.reply("Thinking...");
    let currentMessageId = loading.message_id;

    let typingInterval: ReturnType<typeof setInterval> | null = setInterval(
      async () => {
        try {
          await ctx.api.sendChatAction(chatId, "typing");
        } catch {}
      },
      5000,
    );
    try {
      await ctx.api.sendChatAction(chatId, "typing");
    } catch {}

    const clearTyping = () => {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    };

    try {
      await handleMentionChat(
        this.gaia,
        {
          message,
          platform: "telegram",
          platformUserId: userId,
          channelId: chatId.toString(),
        },
        async (text: string) => {
          try {
            await ctx.api.editMessageText(chatId, currentMessageId, text);
          } catch (e) {
            console.error("Telegram editMessageText error:", e);
          }
        },
        async (text: string) => {
          const newMessage = await ctx.reply(text);
          currentMessageId = newMessage.message_id;
          return async (updatedText: string) => {
            try {
              await ctx.api.editMessageText(
                chatId,
                newMessage.message_id,
                updatedText,
              );
            } catch (e) {
              console.error("Telegram editMessageText error:", e);
            }
          };
        },
        async (errMsg: string) => {
          clearTyping();
          try {
            await ctx.api.editMessageText(chatId, currentMessageId, errMsg);
          } catch (e) {
            console.error("Telegram editMessageText error:", e);
          }
        },
        STREAMING_DEFAULTS.telegram,
      );
    } finally {
      clearTyping();
    }
  }

  // ---------------------------------------------------------------------------
  // Message target factory
  // ---------------------------------------------------------------------------

  /**
   * Creates a {@link RichMessageTarget} from a Telegram context.
   *
   * Captures the chat ID and API reference as plain values so the target
   * remains valid after the grammY context's lifecycle ends.
   *
   * @param ctx - The grammY context.
   * @param userId - The Telegram user ID as a string.
   */
  private createCtxTarget(ctx: Context, userId: string): RichMessageTarget {
    const chatId = ctx.chat?.id;
    const api = ctx.api;
    const isGroup = ctx.chat?.type !== "private";

    return {
      platform: "telegram",
      userId,
      channelId: chatId?.toString(),

      send: async (text: string): Promise<SentMessage> => {
        if (!chatId) throw new Error("No chat ID");
        const msg = await api.sendMessage(chatId, text);
        return {
          id: msg.message_id.toString(),
          edit: async (t: string) => {
            try {
              await api.editMessageText(chatId, msg.message_id, t);
            } catch (e) {
              console.error("Telegram editMessageText error:", e);
            }
          },
        };
      },

      sendEphemeral: async (text: string): Promise<SentMessage> => {
        if (!chatId) throw new Error("No chat ID");
        // In groups, DM the user for privacy; in private chats, send normally
        const targetChat = isGroup ? Number(userId) : chatId;
        const msg = await api.sendMessage(targetChat, text);
        if (isGroup) {
          await api.sendMessage(chatId, "I sent you a DM with the details.");
        }
        return {
          id: msg.message_id.toString(),
          edit: async (t: string) => {
            try {
              await api.editMessageText(targetChat, msg.message_id, t);
            } catch (e) {
              console.error("Telegram editMessageText error:", e);
            }
          },
        };
      },

      sendRich: async (richMsg: RichMessage): Promise<SentMessage> => {
        if (!chatId) throw new Error("No chat ID");
        const markdown = richMessageToMarkdown(richMsg, "telegram");
        // In groups, DM rich content for privacy; in private chats, send normally
        const targetChat = isGroup ? Number(userId) : chatId;
        const msg = await api.sendMessage(targetChat, markdown, {
          parse_mode: "Markdown",
        });
        if (isGroup) {
          await api.sendMessage(chatId, "I sent you a DM with the details.");
        }
        return {
          id: msg.message_id.toString(),
          edit: async (t: string) => {
            try {
              await api.editMessageText(targetChat, msg.message_id, t);
            } catch (e) {
              console.error("Telegram editMessageText error:", e);
            }
          },
        };
      },

      startTyping: async () => {
        if (!chatId) return () => {};
        try {
          await api.sendChatAction(chatId, "typing");
        } catch {}
        const interval = setInterval(async () => {
          try {
            await api.sendChatAction(chatId, "typing");
          } catch {}
        }, 5000);
        return () => clearInterval(interval);
      },
    };
  }
}
