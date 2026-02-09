import type { Workflow, Todo, Conversation } from "../types";

/**
 * Formats a workflow for display in a bot message.
 */
export function formatWorkflow(workflow: Workflow): string {
  const status = workflow.status === "active" ? "✅" : "⏸️";
  return `${status} **${workflow.name}**\nID: \`${workflow.id}\`\n${workflow.description || "No description"}`;
}

/**
 * Formats a list of workflows for display.
 */
export function formatWorkflowList(workflows: Workflow[]): string {
  if (workflows.length === 0) {
    return "No workflows found. Create one with `/workflow create`";
  }

  return workflows.map(formatWorkflow).join("\n\n");
}

/**
 * Formats a todo for display in a bot message.
 */
export function formatTodo(todo: Todo): string {
  const checkbox = todo.completed ? "☑️" : "⬜";
  const priority = todo.priority
    ? ` [${todo.priority.toUpperCase()}]`
    : "";
  const dueDate = todo.due_date
    ? ` | Due: ${new Date(todo.due_date).toLocaleDateString()}`
    : "";

  return `${checkbox} **${todo.title}**${priority}\nID: \`${todo.id}\`${dueDate}`;
}

/**
 * Formats a list of todos for display.
 */
export function formatTodoList(todos: Todo[]): string {
  if (todos.length === 0) {
    return "No todos found. Create one with `/todo add`";
  }

  return todos.map(formatTodo).join("\n\n");
}

/**
 * Formats a conversation for display.
 */
export function formatConversation(
  conversation: Conversation,
  baseUrl: string,
): string {
  const title = conversation.title || "Untitled Conversation";
  const url = `${baseUrl}/chat/${conversation.conversation_id}`;
  const messageCount = conversation.message_count
    ? ` (${conversation.message_count} messages)`
    : "";

  return `💬 **${title}**${messageCount}\n🔗 ${url}`;
}

/**
 * Formats a list of conversations for display.
 */
export function formatConversationList(
  conversations: Conversation[],
  baseUrl: string,
): string {
  if (conversations.length === 0) {
    return "No conversations found.";
  }

  return conversations.map((c) => formatConversation(c, baseUrl)).join("\n\n");
}

/**
 * Truncates text to fit platform message limits.
 */
export function truncateMessage(
  text: string,
  platform: "discord" | "slack" | "telegram" | "whatsapp",
): string {
  const limits = {
    discord: 2000,
    slack: 4000,
    telegram: 4096,
    whatsapp: 4096,
  };

  const limit = limits[platform];
  if (text.length <= limit) {
    return text;
  }

  return text.substring(0, limit - 50) + "\n\n... (message truncated)";
}

/**
 * Formats an error message for user display.
 */
export function formatBotError(error: unknown): string {
  const response = (error as { response?: { status?: number } })?.response;

  if (response?.status === 401) {
    return "❌ Authentication required. Use `/auth` to link your account.";
  }

  if (response?.status === 404) {
    return "❌ Not found. Please check the ID and try again.";
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return `❌ An error occurred: ${message}`;
}
