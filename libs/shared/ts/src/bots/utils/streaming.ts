/**
 * Shared streaming chat handler for all bot platforms.
 *
 * This module eliminates ~250 lines of duplicated streaming logic across
 * Discord, Slack, and Telegram bots. Each bot provides thin callbacks:
 *
 *   editMessage   - Update the "Thinking..." message with new content
 *   onAuthError   - Show auth URL when user isn't linked
 *   onGenericError - Show formatted error message
 *
 * The shared function handles: text accumulation, throttled message edits
 * (to respect platform rate limits), cursor indicator display, timer
 * cleanup, and error routing through formatBotError.
 *
 * Usage in a bot command file:
 *   import { handleStreamingChat, STREAMING_DEFAULTS } from "@gaia/shared";
 *
 *   await handleStreamingChat(gaia, request, editMessage, onAuth, onErr,
 *     STREAMING_DEFAULTS.discord);
 */
import type { GaiaClient } from "../api";
import type { ChatRequest } from "../types";
import { formatBotError } from "./formatters";
import { truncateResponse } from "./index";

export interface StreamingOptions {
  editIntervalMs: number;
  streaming: boolean;
  platform: "discord" | "slack" | "telegram" | "whatsapp";
}

export type MessageEditor = (text: string) => Promise<void>;
export type NewMessageSender = (text: string) => Promise<MessageEditor>;

export const STREAMING_DEFAULTS: Record<string, StreamingOptions> = {
  discord: {
    editIntervalMs: 1200,
    streaming: false,
    platform: "discord",
  },
  slack: {
    editIntervalMs: 1500,
    streaming: true,
    platform: "slack",
  },
  telegram: {
    editIntervalMs: 1000,
    streaming: true,
    platform: "telegram",
  },
};

/**
 * Internal streaming handler used by both authenticated and mention flows.
 */
async function _handleStream(
  streamFn: (
    onChunk: (text: string) => void | Promise<void>,
    onDone: (fullText: string, conversationId: string) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
  ) => Promise<string>,
  request: ChatRequest,
  gaia: GaiaClient,
  editMessage: MessageEditor,
  sendNewMessage: NewMessageSender | null,
  onAuthError: ((authUrl: string) => Promise<void>) | null,
  onGenericError: (formattedError: string) => Promise<void>,
  options: StreamingOptions,
): Promise<void> {
  const { editIntervalMs, streaming, platform } = options;

  let lastEditTime = 0;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  let fullText = "";
  let streamDone = false;
  let currentEditor = editMessage;
  let sentText = "";

  const updateDisplay = async (text: string) => {
    const truncated = truncateResponse(text, platform);
    try {
      await currentEditor(truncated);
    } catch {
      // Message may have been deleted or interaction expired
    }
  };

  const handleNewMessageBreak = async () => {
    if (!sendNewMessage) return;

    const breakIndex = fullText.indexOf("<NEW_MESSAGE_BREAK>");
    if (breakIndex === -1) return;

    const beforeBreak = fullText.slice(0, breakIndex).trim();
    const afterBreak = fullText.slice(breakIndex + 19);

    if (beforeBreak && beforeBreak !== sentText) {
      await updateDisplay(beforeBreak);
      sentText = beforeBreak;
    }

    currentEditor = await sendNewMessage("Thinking...");
    fullText = afterBreak;
    sentText = "";
  };

  try {
    await streamFn(
      async (chunk) => {
        fullText += chunk;
        if (streamDone || !streaming) return;

        await handleNewMessageBreak();

        const now = Date.now();
        if (now - lastEditTime >= editIntervalMs) {
          lastEditTime = now;
          await updateDisplay(fullText);
        } else if (!editTimer) {
          editTimer = setTimeout(
            async () => {
              editTimer = null;
              if (!streamDone) {
                lastEditTime = Date.now();
                await updateDisplay(fullText);
              }
            },
            editIntervalMs - (now - lastEditTime),
          );
        }
      },
      async (finalText) => {
        streamDone = true;
        if (editTimer) {
          clearTimeout(editTimer);
          editTimer = null;
        }
        fullText = finalText;
        await updateDisplay(finalText);
      },
      async (error) => {
        streamDone = true;
        if (editTimer) {
          clearTimeout(editTimer);
          editTimer = null;
        }
        if (error.message === "not_authenticated" && onAuthError) {
          try {
            const { authUrl } = await gaia.createLinkToken(
              request.platform,
              request.platformUserId,
            );
            await onAuthError(authUrl);
          } catch {
            await onGenericError(
              "Failed to generate auth link. Please try /auth again.",
            );
          }
        } else {
          await onGenericError(formatBotError(error));
        }
      },
    );
  } catch (error) {
    await onGenericError(formatBotError(error));
  }
}

/**
 * Handles streaming chat for authenticated users (slash commands).
 */
export async function handleStreamingChat(
  gaia: GaiaClient,
  request: ChatRequest,
  editMessage: MessageEditor,
  sendNewMessage: NewMessageSender | null,
  onAuthError: (authUrl: string) => Promise<void>,
  onGenericError: (formattedError: string) => Promise<void>,
  options: StreamingOptions,
): Promise<void> {
  return _handleStream(
    (onChunk, onDone, onError) =>
      gaia.chatStream(request, onChunk, onDone, onError),
    request,
    gaia,
    editMessage,
    sendNewMessage,
    onAuthError,
    onGenericError,
    options,
  );
}

/**
 * Handles streaming chat for unauthenticated @mentions.
 * Uses guild-based rate limiting instead of requiring user auth.
 * Does not trigger auth error - just shows generic error on failure.
 */
export async function handleMentionChat(
  gaia: GaiaClient,
  request: ChatRequest,
  editMessage: MessageEditor,
  sendNewMessage: NewMessageSender | null,
  onGenericError: (formattedError: string) => Promise<void>,
  options: StreamingOptions,
): Promise<void> {
  return _handleStream(
    (onChunk, onDone, onError) =>
      gaia.chatMention(request, onChunk, onDone, onError),
    request,
    gaia,
    editMessage,
    sendNewMessage,
    null,
    onGenericError,
    options,
  );
}
