import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { MockApiServer } from "../setup/mock-api-server";
import {
  createTestClient,
  createMockDiscordInteraction,
  createMockDiscordMessage,
  TEST_USER_ID,
  TEST_CHANNEL_ID,
  TEST_FRONTEND_URL,
} from "../setup/test-helpers";
import type { GaiaClient } from "@gaia/shared";

// Import the actual command handlers and event handlers
import { execute as executeGaia } from "../../discord/src/commands/gaia";
import { execute as executeTodo } from "../../discord/src/commands/todo";
import { execute as executeNew } from "../../discord/src/commands/new";
import { execute as executeAuth } from "../../discord/src/commands/auth";
import { execute as executeSearch } from "../../discord/src/commands/search";
import { execute as executeWeather } from "../../discord/src/commands/weather";
import { execute as executeConversation } from "../../discord/src/commands/conversation";
import { execute as executeWorkflow } from "../../discord/src/commands/workflow";
import { handleMention } from "../../discord/src/events/mention";

describe("Discord Bot E2E Tests", () => {
  let server: MockApiServer;
  let client: GaiaClient;

  beforeAll(async () => {
    server = new MockApiServer();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.reset();
    client = createTestClient(server);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  describe("/gaia command", () => {
    it("should stream response and show final text", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["Hello ", "Discord ", "user!"];

      const interaction = createMockDiscordInteraction({
        options: { message: "Hi there" },
      });

      await executeGaia(interaction as any, client);

      const edits = interaction._edits;
      const lastEdit = edits[edits.length - 1] as { content: string };

      expect(lastEdit.content).not.toContain("▌");
      expect(lastEdit.content).toContain("Hello Discord user!");
    });

    it("should defer reply as ephemeral", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["Hi"];

      const deferCalls: unknown[] = [];
      const interaction = createMockDiscordInteraction({
        options: { message: "Hi" },
        deferReply: async (opts: unknown) => { deferCalls.push(opts); },
      });

      await executeGaia(interaction as any, client);

      expect(deferCalls.length).toBe(1);
      expect(deferCalls[0]).toHaveProperty("flags");
    });

    it("should show auth URL on not_authenticated error", async () => {
      vi.useRealTimers();
      server.state.streamError = "not_authenticated";

      const interaction = createMockDiscordInteraction({
        options: { message: "Hi" },
      });

      await executeGaia(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("authenticate");
      expect(lastEdit.content).toContain(TEST_FRONTEND_URL);
      expect(lastEdit.content).toContain("link-platform");
    });

    it("should send correct platform and user ID in API request", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["Response"];

      const interaction = createMockDiscordInteraction({
        options: { message: "Hello" },
      });

      await executeGaia(interaction as any, client);

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.platform).toBe("discord");
      expect(body.platform_user_id).toBe(TEST_USER_ID);
      expect(body.channel_id).toBe(TEST_CHANNEL_ID);
    });

    it("should truncate response for Discord's 2000 char limit", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["x".repeat(2500)];

      const interaction = createMockDiscordInteraction({
        options: { message: "Hi" },
      });

      await executeGaia(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content.length).toBeLessThanOrEqual(2000);
    });

    it("should show generic error on API failure", async () => {
      vi.useRealTimers();
      server.state.streamError = "internal_server_error";

      const interaction = createMockDiscordInteraction({
        options: { message: "Hi" },
      });

      await executeGaia(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("error");
    });
  });

  describe("/todo command", () => {
    it("should list incomplete todos", async () => {
      vi.useRealTimers();
      server.state.todos = {
        todos: [
          { id: "t1", title: "Buy milk", completed: false, priority: "high" },
          { id: "t2", title: "Write tests", completed: false },
        ],
        total: 2,
      };

      const interaction = createMockDiscordInteraction({
        subcommand: "list",
      });

      await executeTodo(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("Buy milk");
      expect(lastEdit.content).toContain("Write tests");
    });

    it("should create a todo with title and priority", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        subcommand: "add",
        options: { title: "New task", priority: "high" },
      });

      await executeTodo(interaction as any, client);

      const req = server.getRequestsByPath("/api/v1/bot/todos")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.title).toBe("New task");
      expect(body.priority).toBe("high");

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("Todo created");
    });

    it("should complete a todo by ID", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        subcommand: "complete",
        options: { id: "todo-1" },
      });

      await executeTodo(interaction as any, client);

      const req = server.getLastRequest();
      expect(req?.method).toBe("PATCH");
      expect(req?.url).toBe("/api/v1/bot/todos/todo-1");

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("complete");
    });

    it("should delete a todo by ID", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        subcommand: "delete",
        options: { id: "todo-1" },
      });

      await executeTodo(interaction as any, client);

      const req = server.getLastRequest();
      expect(req?.method).toBe("DELETE");

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("deleted");
    });

    it("should show error on API failure", async () => {
      vi.useRealTimers();
      server.state.errorStatus = 500;

      const interaction = createMockDiscordInteraction({
        subcommand: "list",
      });

      await executeTodo(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("error");
    });

    it("should show Authentication required for 401 via formatBotError", async () => {
      vi.useRealTimers();
      server.state.errorStatus = 401;

      const interaction = createMockDiscordInteraction({
        subcommand: "list",
      });

      await executeTodo(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      // GaiaApiError preserves status, formatBotError detects it
      expect(lastEdit.content).toContain("Authentication required");
    });
  });

  describe("/new command", () => {
    it("should reset session and confirm", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction();

      await executeNew(interaction as any, client);

      const req = server.getRequestsByPath("/api/v1/bot/session/new")[0];
      expect(req).toBeDefined();
      expect((req?.body as Record<string, unknown>).platform).toBe("discord");

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("new conversation");
    });

    it("should handle reset session failure", async () => {
      vi.useRealTimers();
      server.state.errorStatus = 500;

      const interaction = createMockDiscordInteraction();

      await executeNew(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("Failed");
    });
  });

  describe("Mention handler", () => {
    it("should respond to mention with streaming", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["Hello ", "there!"];

      const message = createMockDiscordMessage("<@12345> Hello bot");

      await handleMention(message as any, client);

      expect(message._replies.length).toBeGreaterThanOrEqual(1);
      expect(message._sentMessages.length).toBeGreaterThanOrEqual(1);
      const lastMsg = message._sentMessages[message._sentMessages.length - 1] as string;
      expect(lastMsg).toContain("Hello there!");
    });

    it("should strip mention tokens from message content", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["Response"];

      const message = createMockDiscordMessage("<@12345> <@!67890> What is the weather?");

      await handleMention(message as any, client);

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.message).toBe("What is the weather?");
    });

    it("should reply 'How can I help you?' for empty mention", async () => {
      vi.useRealTimers();
      const message = createMockDiscordMessage("<@12345>");

      await handleMention(message as any, client);

      expect(message._replies).toContain("How can I help you?");
    });

    it("should reply 'How can I help you?' for whitespace-only mention", async () => {
      vi.useRealTimers();
      const message = createMockDiscordMessage("<@12345>   ");

      await handleMention(message as any, client);

      expect(message._replies).toContain("How can I help you?");
    });

    it("should show auth URL on not_authenticated error", async () => {
      // Mention handler correctly checks for "not_authenticated" and shows auth URL
      vi.useRealTimers();
      server.state.streamError = "not_authenticated";

      const message = createMockDiscordMessage("<@12345> Hello");

      await handleMention(message as any, client);

      const lastMsg = message._sentMessages[message._sentMessages.length - 1] as string;
      expect(lastMsg).toContain("link your account");
      expect(lastMsg).toContain("link-platform");
    });

    it("should pass channelId to chatStream for mentions", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["Response"];

      const message = createMockDiscordMessage("<@12345> Hello");

      await handleMention(message as any, client);

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      const body = req?.body as Record<string, unknown>;
      // Mention handler passes channelId from message.channelId
      expect(body.channel_id).toBe(TEST_CHANNEL_ID);
    });

    it("should truncate long responses", async () => {
      vi.useRealTimers();
      server.state.streamChunks = ["x".repeat(2500)];

      const message = createMockDiscordMessage("<@12345> Hello");

      await handleMention(message as any, client);

      const lastMsg = message._sentMessages[message._sentMessages.length - 1] as string;
      expect(lastMsg.length).toBeLessThanOrEqual(2000);
    });
  });

  describe("/workflow command", () => {
    it("should list workflows", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        subcommand: "list",
      });

      await executeWorkflow(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("Test Workflow");
    });

    it("should send user context headers", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        subcommand: "list",
      });

      await executeWorkflow(interaction as any, client);

      const req = server.getRequestsByPath("/api/v1/bot/workflows")[0];
      expect(req?.headers["x-bot-platform"]).toBe("discord");
      expect(req?.headers["x-bot-platform-user-id"]).toBe(TEST_USER_ID);
    });
  });

  describe("/search command", () => {
    it("should search and show results", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        options: { query: "test query" },
      });

      await executeSearch(interaction as any, client);

      const req = server.getRequestsByPath("/api/v1/bot/search")[0];
      expect(req?.url).toContain("query=test%20query");

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("Messages: 1");
    });
  });

  describe("/weather command", () => {
    it("should get weather and show result", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        options: { location: "London" },
      });

      await executeWeather(interaction as any, client);

      const req = server.getLastRequest();
      const body = req?.body as Record<string, unknown>;
      expect(body.message).toContain("weather");
      expect(body.message).toContain("London");

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("Hello from GAIA!");
    });
  });

  describe("/conversations command", () => {
    it("should list conversations", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction({
        subcommand: "list",
      });

      await executeConversation(interaction as any, client);

      const lastEdit = interaction._edits[interaction._edits.length - 1] as { content: string };
      expect(lastEdit.content).toContain("Test Conversation");
    });
  });

  describe("/auth command", () => {
    it("should show auth URL for user", async () => {
      vi.useRealTimers();
      const interaction = createMockDiscordInteraction();

      await executeAuth(interaction as any, client);

      const lastReply = interaction._replies[interaction._replies.length - 1] as { content: string };
      expect(lastReply.content).toContain("Link your Discord to GAIA");
      expect(lastReply.content).toContain(TEST_FRONTEND_URL);
      expect(lastReply.content).toContain("link-platform");
      expect(lastReply.content).toContain(`pid=${TEST_USER_ID}`);
    });
  });
});
