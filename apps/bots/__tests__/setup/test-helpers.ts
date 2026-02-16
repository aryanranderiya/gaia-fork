import { MockApiServer } from "./mock-api-server";
import { GaiaClient } from "@gaia/shared";
import type { BotUserContext } from "@gaia/shared";
import type { CommandContext } from "@gaia/shared";

export const TEST_API_KEY = "test-api-key";
export const TEST_FRONTEND_URL = "http://localhost:3000";
export const TEST_USER_ID = "user-123";
export const TEST_CHANNEL_ID = "channel-456";

export const TEST_CTX: BotUserContext = {
  platform: "discord",
  platformUserId: TEST_USER_ID,
};

export const TEST_CMD_CTX: CommandContext = {
  platform: "discord",
  platformUserId: TEST_USER_ID,
  channelId: TEST_CHANNEL_ID,
};

export function createTestClient(server: MockApiServer): GaiaClient {
  return new GaiaClient(server.baseUrl, TEST_API_KEY, TEST_FRONTEND_URL);
}

export function createMockDiscordInteraction(
  overrides: Record<string, unknown> = {},
) {
  const replies: unknown[] = [];
  const edits: unknown[] = [];

  const optionValues = overrides.options as Record<string, string> | undefined;
  const subcommandValue = overrides.subcommand as string | undefined;
  const { options: _, subcommand: __, ...restOverrides } = overrides;

  return {
    user: { id: TEST_USER_ID },
    channelId: TEST_CHANNEL_ID,
    options: {
      getString: (name: string, _required?: boolean) => {
        return optionValues?.[name] ?? null;
      },
      getSubcommand: () => subcommandValue ?? "list",
      getInteger: (_name: string) => null,
    },
    deferReply: async (_opts?: unknown) => {},
    editReply: async (content: unknown) => {
      edits.push(content);
    },
    reply: async (content: unknown) => {
      replies.push(content);
    },
    followUp: async (content: unknown) => {
      replies.push(content);
    },
    _replies: replies,
    _edits: edits,
    ...restOverrides,
  };
}

export function createMockDiscordMessage(
  content: string,
  overrides: Record<string, unknown> = {},
) {
  const replies: unknown[] = [];
  const sentMessages: unknown[] = [];

  const replyMessage = {
    edit: async (text: string) => {
      sentMessages.push(text);
    },
  };

  return {
    content,
    author: { id: TEST_USER_ID, bot: false },
    channelId: TEST_CHANNEL_ID,
    channel: {
      sendTyping: async () => {},
    },
    reply: async (text: string) => {
      replies.push(text);
      return replyMessage;
    },
    _replies: replies,
    _sentMessages: sentMessages,
    ...overrides,
  };
}

export function createMockSlackCommand(
  text: string,
  overrides: Record<string, unknown> = {},
) {
  const responses: unknown[] = [];
  const messages: unknown[] = [];
  const updates: unknown[] = [];
  const ephemeralMessages: unknown[] = [];

  return {
    command: {
      text,
      user_id: TEST_USER_ID,
      channel_id: TEST_CHANNEL_ID,
      ...overrides,
    },
    ack: async () => {},
    respond: async (content: unknown) => {
      responses.push(content);
    },
    client: {
      chat: {
        postMessage: async (opts: unknown) => {
          messages.push(opts);
          return { ts: "msg-ts-123", ok: true };
        },
        postEphemeral: async (opts: unknown) => {
          ephemeralMessages.push(opts);
          return { ok: true };
        },
        update: async (opts: unknown) => {
          updates.push(opts);
          return { ok: true };
        },
      },
    },
    _responses: responses,
    _messages: messages,
    _updates: updates,
    _ephemeralMessages: ephemeralMessages,
  };
}

export function createMockSlackMentionEvent(
  text: string,
  overrides: Record<string, unknown> = {},
) {
  const messages: unknown[] = [];
  const updates: unknown[] = [];

  return {
    event: {
      text,
      user: TEST_USER_ID,
      channel: TEST_CHANNEL_ID,
      ...overrides,
    },
    client: {
      chat: {
        postMessage: async (opts: unknown) => {
          messages.push(opts);
          return { ts: "msg-ts-123", ok: true };
        },
        update: async (opts: unknown) => {
          updates.push(opts);
          return { ok: true };
        },
      },
    },
    _messages: messages,
    _updates: updates,
  };
}

export function createMockTelegramContext(
  text: string,
  overrides: Record<string, unknown> = {},
) {
  const replies: unknown[] = [];
  const edits: unknown[] = [];

  const loadingMsgId = 100;

  return {
    message: { text, ...overrides },
    from: { id: Number(TEST_USER_ID) || 12345 },
    chat: { id: 67890, type: "private" as const },
    match: (overrides.match as string) ?? text.replace(/^\/\w+\s*/, ""),
    reply: async (t: string) => {
      replies.push(t);
      return { message_id: loadingMsgId };
    },
    api: {
      editMessageText: async (_chatId: number, _msgId: number, t: string) => {
        edits.push(t);
      },
    },
    _replies: replies,
    _edits: edits,
    _loadingMsgId: loadingMsgId,
  };
}

export async function waitForStreamComplete(timeMs = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}
