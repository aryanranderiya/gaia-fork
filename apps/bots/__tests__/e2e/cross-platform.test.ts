import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MockApiServer } from "../setup/mock-api-server";
import { createTestClient, TEST_USER_ID, TEST_CHANNEL_ID, TEST_FRONTEND_URL } from "../setup/test-helpers";
import type { GaiaClient, CommandContext } from "@gaia/shared";
import {
  truncateResponse,
  formatBotError,
  handleSearch,
  handleTodoList,
  handleWorkflowList,
  handleConversationList,
} from "@gaia/shared";

describe("Cross-Platform Consistency Tests", () => {
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

  describe("API Request Format Consistency", () => {
    const platforms = ["discord", "slack", "telegram"] as const;

    for (const platform of platforms) {
      it(`should send consistent request format for ${platform} chat`, async () => {
        await client.chat({
          message: "Hello",
          platform,
          platformUserId: TEST_USER_ID,
          channelId: TEST_CHANNEL_ID,
        });

        const req = server.getLastRequest();
        const body = req?.body as Record<string, unknown>;

        // All platforms should use snake_case for API
        expect(body).toHaveProperty("message", "Hello");
        expect(body).toHaveProperty("platform", platform);
        expect(body).toHaveProperty("platform_user_id", TEST_USER_ID);
        expect(body).toHaveProperty("channel_id", TEST_CHANNEL_ID);

        // Should NOT have camelCase keys
        expect(body).not.toHaveProperty("platformUserId");
        expect(body).not.toHaveProperty("channelId");
      });
    }

    for (const platform of platforms) {
      it(`should send consistent stream request format for ${platform}`, async () => {
        server.state.streamChunks = ["Hi"];

        await client.chatStream(
          {
            message: "Hello",
            platform,
            platformUserId: TEST_USER_ID,
            channelId: TEST_CHANNEL_ID,
          },
          () => {},
          () => {},
          () => {},
        );

        const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
        const body = req?.body as Record<string, unknown>;

        expect(body.platform).toBe(platform);
        expect(body.platform_user_id).toBe(TEST_USER_ID);
        expect(body.channel_id).toBe(TEST_CHANNEL_ID);
      });
    }
  });

  describe("Character Limits Per Platform", () => {
    const platformLimits = {
      discord: 2000,
      slack: 4000,
      telegram: 4096,
      whatsapp: 4096,
    } as const;

    for (const [platform, limit] of Object.entries(platformLimits)) {
      it(`should enforce ${limit} char limit for ${platform}`, () => {
        const longText = "x".repeat(limit + 500);
        const truncated = truncateResponse(
          longText,
          platform as keyof typeof platformLimits,
        );
        expect(truncated.length).toBeLessThanOrEqual(limit);
      });
    }

    for (const [platform, limit] of Object.entries(platformLimits)) {
      it(`should not truncate text at or below ${limit} chars for ${platform}`, () => {
        const exactText = "y".repeat(limit);
        const truncated = truncateResponse(
          exactText,
          platform as keyof typeof platformLimits,
        );
        expect(truncated).toBe(exactText);
      });
    }
  });

  describe("Auth Error Handling Consistency", () => {
    it("All platforms stream not_authenticated error identically", async () => {
      const platforms = ["discord", "slack", "telegram"] as const;

      for (const platform of platforms) {
        server.reset();
        server.state.streamError = "not_authenticated";

        let errorMsg = "";
        await client.chatStream(
          { message: "Hi", platform, platformUserId: TEST_USER_ID },
          () => {},
          () => {},
          (error) => { errorMsg = error.message; },
        );

        expect(errorMsg).toBe("not_authenticated");
      }
    });

    it("All platforms generate correct auth URLs", () => {
      const platforms = ["discord", "slack", "telegram"] as const;

      for (const platform of platforms) {
        const url = client.getAuthUrl(platform, `${platform}-user-1`);
        expect(url).toBe(
          `${TEST_FRONTEND_URL}/auth/link-platform?platform=${platform}&pid=${platform}-user-1`,
        );
      }
    });

    it("should properly encode special characters in auth URL", () => {
      const url = client.getAuthUrl("discord", "user&id=1");
      expect(url).toContain("pid=user%26id%3D1");
    });
  });

  describe("Shared Command Handlers", () => {
    it("should produce same results regardless of which bot calls them", async () => {
      const ctx: CommandContext = {
        platform: "discord",
        platformUserId: TEST_USER_ID,
        channelId: TEST_CHANNEL_ID,
      };

      const workflowResult = await handleWorkflowList(client, ctx);
      const todoResult = await handleTodoList(client, ctx);
      const conversationResult = await handleConversationList(client, ctx, 1);
      const searchResult = await handleSearch(client, "test", ctx);

      expect(workflowResult).toContain("Test Workflow");
      expect(todoResult).toContain("Test Todo");
      expect(conversationResult).toContain("Test Conversation");
      expect(searchResult).toContain("Messages: 1");
    });

    it("should pass user context headers for all shared handlers", async () => {
      const ctx: CommandContext = {
        platform: "slack",
        platformUserId: "slack-user-1",
      };

      await handleWorkflowList(client, ctx);
      const req = server.getLastRequest();
      expect(req?.headers["x-bot-platform"]).toBe("slack");
      expect(req?.headers["x-bot-platform-user-id"]).toBe("slack-user-1");
    });
  });

  describe("Session Reset Consistency", () => {
    const platforms = ["discord", "slack", "telegram"] as const;

    for (const platform of platforms) {
      it(`should reset session correctly for ${platform}`, async () => {
        await client.resetSession(platform, `${platform}-user`, "channel-1");

        const req = server.getLastRequest();
        const body = req?.body as Record<string, unknown>;
        expect(body.platform).toBe(platform);
        expect(body.platform_user_id).toBe(`${platform}-user`);
        expect(body.channel_id).toBe("channel-1");
      });
    }
  });

  describe("Response Type Mapping Consistency", () => {
    it("chat() should map conversation_id to conversationId", async () => {
      const result = await client.chat({
        message: "Hi",
        platform: "discord",
        platformUserId: TEST_USER_ID,
      });

      expect(result.conversationId).toBeDefined();
      expect(result.conversationId).toBe("conv-123");
    });

    it("getSession() should map snake_case to camelCase", async () => {
      const result = await client.getSession("discord", TEST_USER_ID);

      // Fixed: getSession now maps conversation_id -> conversationId
      expect(result.conversationId).toBeDefined();
      expect(result.conversationId).toBe("conv-session-123");
      expect(result.platformUserId).toBeDefined();
    });

    it("resetSession() should map snake_case to camelCase", async () => {
      const result = await client.resetSession("discord", TEST_USER_ID);

      // Fixed: resetSession now maps conversation_id -> conversationId
      expect(result.conversationId).toBeDefined();
      expect(result.conversationId).toBe("conv-session-123");
      expect(result.platformUserId).toBeDefined();
    });
  });
});
