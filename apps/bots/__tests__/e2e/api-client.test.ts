import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MockApiServer } from "../setup/mock-api-server";
import { GaiaClient, GaiaApiError } from "@gaia/shared";
import type { BotUserContext } from "@gaia/shared";
import {
  TEST_API_KEY,
  TEST_FRONTEND_URL,
  TEST_USER_ID,
  TEST_CHANNEL_ID,
  TEST_CTX,
  createTestClient,
} from "../setup/test-helpers";

describe("GaiaClient E2E", () => {
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
  });

  describe("Authentication", () => {
    it("should send X-Bot-API-Key header when no JWT token exists", async () => {
      await client.listWorkflows(TEST_CTX);
      const req = server.getLastRequest();
      expect(req?.headers["x-bot-api-key"]).toBe(TEST_API_KEY);
      expect(req?.headers["x-bot-platform"]).toBeUndefined();
      expect(req?.headers["x-bot-platform-user-id"]).toBeUndefined();
    });

    it("should fail with 401 when API key is invalid", async () => {
      const badClient = new GaiaClient(
        server.baseUrl,
        "wrong-key",
        TEST_FRONTEND_URL,
      );
      await expect(badClient.listWorkflows(TEST_CTX)).rejects.toThrow(
        /API error.*401/,
      );
    });

    it("should throw GaiaApiError with status property on auth failure", async () => {
      const badClient = new GaiaClient(
        server.baseUrl,
        "wrong-key",
        TEST_FRONTEND_URL,
      );
      try {
        await badClient.listWorkflows(TEST_CTX);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        expect((error as GaiaApiError).status).toBe(401);
      }
    });
  });

  describe("chat()", () => {
    it("should send correct request body with snake_case field names", async () => {
      await client.chat({
        message: "Hello",
        platform: "discord",
        platformUserId: TEST_USER_ID,
        channelId: TEST_CHANNEL_ID,
      });

      const req = server.getLastRequest();
      expect(req?.body).toEqual({
        message: "Hello",
        platform: "discord",
        platform_user_id: TEST_USER_ID,
        channel_id: TEST_CHANNEL_ID,
      });
    });

    it("should map snake_case API response to camelCase", async () => {
      server.state.chatResponse = {
        response: "Hi there!",
        conversation_id: "conv-abc",
        authenticated: true,
      };

      const result = await client.chat({
        message: "Hello",
        platform: "discord",
        platformUserId: TEST_USER_ID,
      });

      expect(result.response).toBe("Hi there!");
      expect(result.conversationId).toBe("conv-abc");
      expect(result.authenticated).toBe(true);
    });

    it("should handle API returning non-authenticated status", async () => {
      server.state.chatResponse = {
        response: "Please authenticate",
        conversation_id: "",
        authenticated: false,
      };

      const result = await client.chat({
        message: "Hello",
        platform: "discord",
        platformUserId: TEST_USER_ID,
      });

      expect(result.authenticated).toBe(false);
    });

    it("should throw GaiaApiError on 401 error", async () => {
      server.state.errorStatus = 401;
      server.state.errorMessage = "Unauthorized";

      try {
        await client.chat({
          message: "Hello",
          platform: "discord",
          platformUserId: TEST_USER_ID,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        expect((error as GaiaApiError).status).toBe(401);
        expect((error as GaiaApiError).message).toContain("401");
      }
    });

    it("should throw GaiaApiError on 500 error", async () => {
      server.state.errorStatus = 500;

      try {
        await client.chat({
          message: "Hello",
          platform: "discord",
          platformUserId: TEST_USER_ID,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        expect((error as GaiaApiError).status).toBe(500);
      }
    });

    it("should omit channel_id when not provided", async () => {
      await client.chat({
        message: "Hello",
        platform: "slack",
        platformUserId: TEST_USER_ID,
      });

      const req = server.getLastRequest();
      const body = req?.body as Record<string, unknown>;
      expect(body.channel_id).toBeUndefined();
    });
  });

  describe("chatPublic()", () => {
    it("should call the public endpoint", async () => {
      await client.chatPublic({
        message: "Hello",
        platform: "discord",
        platformUserId: TEST_USER_ID,
      });

      const req = server.getLastRequest();
      expect(req?.url).toBe("/api/v1/bot/chat/public");
    });

    it("should always return authenticated: false regardless of server response", async () => {
      server.state.chatResponse = {
        response: "Hi",
        conversation_id: "conv-1",
        authenticated: true,
      };

      const result = await client.chatPublic({
        message: "Hello",
        platform: "discord",
        platformUserId: TEST_USER_ID,
      });

      // chatPublic hardcodes authenticated: false - intentional for public endpoints
      expect(result.authenticated).toBe(false);
    });

    it("should not send channel_id in public chat request", async () => {
      await client.chatPublic({
        message: "Hello",
        platform: "discord",
        platformUserId: TEST_USER_ID,
        channelId: TEST_CHANNEL_ID,
      });

      const req = server.getLastRequest();
      const body = req?.body as Record<string, unknown>;
      expect(body).not.toHaveProperty("channel_id");
    });
  });

  describe("chatStream()", () => {
    it("should stream chunks and call onDone with full text", async () => {
      server.state.streamChunks = ["Hello ", "World!"];
      server.state.streamConversationId = "conv-stream-1";

      const chunks: string[] = [];
      let doneText = "";
      let doneConvId = "";

      await client.chatStream(
        { message: "Hi", platform: "discord", platformUserId: TEST_USER_ID },
        (chunk) => {
          chunks.push(chunk);
        },
        (fullText, convId) => {
          doneText = fullText;
          doneConvId = convId;
        },
        () => {},
      );

      expect(chunks).toEqual(["Hello ", "World!"]);
      expect(doneText).toBe("Hello World!");
      expect(doneConvId).toBe("conv-stream-1");
    });

    it("should handle authentication error in stream", async () => {
      server.state.streamError = "not_authenticated";

      let errorMsg = "";

      await client.chatStream(
        { message: "Hi", platform: "discord", platformUserId: TEST_USER_ID },
        () => {},
        () => {},
        (error) => {
          errorMsg = error.message;
        },
      );

      expect(errorMsg).toBe("not_authenticated");
    });

    it("should return conversation ID", async () => {
      server.state.streamConversationId = "conv-999";

      const convId = await client.chatStream(
        { message: "Hi", platform: "discord", platformUserId: TEST_USER_ID },
        () => {},
        () => {},
        () => {},
      );

      expect(convId).toBe("conv-999");
    });

    it("should send correct request body to stream endpoint", async () => {
      await client.chatStream(
        {
          message: "Hello",
          platform: "telegram",
          platformUserId: "tg-user",
          channelId: "tg-chat",
        },
        () => {},
        () => {},
        () => {},
      );

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      expect(req?.body).toEqual({
        message: "Hello",
        platform: "telegram",
        platform_user_id: "tg-user",
        channel_id: "tg-chat",
      });
    });

    it("should handle empty stream gracefully", async () => {
      server.state.streamChunks = [];

      let doneCalled = false;

      await client.chatStream(
        { message: "Hi", platform: "discord", platformUserId: TEST_USER_ID },
        () => {},
        () => {
          doneCalled = true;
        },
        () => {},
      );

      expect(doneCalled).toBe(true);
    });
  });

  describe("Session Management", () => {
    it("getSession() should send correct URL", async () => {
      await client.getSession("discord", TEST_USER_ID);

      const req = server.getLastRequest();
      expect(req?.url).toContain(`/api/v1/bot/session/discord/${TEST_USER_ID}`);
    });

    it("getSession() should include channel_id as query param", async () => {
      await client.getSession("discord", TEST_USER_ID, TEST_CHANNEL_ID);

      const req = server.getLastRequest();
      expect(req?.url).toContain(`channel_id=${TEST_CHANNEL_ID}`);
    });

    it("getSession() should map snake_case response to camelCase", async () => {
      const result = await client.getSession("discord", TEST_USER_ID);

      // Fixed: getSession now maps conversation_id -> conversationId
      expect(result.conversationId).toBeDefined();
      expect(result.platformUserId).toBeDefined();
    });

    it("resetSession() should send correct request body", async () => {
      await client.resetSession("discord", TEST_USER_ID, TEST_CHANNEL_ID);

      const req = server.getLastRequest();
      expect(req?.body).toEqual({
        platform: "discord",
        platform_user_id: TEST_USER_ID,
        channel_id: TEST_CHANNEL_ID,
      });
    });

    it("resetSession() should map snake_case response to camelCase", async () => {
      const result = await client.resetSession("discord", TEST_USER_ID);

      // Fixed: resetSession now maps conversation_id -> conversationId
      expect(result.conversationId).toBeDefined();
    });

    it("checkAuthStatus() should send correct URL", async () => {
      await client.checkAuthStatus("slack", "slack-user-1");

      const req = server.getLastRequest();
      expect(req?.url).toBe("/api/v1/bot/auth-status/slack/slack-user-1");
    });
  });

  describe("Workflows", () => {
    it("listWorkflows() should return workflows array", async () => {
      const result = await client.listWorkflows(TEST_CTX);
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].name).toBe("Test Workflow");
    });

    it("getWorkflow() should return single workflow", async () => {
      const result = await client.getWorkflow("wf-1", TEST_CTX);
      expect(result.name).toBe("Test Workflow");
    });

    it("getWorkflow() should throw on 404", async () => {
      await expect(client.getWorkflow("nonexistent", TEST_CTX)).rejects.toThrow(
        /API error.*404/,
      );
    });

    it("createWorkflow() should send correct request", async () => {
      const result = await client.createWorkflow(
        {
          name: "My Workflow",
          description: "Does stuff",
        },
        TEST_CTX,
      );

      const req = server.getLastRequest();
      expect((req?.body as Record<string, unknown>).name).toBe("My Workflow");
      expect(result.name).toBe("My Workflow");
    });

    it("executeWorkflow() should send request to correct endpoint", async () => {
      const result = await client.executeWorkflow(
        {
          workflow_id: "wf-1",
          inputs: { key: "value" },
        },
        TEST_CTX,
      );

      const req = server.getLastRequest();
      expect(req?.url).toBe("/api/v1/bot/workflows/wf-1/execute");
      expect(result.execution_id).toBe("exec-123");
      expect(result.status).toBe("running");
    });

    it("deleteWorkflow() should send DELETE request", async () => {
      await client.deleteWorkflow("wf-1", TEST_CTX);
      const req = server.getLastRequest();
      expect(req?.method).toBe("DELETE");
      expect(req?.url).toBe("/api/v1/bot/workflows/wf-1");
    });
  });

  describe("Todos", () => {
    it("listTodos() should send completed filter as query param", async () => {
      await client.listTodos(TEST_CTX, { completed: false });

      const req = server.getLastRequest();
      expect(req?.url).toContain("completed=false");
    });

    it("listTodos() should send project_id filter", async () => {
      await client.listTodos(TEST_CTX, { project_id: "proj-1" });

      const req = server.getLastRequest();
      expect(req?.url).toContain("project_id=proj-1");
    });

    it("createTodo() should send correct request", async () => {
      const result = await client.createTodo(
        {
          title: "Buy groceries",
          priority: "high",
          description: "From the store",
        },
        TEST_CTX,
      );

      const req = server.getLastRequest();
      const body = req?.body as Record<string, unknown>;
      expect(body.title).toBe("Buy groceries");
      expect(body.priority).toBe("high");
      expect(result.title).toBe("Buy groceries");
    });

    it("completeTodo() should send PATCH with completed: true", async () => {
      await client.completeTodo("todo-1", TEST_CTX);

      const req = server.getLastRequest();
      expect(req?.method).toBe("PATCH");
      expect(req?.url).toBe("/api/v1/bot/todos/todo-1");
      expect((req?.body as Record<string, unknown>).completed).toBe(true);
    });

    it("deleteTodo() should send DELETE request", async () => {
      await client.deleteTodo("todo-1", TEST_CTX);

      const req = server.getLastRequest();
      expect(req?.method).toBe("DELETE");
      expect(req?.url).toBe("/api/v1/bot/todos/todo-1");
    });
  });

  describe("Conversations", () => {
    it("listConversations() should use default pagination", async () => {
      await client.listConversations(TEST_CTX);

      const req = server.getLastRequest();
      expect(req?.url).toContain("page=1");
      expect(req?.url).toContain("limit=10");
    });

    it("listConversations() should use custom pagination", async () => {
      await client.listConversations(TEST_CTX, { page: 3, limit: 20 });

      const req = server.getLastRequest();
      expect(req?.url).toContain("page=3");
      expect(req?.url).toContain("limit=20");
    });

    it("getConversation() should fetch by ID", async () => {
      const result = await client.getConversation("conv-1", TEST_CTX);
      expect(result.conversation_id).toBe("conv-1");
    });
  });

  describe("Search", () => {
    it("should encode query parameter", async () => {
      await client.search("hello world", TEST_CTX);

      const req = server.getLastRequest();
      expect(req?.url).toContain("query=hello%20world");
    });

    it("should return search results", async () => {
      const result = await client.search("test", TEST_CTX);
      expect(result.messages).toHaveLength(1);
      expect(result.conversations).toHaveLength(1);
      expect(result.notes).toHaveLength(0);
    });
  });

  describe("Weather", () => {
    it("should delegate to chatPublic() with weather message", async () => {
      const result = await client.getWeather("London", TEST_CTX);

      const req = server.getLastRequest();
      const body = req?.body as Record<string, unknown>;
      expect(body.message).toBe("What's the weather in London?");
      expect(body.platform).toBe("discord");
      expect(body.platform_user_id).toBe(TEST_USER_ID);
      expect(result).toBe("Hello from GAIA!");
    });

    it("should use the /chat/public endpoint for weather", async () => {
      await client.getWeather("London", TEST_CTX);

      const req = server.getLastRequest();
      expect(req?.url).toBe("/api/v1/bot/chat/public");
    });

    it("should preserve GaiaApiError from chatPublic() without re-wrapping", async () => {
      server.state.errorStatus = 500;

      try {
        await client.getWeather("London", TEST_CTX);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        const msg = (error as GaiaApiError).message;
        const apiErrorCount = (msg.match(/API error/g) || []).length;
        // Fixed: GaiaApiError is re-thrown directly, no double-wrapping
        expect(apiErrorCount).toBe(1);
        // Status is preserved
        expect((error as GaiaApiError).status).toBe(500);
      }
    });
  });

  describe("URL Generation", () => {
    it("getAuthUrl() should generate correct URL with encoded params", () => {
      const url = client.getAuthUrl("discord", "user with spaces");
      expect(url).toBe(
        `${TEST_FRONTEND_URL}/auth/link-platform?platform=discord&pid=user%20with%20spaces`,
      );
    });

    it("getAuthUrl() should handle special characters in user ID", () => {
      const url = client.getAuthUrl("telegram", "123&malicious=true");
      expect(url).toContain("pid=123%26malicious%3Dtrue");
    });

    it("getConversationUrl() should generate correct URL", () => {
      const url = client.getConversationUrl("conv-123");
      expect(url).toBe(`${TEST_FRONTEND_URL}/chat/conv-123`);
    });

    it("getBaseUrl() should return API base URL", () => {
      expect(client.getBaseUrl()).toBe(server.baseUrl);
    });

    it("getFrontendUrl() should return frontend URL", () => {
      expect(client.getFrontendUrl()).toBe(TEST_FRONTEND_URL);
    });
  });
});
