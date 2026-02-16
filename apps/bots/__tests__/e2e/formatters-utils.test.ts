import { describe, it, expect } from "vitest";
import {
  formatWorkflow,
  formatWorkflowList,
  formatTodo,
  formatTodoList,
  formatConversation,
  formatConversationList,
  truncateResponse,
  formatBotError,
  GaiaApiError,
} from "@gaia/shared";
import type { Workflow, Todo, Conversation } from "@gaia/shared";

describe("Formatter Utilities", () => {
  describe("formatWorkflow()", () => {
    it("should show active status emoji for active workflow", () => {
      const wf: Workflow = {
        id: "wf-1",
        name: "Deploy Pipeline",
        description: "Deploys to production",
        status: "active",
      };

      const result = formatWorkflow(wf);
      expect(result).toContain("✅");
      expect(result).toContain("Deploy Pipeline");
      expect(result).toContain("wf-1");
      expect(result).toContain("Deploys to production");
    });

    it("should show paused emoji for inactive workflow", () => {
      const wf: Workflow = {
        id: "wf-2",
        name: "Backup",
        description: "Database backup",
        status: "inactive",
      };

      const result = formatWorkflow(wf);
      expect(result).toContain("⏸️");
    });

    it("should show paused emoji for draft workflow", () => {
      const wf: Workflow = {
        id: "wf-3",
        name: "Draft",
        description: "",
        status: "draft",
      };

      const result = formatWorkflow(wf);
      expect(result).toContain("⏸️");
    });

    it("should show 'No description' when description is empty", () => {
      const wf: Workflow = {
        id: "wf-4",
        name: "No Desc",
        description: "",
        status: "active",
      };

      const result = formatWorkflow(wf);
      expect(result).toContain("No description");
    });
  });

  describe("formatWorkflowList()", () => {
    it("should format multiple workflows separated by double newlines", () => {
      const workflows: Workflow[] = [
        { id: "wf-1", name: "A", description: "First", status: "active" },
        { id: "wf-2", name: "B", description: "Second", status: "inactive" },
      ];

      const result = formatWorkflowList(workflows);
      expect(result).toContain("A");
      expect(result).toContain("B");
      expect(result.split("\n\n").length).toBeGreaterThanOrEqual(2);
    });

    it("should show create instruction for empty list", () => {
      const result = formatWorkflowList([]);
      expect(result).toContain("No workflows found");
      expect(result).toContain("/workflow create");
    });
  });

  describe("formatTodo()", () => {
    it("should show unchecked box for incomplete todo", () => {
      const todo: Todo = {
        id: "t1",
        title: "Buy milk",
        completed: false,
      };

      const result = formatTodo(todo);
      expect(result).toContain("⬜");
      expect(result).toContain("Buy milk");
      expect(result).toContain("t1");
    });

    it("should show checked box for completed todo", () => {
      const todo: Todo = {
        id: "t2",
        title: "Done task",
        completed: true,
      };

      const result = formatTodo(todo);
      expect(result).toContain("☑️");
    });

    it("should show priority in uppercase", () => {
      const todo: Todo = {
        id: "t3",
        title: "Urgent",
        completed: false,
        priority: "high",
      };

      const result = formatTodo(todo);
      expect(result).toContain("[HIGH]");
    });

    it("should show due date when present", () => {
      const todo: Todo = {
        id: "t4",
        title: "Task",
        completed: false,
        due_date: "2024-12-31T00:00:00Z",
      };

      const result = formatTodo(todo);
      expect(result).toContain("Due:");
    });

    it("should not show priority when undefined", () => {
      const todo: Todo = {
        id: "t5",
        title: "No priority",
        completed: false,
      };

      const result = formatTodo(todo);
      expect(result).not.toContain("[");
    });

    it("should not show due date when undefined", () => {
      const todo: Todo = {
        id: "t6",
        title: "No date",
        completed: false,
      };

      const result = formatTodo(todo);
      expect(result).not.toContain("Due:");
    });
  });

  describe("formatTodoList()", () => {
    it("should format multiple todos", () => {
      const todos: Todo[] = [
        { id: "t1", title: "First", completed: false },
        { id: "t2", title: "Second", completed: true },
      ];

      const result = formatTodoList(todos);
      expect(result).toContain("First");
      expect(result).toContain("Second");
    });

    it("should show add instruction for empty list", () => {
      const result = formatTodoList([]);
      expect(result).toContain("No todos found");
      expect(result).toContain("/todo add");
    });
  });

  describe("formatConversation()", () => {
    it("should format conversation with title and message count", () => {
      const conv: Conversation = {
        conversation_id: "conv-1",
        title: "My Chat",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T01:00:00Z",
        message_count: 10,
      };

      const result = formatConversation(conv, "http://localhost:3000");
      expect(result).toContain("My Chat");
      expect(result).toContain("10 messages");
      expect(result).toContain("http://localhost:3000/chat/conv-1");
    });

    it("should show 'Untitled Conversation' when title is undefined", () => {
      const conv: Conversation = {
        conversation_id: "conv-2",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T01:00:00Z",
      };

      const result = formatConversation(conv, "http://localhost:3000");
      expect(result).toContain("Untitled Conversation");
    });

    it("should not show message count when undefined", () => {
      const conv: Conversation = {
        conversation_id: "conv-3",
        title: "Test",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T01:00:00Z",
      };

      const result = formatConversation(conv, "http://localhost:3000");
      expect(result).not.toContain("messages");
    });
  });

  describe("formatConversationList()", () => {
    it("should show empty message for no conversations", () => {
      const result = formatConversationList([], "http://localhost:3000");
      expect(result).toContain("No conversations found");
    });
  });
});

