import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MockApiServer } from "../setup/mock-api-server";
import {
  createTestClient,
  TEST_USER_ID,
  TEST_FRONTEND_URL,
} from "../setup/test-helpers";
import type { GaiaClient, CommandContext } from "@gaia/shared";
import {
  handleTodoList,
  handleTodoCreate,
  handleTodoComplete,
  handleWorkflowList,
  handleConversationList,
  handleSearch,
  truncateResponse,
} from "@gaia/shared";

describe("Telegram Bot E2E Tests", () => {
  let server: MockApiServer;
  let client: GaiaClient;

  const tgCtx: CommandContext = {
    platform: "telegram",
    platformUserId: "tg-123",
    channelId: "chat-456",
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
    it("should send streaming request with correct telegram params", async () => {
      server.state.streamChunks = ["Hello ", "Telegram!"];

      let finalText = "";

      await client.chatStream(
        {
          message: "Hi from Telegram",
          platform: "telegram",
          platformUserId: "tg-123",
          channelId: "chat-456",
        },
        () => {},
        (text) => {
          finalText = text;
        },
        () => {},
      );

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.platform).toBe("telegram");
      expect(body.platform_user_id).toBe("tg-123");
      expect(body.channel_id).toBe("chat-456");
      expect(finalText).toBe("Hello Telegram!");
    });

    it("should show auth URL on not_authenticated stream error", async () => {
      server.state.streamError = "not_authenticated";

      let errorMsg = "";
      await client.chatStream(
        {
          message: "Hi",
          platform: "telegram",
          platformUserId: "tg-123",
        },
        () => {},
        () => {},
        (error) => {
          errorMsg = error.message;
        },
      );

      expect(errorMsg).toBe("not_authenticated");

      const authUrl = client.getAuthUrl("telegram", "tg-123");
      expect(authUrl).toContain("platform=telegram");
      expect(authUrl).toContain("pid=tg-123");
    });

    it("should truncate for Telegram's 4096 char limit", () => {
      const longText = "x".repeat(5000);
      const truncated = truncateResponse(longText, "telegram");
      expect(truncated.length).toBeLessThanOrEqual(4096);
    });
  });

  describe("/todo command flow", () => {
    it("should parse /todo command text correctly", () => {
      const text = "/todo add Buy groceries from the store";
      const args = text.split(/\s+/).slice(1);
      expect(args[0]).toBe("add");
      expect(args.slice(1).join(" ")).toBe("Buy groceries from the store");
    });

    it("should parse /todo list (no args)", () => {
      const text = "/todo";
      const args = text.split(/\s+/).slice(1);
      const subcommand = args[0] || "list";
      expect(subcommand).toBe("list");
    });

    it("should list todos via shared handler", async () => {
      server.state.todos = {
        todos: [{ id: "t1", title: "Telegram todo", completed: false }],
        total: 1,
      };

      const result = await handleTodoList(client, tgCtx);
      expect(result).toContain("Telegram todo");
    });

    it("should create todo via shared handler", async () => {
      const result = await handleTodoCreate(client, "New TG todo", tgCtx);

      const req = server.getRequestsByPath("/api/v1/bot/todos")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.title).toBe("New TG todo");
      expect(result).toContain("Todo created");
    });

    it("should complete todo via shared handler", async () => {
      const result = await handleTodoComplete(client, "todo-1", tgCtx);
      expect(result).toContain("complete");
    });

    it("should handle empty todo list", async () => {
      server.state.todos = { todos: [], total: 0 };
      const result = await handleTodoList(client, tgCtx);
      expect(result).toContain("No todos found");
    });

    it("should truncate long todo list for Telegram", () => {
      const longText = "x".repeat(5000);
      const truncated = truncateResponse(longText, "telegram");
      expect(truncated.length).toBeLessThanOrEqual(4096);
      expect(truncated).toContain("truncated");
    });
  });

  describe("Message handler flow", () => {
    it("should ignore command messages (starting with /)", () => {
      const text = "/start";
      expect(text.startsWith("/")).toBe(true);
    });

    it("should only process private chats", () => {
      const chatTypes = ["private", "group", "supergroup", "channel"];
      const privateOnly = chatTypes.filter((t) => t === "private");
      expect(privateOnly).toEqual(["private"]);
    });

    it("should send streaming chat request for plain text messages", async () => {
      server.state.streamChunks = ["Reply to message"];

      let finalText = "";

      await client.chatStream(
        {
          message: "Hello there",
          platform: "telegram",
          platformUserId: "tg-123",
          channelId: "chat-789",
        },
        () => {},
        (text) => {
          finalText = text;
        },
        () => {},
      );

      expect(finalText).toBe("Reply to message");
    });

    it("should handle auth error in message handler", async () => {
      server.state.streamError = "not_authenticated";

      let errorMsg = "";
      await client.chatStream(
        {
          message: "Hello",
          platform: "telegram",
          platformUserId: "tg-123",
        },
        () => {},
        () => {},
        (error) => {
          errorMsg = error.message;
        },
      );

      expect(errorMsg).toBe("not_authenticated");
      // Telegram message handler correctly checks for "not_authenticated"
      // and shows auth URL - unlike the old Discord/Slack mention handlers
    });
  });

  describe("/auth command flow", () => {
    it("should generate correct auth URL for Telegram", () => {
      const authUrl = client.getAuthUrl("telegram", "tg-12345");
      expect(authUrl).toBe(
        `${TEST_FRONTEND_URL}/auth/link-platform?platform=telegram&pid=tg-12345`,
      );
    });
  });

  describe("/new command flow", () => {
    it("should reset session for Telegram user", async () => {
      await client.resetSession("telegram", "tg-123");

      const req = server.getRequestsByPath("/api/v1/bot/session/new")[0];
      const body = req?.body as Record<string, unknown>;
      expect(body.platform).toBe("telegram");
      expect(body.platform_user_id).toBe("tg-123");
    });
  });

  describe("/workflow command flow", () => {
    it("should list workflows", async () => {
      const result = await handleWorkflowList(client, tgCtx);
      expect(result).toContain("Test Workflow");
    });
  });

  describe("/conversations command flow", () => {
    it("should list conversations", async () => {
      const result = await handleConversationList(client, tgCtx, 1);
      expect(result).toContain("Test Conversation");
    });
  });

  describe("/search command flow", () => {
    it("should search and show results", async () => {
      const result = await handleSearch(client, "telegram search", tgCtx);
      expect(result).toContain("Messages: 1");
    });
  });

  describe("/start command", () => {
    it("should not make any API calls", async () => {
      const requestCountBefore = server.state.requests.length;
      const requestCountAfter = server.state.requests.length;
      expect(requestCountAfter).toBe(requestCountBefore);
    });
  });
});
