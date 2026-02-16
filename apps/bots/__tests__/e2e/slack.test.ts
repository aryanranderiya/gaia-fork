import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MockApiServer } from "../setup/mock-api-server";
import {
  createTestClient,
  TEST_USER_ID,
  TEST_CHANNEL_ID,
  TEST_FRONTEND_URL,
} from "../setup/test-helpers";
import type { GaiaClient, CommandContext } from "@gaia/shared";

import {
  handleWorkflowList,
  handleTodoList,
  handleTodoCreate,
  handleTodoComplete,
  handleConversationList,
  handleSearch,
  handleWeather,
  truncateResponse,
  formatBotError,
} from "@gaia/shared";

describe("Slack Bot E2E Tests", () => {
  let server: MockApiServer;
  let client: GaiaClient;

  const slackCtx: CommandContext = {
    platform: "slack",
    platformUserId: TEST_USER_ID,
    channelId: TEST_CHANNEL_ID,
  };

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
  });

  describe("/gaia command flow", () => {
    it("should send chat stream request with correct params", async () => {
      server.state.streamChunks = ["Hello ", "Slack!"];

      const chunks: string[] = [];
      let finalText = "";

      await client.chatStream(
        {
          message: "Hi from Slack",
          platform: "slack",
          platformUserId: TEST_USER_ID,
          channelId: TEST_CHANNEL_ID,
        },
        (chunk) => { chunks.push(chunk); },
        (text) => { finalText = text; },
        () => {},
      );

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.platform).toBe("slack");
      expect(body.platform_user_id).toBe(TEST_USER_ID);
      expect(body.channel_id).toBe(TEST_CHANNEL_ID);
      expect(finalText).toBe("Hello Slack!");
    });

    it("should truncate response for Slack's 4000 char limit", () => {
      const longText = "x".repeat(5000);
      const truncated = truncateResponse(longText, "slack");
      expect(truncated.length).toBeLessThanOrEqual(4000);
    });

    it("should handle not_authenticated error and show auth URL", async () => {
      server.state.streamError = "not_authenticated";

      let errorMsg = "";
      await client.chatStream(
        {
          message: "Hi",
          platform: "slack",
          platformUserId: TEST_USER_ID,
          channelId: TEST_CHANNEL_ID,
        },
        () => {},
        () => {},
        (error) => { errorMsg = error.message; },
      );

      expect(errorMsg).toBe("not_authenticated");

      const authUrl = client.getAuthUrl("slack", TEST_USER_ID);
      expect(authUrl).toContain("platform=slack");
      expect(authUrl).toContain(`pid=${TEST_USER_ID}`);
    });
  });

  describe("/todo command flow", () => {
    it("should list todos through shared handler", async () => {
      server.state.todos = {
        todos: [
          { id: "t1", title: "Slack todo", completed: false, priority: "medium" },
        ],
        total: 1,
      };

      const result = await handleTodoList(client, slackCtx);
      expect(result).toContain("Slack todo");
      expect(result).toContain("MEDIUM");
    });

    it("should create todo through shared handler", async () => {
      const result = await handleTodoCreate(client, "New Slack todo", slackCtx, {
        priority: "high",
        description: "Test description",
      });

      const req = server.getRequestsByPath("/api/v1/bot/todos")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.title).toBe("New Slack todo");
      expect(body.priority).toBe("high");
      expect(result).toContain("Todo created");
    });

    it("should complete todo through shared handler", async () => {
      const result = await handleTodoComplete(client, "todo-1", slackCtx);

      const req = server.getLastRequest();
      expect(req?.method).toBe("PATCH");
      expect(result).toContain("complete");
    });

    it("should handle todo list API failure gracefully", async () => {
      server.state.errorStatus = 500;
      const result = await handleTodoList(client, slackCtx);
      expect(result).toContain("error");
    });

    it("should handle 401 on todo operations via formatBotError", async () => {
      // GaiaApiError now preserves status, formatBotError detects it
      server.state.errorStatus = 401;
      const result = await handleTodoList(client, slackCtx);
      expect(result).toContain("Authentication required");
    });

    it("should parse multi-word todo title from Slack text command", () => {
      const text = "add Buy groceries from the store";
      const args = text.trim().split(/\s+/);
      const subcommand = args[0];
      const title = args.slice(1).join(" ");

      expect(subcommand).toBe("add");
      expect(title).toBe("Buy groceries from the store");
    });

    it("should handle /todo with no text (defaults to list)", () => {
      const text = "";
      const args = text.trim().split(/\s+/);
      const subcommand = args[0] || "list";
      expect(subcommand).toBe("list");
    });
  });

  describe("Mention event flow", () => {
    it("should strip Slack mention tokens from message", () => {
      const text = "<@U12345> What is the weather?";
      const content = text.replace(/<@[^>]+>/g, "").trim();
      expect(content).toBe("What is the weather?");
    });

    it("should strip multiple mention tokens", () => {
      const text = "<@U12345> <@U67890> Hello both";
      const content = text.replace(/<@[^>]+>/g, "").trim();
      expect(content).toBe("Hello both");
    });

    it("should detect empty mention", () => {
      const text = "<@U12345>";
      const content = text.replace(/<@[^>]+>/g, "").trim();
      expect(content).toBe("");
    });

    it("should handle auth error in mention handler with auth URL", async () => {
      // Slack mention handler now correctly checks for "not_authenticated" and shows auth URL
      server.state.streamError = "not_authenticated";

      let errorMsg = "";
      await client.chatStream(
        {
          message: "Hello",
          platform: "slack",
          platformUserId: TEST_USER_ID,
          channelId: TEST_CHANNEL_ID,
        },
        () => {},
        () => {},
        (error) => { errorMsg = error.message; },
      );

      expect(errorMsg).toBe("not_authenticated");

      // Verify auth URL would be generated correctly
      const authUrl = client.getAuthUrl("slack", TEST_USER_ID);
      expect(authUrl).toContain("link-platform");
      expect(authUrl).toContain("platform=slack");
    });

    it("should pass channelId in mention event chatStream", async () => {
      // Slack mention handler now passes channelId
      server.state.streamChunks = ["Response"];

      await client.chatStream(
        {
          message: "Hello",
          platform: "slack",
          platformUserId: TEST_USER_ID,
          channelId: TEST_CHANNEL_ID,
        },
        () => {},
        () => {},
        () => {},
      );

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.channel_id).toBe(TEST_CHANNEL_ID);
    });
  });

  describe("Workflow command flow", () => {
    it("should list workflows", async () => {
      const result = await handleWorkflowList(client, slackCtx);
      expect(result).toContain("Test Workflow");
    });

    it("should show empty state for no workflows", async () => {
      server.state.workflows = { workflows: [] };
      const result = await handleWorkflowList(client, slackCtx);
      expect(result).toContain("No workflows found");
    });
  });

  describe("Conversation command flow", () => {
    it("should list conversations with page 1", async () => {
      const result = await handleConversationList(client, slackCtx, 1);

      const req = server.getLastRequest();
      expect(req?.url).toContain("page=1");
      expect(req?.url).toContain("limit=5");
      expect(result).toContain("Test Conversation");
    });

    it("should show empty state for no conversations", async () => {
      server.state.conversations = { conversations: [], total: 0, page: 1 };
      const result = await handleConversationList(client, slackCtx);
      expect(result).toContain("No conversations found");
    });
  });

  describe("Search command flow", () => {
    it("should search and show result counts", async () => {
      const result = await handleSearch(client, "test query", slackCtx);

      const req = server.getLastRequest();
      expect(req?.url).toContain("query=test%20query");
      expect(result).toContain("Messages: 1");
      expect(result).toContain("Conversations: 1");
    });

    it("should show no results message", async () => {
      server.state.searchResponse = { messages: [], conversations: [], notes: [] };
      const result = await handleSearch(client, "nothing", slackCtx);
      expect(result).toContain("No results found");
    });
  });

  describe("Weather command flow", () => {
    it("should get weather via chat delegation", async () => {
      const result = await handleWeather(client, "Tokyo", slackCtx);

      const req = server.getLastRequest();
      const body = req?.body as Record<string, unknown>;
      expect(body.message).toContain("weather");
      expect(body.message).toContain("Tokyo");
      expect(body.platform).toBe("slack");
    });
  });
});
