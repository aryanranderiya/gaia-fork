import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MockApiServer } from "../setup/mock-api-server";
import { createTestClient, TEST_USER_ID } from "../setup/test-helpers";
import type { GaiaClient } from "@gaia/shared";

describe("Streaming E2E Tests", () => {
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

  const makeStreamRequest = () => ({
    message: "Hello",
    platform: "discord" as const,
    platformUserId: TEST_USER_ID,
  });

  describe("Normal Streaming", () => {
    it("should accumulate chunks in order", async () => {
      server.state.streamChunks = ["A", "B", "C", "D", "E"];

      const chunks: string[] = [];
      let finalText = "";

      await client.chatStream(
        makeStreamRequest(),
        (chunk) => { chunks.push(chunk); },
        (text) => { finalText = text; },
        () => {},
      );

      expect(chunks).toEqual(["A", "B", "C", "D", "E"]);
      expect(finalText).toBe("ABCDE");
    });

    it("should handle chunks with special characters", async () => {
      server.state.streamChunks = ["Hello! 🌍", " Here's some JSON: {\"key\": \"value\"}"];

      let finalText = "";

      await client.chatStream(
        makeStreamRequest(),
        () => {},
        (text) => { finalText = text; },
        () => {},
      );

      expect(finalText).toContain("🌍");
      expect(finalText).toContain("{\"key\": \"value\"}");
    });

    it("should handle chunks with newlines", async () => {
      server.state.streamChunks = ["Line 1\n", "Line 2\n", "Line 3"];

      let finalText = "";

      await client.chatStream(
        makeStreamRequest(),
        () => {},
        (text) => { finalText = text; },
        () => {},
      );

      expect(finalText).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should handle very large response", async () => {
      const largeChunk = "x".repeat(1000);
      server.state.streamChunks = Array.from({ length: 50 }, () => largeChunk);

      let finalText = "";

      await client.chatStream(
        makeStreamRequest(),
        () => {},
        (text) => { finalText = text; },
        () => {},
      );

      expect(finalText.length).toBe(50000);
    });
  });

  describe("Error Handling in Stream", () => {
    it("should not call onDone after onError for auth errors", async () => {
      server.state.streamError = "not_authenticated";

      let doneCalled = false;
      let errorCalled = false;

      await client.chatStream(
        makeStreamRequest(),
        () => {},
        () => { doneCalled = true; },
        () => { errorCalled = true; },
      );

      expect(errorCalled).toBe(true);
      expect(doneCalled).toBe(false);
    });

    it("should not call onDone after onError for generic errors", async () => {
      server.state.streamError = "internal_error";

      let doneCalled = false;
      let errorCalled = false;

      await client.chatStream(
        makeStreamRequest(),
        () => {},
        () => { doneCalled = true; },
        () => { errorCalled = true; },
      );

      expect(errorCalled).toBe(true);
      expect(doneCalled).toBe(false);
    });

    it("should handle connection error", async () => {
      // Create client pointing to a non-existent server
      const badClient = new (await import("@gaia/shared")).GaiaClient(
        "http://localhost:99999",
        "key",
        "http://localhost:3000",
      );

      let errorCalled = false;

      await badClient.chatStream(
        makeStreamRequest(),
        () => {},
        () => {},
        () => { errorCalled = true; },
      );

      expect(errorCalled).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty chunks array (stream with only done marker)", async () => {
      server.state.streamChunks = [];

      const chunks: string[] = [];
      let finalText = "";
      let doneCalled = false;

      await client.chatStream(
        makeStreamRequest(),
        (chunk) => { chunks.push(chunk); },
        (text) => { finalText = text; doneCalled = true; },
        () => {},
      );

      expect(chunks).toEqual([]);
      expect(finalText).toBe("");
      expect(doneCalled).toBe(true);
    });

    it("should return empty conversation ID when not provided", async () => {
      server.state.streamConversationId = "";

      let convId = "initial";

      await client.chatStream(
        makeStreamRequest(),
        () => {},
        (_text, id) => { convId = id; },
        () => {},
      );

      expect(convId).toBe("");
    });

    it("should handle stream with delayed chunks", async () => {
      server.state.streamChunks = ["A", "B", "C"];
      server.state.streamDelayMs = 50;

      const chunks: string[] = [];

      await client.chatStream(
        makeStreamRequest(),
        (chunk) => { chunks.push(chunk); },
        () => {},
        () => {},
      );

      expect(chunks).toEqual(["A", "B", "C"]);
    });

    it("should send Accept header for SSE", async () => {
      await client.chatStream(
        makeStreamRequest(),
        () => {},
        () => {},
        () => {},
      );

      const req = server.getRequestsByPath("/api/v1/bot/chat-stream")[0];
      expect(req?.headers.accept).toBe("text/event-stream");
    });
  });
});