describe("Truncation Utilities", () => {
  describe("truncateResponse()", () => {
    it("should not truncate text within Discord limit", () => {
      const text = "Hello world";
      const result = truncateResponse(text, "discord");
      expect(result).toBe("Hello world");
    });

    it("should truncate text exceeding Discord 2000 char limit", () => {
      const text = "a".repeat(2500);
      const result = truncateResponse(text, "discord");
      expect(result.length).toBeLessThanOrEqual(2000);
      expect(result).toContain("truncated");
    });

    it("should truncate text exceeding Slack 4000 char limit", () => {
      const text = "b".repeat(4500);
      const result = truncateResponse(text, "slack");
      expect(result.length).toBeLessThanOrEqual(4000);
    });

    it("should truncate text exceeding Telegram 4096 char limit", () => {
      const text = "c".repeat(5000);
      const result = truncateResponse(text, "telegram");
      expect(result.length).toBeLessThanOrEqual(4096);
    });

    it("should append conversation URL when provided", () => {
      const text = "d".repeat(2500);
      const result = truncateResponse(
        text,
        "discord",
        "http://example.com/chat/123",
      );
      expect(result).toContain("View full response");
      expect(result).toContain("http://example.com/chat/123");
    });

    it("should append generic truncation message when no URL provided", () => {
      const text = "e".repeat(2500);
      const result = truncateResponse(text, "discord");
      expect(result).toContain("truncated");
    });

    it("should try to truncate at word boundary", () => {
      const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
      const result = truncateResponse(words, "discord");
      // Text before the suffix should end at a complete word boundary
      const textBeforeSuffix = result.split("\n\n")[0];
      expect(textBeforeSuffix).toMatch(/word\d+$/);
    });

    it("should handle text exactly at the limit", () => {
      const text = "x".repeat(2000);
      const result = truncateResponse(text, "discord");
      expect(result).toBe(text);
      expect(result.length).toBe(2000);
    });

    it("should handle text one char over the limit", () => {
      const text = "y".repeat(2001);
      const result = truncateResponse(text, "discord");
      expect(result.length).toBeLessThanOrEqual(2000);
    });

    it("should not break with empty text", () => {
      const result = truncateResponse("", "discord");
      expect(result).toBe("");
    });
  });

  describe("truncateResponse() - additional platform tests", () => {
    it("should not truncate within limit", () => {
      const result = truncateResponse("short text", "telegram");
      expect(result).toBe("short text");
    });

    it("should truncate and add message for Telegram", () => {
      const text = "z".repeat(5000);
      const result = truncateResponse(text, "telegram");
      expect(result.length).toBeLessThanOrEqual(4096);
      expect(result).toContain("truncated");
    });

    it("should use different limits per platform", () => {
      const text = "a".repeat(3000);

      const discordResult = truncateResponse(text, "discord");
      const slackResult = truncateResponse(text, "slack");

      // Discord has 2000 limit, should truncate
      expect(discordResult.length).toBeLessThanOrEqual(2000);
      expect(discordResult).toContain("truncated");

      // Slack has 4000 limit, should not truncate
      expect(slackResult).toBe(text);
    });
  });
});

describe("Error Formatting", () => {
  describe("formatBotError()", () => {
    it("should route axios-like 401 to auth message", () => {
      const error = { response: { status: 401 } };
      const result = formatBotError(error);
      expect(result).toBe(
        "\u274c Authentication required. Use `/auth` to link your account.",
      );
    });

    it("should route axios-like 404 to not-found message", () => {
      const error = { response: { status: 404 } };
      const result = formatBotError(error);
      expect(result).toBe(
        "\u274c Not found. Please check the ID and try again.",
      );
    });

    it("should include Error.message in generic output", () => {
      const result = formatBotError(new Error("Something broke"));
      expect(result).toBe("\u274c An error occurred: Something broke");
    });

    it("should include Error.message when no response property exists", () => {
      const result = formatBotError(new Error("Network timeout"));
      expect(result).toBe("\u274c An error occurred: Network timeout");
    });

    it("should route GaiaApiError(401) to auth message (fixed bug)", () => {
      // Previously GaiaClient threw plain Error("API error: 401") which
      // stripped the status. Now it throws GaiaApiError with .status = 401,
      // so formatBotError correctly detects it.
      const error = new GaiaApiError("API error: 401", 401);
      const result = formatBotError(error);
      expect(result).toBe(
        "\u274c Authentication required. Use `/auth` to link your account.",
      );
    });

    it("should route GaiaApiError(404) to not-found message (fixed bug)", () => {
      const error = new GaiaApiError("API error: 404", 404);
      const result = formatBotError(error);
      expect(result).toBe(
        "\u274c Not found. Please check the ID and try again.",
      );
    });
  });
});
