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
import { truncateResponse } from "./index";
import { formatBotError } from "./formatters";

export interface StreamingOptions {
  editIntervalMs: number;
  cursorIndicator: string;
  platform: "discord" | "slack" | "telegram" | "whatsapp";
}

export type MessageEditor = (text: string) => Promise<void>;

export const STREAMING_DEFAULTS: Record<string, StreamingOptions> = {
  discord: {
    editIntervalMs: 1200,
    cursorIndicator: " ▌",
    platform: "discord",
  },
  slack: {
    editIntervalMs: 1500,
    cursorIndicator: " ...",
    platform: "slack",
  },
  telegram: {
    editIntervalMs: 1000,
    cursorIndicator: " ▌",
    platform: "telegram",
  },
};

export async function handleStreamingChat(
  gaia: GaiaClient,
  request: ChatRequest,
  editMessage: MessageEditor,
  onAuthError: (authUrl: string) => Promise<void>,
  onGenericError: (formattedError: string) => Promise<void>,
  options: StreamingOptions,
): Promise<void> {
  const { editIntervalMs, cursorIndicator, platform } = options;

  let lastEditTime = 0;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  let fullText = "";
  let streamDone = false;

  const updateDisplay = async (text: string, cursor = true) => {
    const display = cursor ? `${text}${cursorIndicator}` : text;
    const truncated = truncateResponse(display, platform);
    try {
      await editMessage(truncated);
    } catch {
      // Message may have been deleted or interaction expired
    }
  };

  try {
    await gaia.chatStream(
      request,
      async (chunk) => {
        fullText += chunk;
        if (streamDone) return;
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
        await updateDisplay(finalText, false);
      },
      async (error) => {
        streamDone = true;
        if (editTimer) {
          clearTimeout(editTimer);
          editTimer = null;
        }
        if (error.message === "not_authenticated") {
          const authUrl = gaia.getAuthUrl(
            request.platform,
            request.platformUserId,
          );
          await onAuthError(authUrl);
        } else {
          await onGenericError(formatBotError(error));
        }
      },
    );
  } catch (error) {
    await onGenericError(formatBotError(error));
  }
}
