import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MockApiServer } from "../setup/mock-api-server";
import { createTestClient, TEST_USER_ID, TEST_CTX } from "../setup/test-helpers";
import type { GaiaClient } from "@gaia/shared";
import { GaiaApiError, formatBotError } from "@gaia/shared";

describe("Error Handling Chain E2E Tests", () => {
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

  describe("GaiaClient error wrapping", () => {
    it("should throw GaiaApiError with status for 401 errors", async () => {
      server.state.errorStatus = 401;

      try {
        await client.listTodos(TEST_CTX);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        expect((error as GaiaApiError).status).toBe(401);
        expect((error as GaiaApiError).message).toContain("401");
      }
    });

    it("should throw GaiaApiError with status for 404 errors", async () => {
      server.state.errorStatus = 404;

      try {
        await client.getWorkflow("nonexistent", TEST_CTX);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        expect((error as GaiaApiError).status).toBe(404);
      }
    });

    it("should throw GaiaApiError with status for 500 errors", async () => {
      server.state.errorStatus = 500;

      try {
        await client.listWorkflows(TEST_CTX);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        expect((error as GaiaApiError).status).toBe(500);
      }
    });

    it("should throw GaiaApiError with status for 429 rate limit errors", async () => {
      server.state.errorStatus = 429;
      server.state.errorMessage = "Rate limit exceeded";

      try {
        await client.chat({
          message: "Hi",
          platform: "discord",
          platformUserId: TEST_USER_ID,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        expect((error as GaiaApiError).status).toBe(429);
      }
    });
  });

  describe("getWeather() error propagation", () => {
    it("should not double-wrap error messages from chatPublic()", async () => {
      server.state.errorStatus = 500;

      try {
        await client.getWeather("London", TEST_CTX);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        const message = (error as GaiaApiError).message;

        const matches = message.match(/API error/g);
        const count = matches ? matches.length : 0;

        // Fixed: GaiaApiError from chatPublic is re-thrown directly
        // so there should be exactly 1 "API error" prefix, not 2
        expect(count).toBe(1);
      }
    });

    it("should preserve status code from chatPublic error", async () => {
      server.state.errorStatus = 401;

      try {
        await client.getWeather("London", TEST_CTX);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GaiaApiError);
        // Fixed: GaiaApiError is re-thrown directly, preserving status
        expect((error as GaiaApiError).status).toBe(401);
      }
    });
  });

  describe("Stream error handling", () => {
    it("should call onError for auth errors, not throw", async () => {
      server.state.streamError = "not_authenticated";

      let errorCalled = false;
      let threwError = false;

      try {
        await client.chatStream(
          { message: "Hi", platform: "discord", platformUserId: TEST_USER_ID },
          () => {},
          () => {},
          () => { errorCalled = true; },
        );
      } catch {
        threwError = true;
      }

      expect(errorCalled).toBe(true);
      expect(threwError).toBe(false);
    });

    it("should not call onChunk after onError", async () => {
      server.state.streamError = "not_authenticated";

      let chunkCalledAfterError = false;
      let errorCalled = false;

      await client.chatStream(
        { message: "Hi", platform: "discord", platformUserId: TEST_USER_ID },
        () => {
          if (errorCalled) chunkCalledAfterError = true;
        },
        () => {},
        () => { errorCalled = true; },
      );

      expect(chunkCalledAfterError).toBe(false);
    });
  });

  describe("Connection errors", () => {
    it("should handle connection refused gracefully", async () => {
      const badClient = new (await import("@gaia/shared")).GaiaClient(
        "http://localhost:1",
        "key",
        "http://localhost:3000",
      );

      let errorCalled = false;

      await badClient.chatStream(
        { message: "Hi", platform: "discord", platformUserId: "u1" },
        () => {},
        () => {},
        () => { errorCalled = true; },
      );

      expect(errorCalled).toBe(true);
    });

    it("should throw on connection refused for non-stream methods", async () => {
      const badClient = new (await import("@gaia/shared")).GaiaClient(
        "http://localhost:1",
        "key",
        "http://localhost:3000",
      );

      await expect(
        badClient.chat({ message: "Hi", platform: "discord", platformUserId: "u1" }),
      ).rejects.toThrow();
    });
  });

  describe("Error formatting", () => {
    it("formatBotError should always return a string", () => {
      expect(typeof formatBotError(new Error("x"))).toBe("string");
      expect(typeof formatBotError(null)).toBe("string");
      expect(typeof formatBotError(undefined)).toBe("string");
      expect(typeof formatBotError({ some: "object" })).toBe("string");
    });

    it("formatBotError should preserve Error.message in output", () => {
      const result = formatBotError(new Error("Test error"));
      expect(result).toBe("\u274c An error occurred: Test error");
    });

    it("formatBotError should return fallback for non-Error objects", () => {
      const result = formatBotError({ some: "object" });
      expect(result).toBe("\u274c An error occurred: Unknown error");
    });

    it("formatBotError should route GaiaApiError(401) to auth message", () => {
      const error = new GaiaApiError("API error: 401", 401);
      const result = formatBotError(error);
      expect(result).toBe(
        "\u274c Authentication required. Use `/auth` to link your account.",
      );
    });

    it("formatBotError should route GaiaApiError(404) to not-found message", () => {
      const error = new GaiaApiError("API error: 404", 404);
      const result = formatBotError(error);
      expect(result).toBe(
        "\u274c Not found. Please check the ID and try again.",
      );
    });

    it("formatBotError should detect status from axios-like response objects", () => {
      const axiosLikeError = { response: { status: 401 } };
      const result = formatBotError(axiosLikeError);
      // Same output as GaiaApiError(401) - status detection works for both
      expect(result).toBe(
        "\u274c Authentication required. Use `/auth` to link your account.",
      );
    });

    it("formatBotError should use Error.message for non-status errors", () => {
      const result = formatBotError(new Error("Something broke"));
      expect(result).toBe("\u274c An error occurred: Something broke");
    });

    it("formatBotError should use GaiaApiError.message for non-401/404 status", () => {
      const error = new GaiaApiError("API error: 500", 500);
      const result = formatBotError(error);
      expect(result).toBe("\u274c An error occurred: API error: 500");
    });
  });
});
