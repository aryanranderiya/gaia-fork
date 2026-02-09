import type { GaiaClient } from "../api";
import {
  formatWorkflowList,
  formatTodo,
  formatTodoList,
  formatConversationList,
  formatBotError,
} from "./formatters";

export interface CommandContext {
  userId: string;
  channelId?: string;
  platform: "discord" | "slack" | "telegram" | "whatsapp";
}

export async function handleWorkflowList(
  gaia: GaiaClient,
): Promise<string> {
  try {
    const response = await gaia.listWorkflows();
    return formatWorkflowList(response.workflows);
  } catch (error: unknown) {
    return formatBotError(error);
  }
}

export async function handleWorkflowExecute(
  gaia: GaiaClient,
  workflowId: string,
  inputs?: Record<string, unknown>,
): Promise<string> {
  try {
    const response = await gaia.executeWorkflow({
      workflow_id: workflowId,
      inputs,
    });
    return `Workflow execution started!\nExecution ID: ${response.execution_id}\nStatus: ${response.status}`;
  } catch (error: unknown) {
    return formatBotError(error);
  }
}

export async function handleTodoList(
  gaia: GaiaClient,
  completed?: boolean,
): Promise<string> {
  try {
    const response = await gaia.listTodos({ completed });
    return formatTodoList(response.todos);
  } catch (error: unknown) {
    return formatBotError(error);
  }
}

export async function handleTodoCreate(
  gaia: GaiaClient,
  title: string,
  options?: { priority?: "low" | "medium" | "high"; description?: string },
): Promise<string> {
  try {
    const todo = await gaia.createTodo({
      title,
      priority: options?.priority,
      description: options?.description,
    });
    return `Todo created!\n\n${formatTodo(todo)}`;
  } catch (error: unknown) {
    return formatBotError(error);
  }
}

export async function handleTodoComplete(
  gaia: GaiaClient,
  todoId: string,
): Promise<string> {
  try {
    const todo = await gaia.completeTodo(todoId);
    return `Todo marked as complete: ${todo.title}`;
  } catch (error: unknown) {
    return formatBotError(error);
  }
}

export async function handleConversationList(
  gaia: GaiaClient,
  page = 1,
): Promise<string> {
  try {
    const response = await gaia.listConversations({ page, limit: 5 });
    return formatConversationList(response.conversations, gaia.getBaseUrl());
  } catch (error: unknown) {
    return formatBotError(error);
  }
}

export async function handleWeather(
  gaia: GaiaClient,
  location: string,
  ctx: CommandContext,
): Promise<string> {
  try {
    return await gaia.getWeather(location, ctx.platform, ctx.userId);
  } catch (error: unknown) {
    return formatBotError(error);
  }
}

export async function handleSearch(
  gaia: GaiaClient,
  query: string,
): Promise<string> {
  try {
    const response = await gaia.search(query);
    const totalResults =
      response.messages.length +
      response.conversations.length +
      response.notes.length;

    if (totalResults === 0) {
      return `No results found for: "${query}"`;
    }

    let result = `Search results for: "${query}"\n\n`;
    if (response.messages.length > 0) {
      result += `Messages: ${response.messages.length}\n`;
    }
    if (response.conversations.length > 0) {
      result += `Conversations: ${response.conversations.length}\n`;
    }
    if (response.notes.length > 0) {
      result += `Notes: ${response.notes.length}\n`;
    }

    return result;
  } catch (error: unknown) {
    return formatBotError(error);
  }
}
