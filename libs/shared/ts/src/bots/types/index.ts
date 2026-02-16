/**
 * Shared types for all GAIA bot integrations.
 *
 * These interfaces define the contract between bot adapters and the
 * shared library. Bot-specific types (Discord Interaction, Slack Command, etc.)
 * live in each bot's own code - only platform-agnostic types belong here.
 *
 * Key types:
 * - ChatRequest / ChatResponse: chat API payloads
 * - CommandContext: user identity passed to all shared command handlers
 * - BotConfig: environment config loaded by config/index.ts
 * - Domain types: Workflow, Todo, Conversation (match backend API schemas)
 */

/**
 * Represents a chat request sent to the GAIA bot API.
 */
export interface ChatRequest {
  /** The message content to send. */
  message: string;
  /** The platform the message originated from. */
  platform: "discord" | "slack" | "telegram" | "whatsapp";
  /** The user ID of the sender on the platform. */
  platformUserId: string;
  /** Optional channel ID where the conversation is happening. */
  channelId?: string;
}

/**
 * Represents the response from the GAIA bot API.
 */
export interface ChatResponse {
  /** The agent's response text. */
  response: string;
  /** The unique identifier for the conversation session. */
  conversationId: string;
  /** Whether the user is authenticated with GAIA. */
  authenticated: boolean;
}

/**
 * Represents session information for a bot conversation.
 */
export interface SessionInfo {
  /** The unique identifier for the conversation session. */
  conversationId: string;
  /** The platform associated with this session. */
  platform: string;
  /** The user ID on the platform. */
  platformUserId: string;
}

/**
 * Configuration required for the bot to operate.
 */
export interface BotConfig {
  /** The base URL of the GAIA backend API. */
  gaiaApiUrl: string;
  /** The secure API key for authenticating with the backend. */
  gaiaApiKey: string;
  /** The base URL of the GAIA frontend app. */
  gaiaFrontendUrl: string;
}

/**
 * Represents the authentication status of a user on a platform.
 */
export interface AuthStatus {
  /** Whether the user is authenticated/linked. */
  authenticated: boolean;
  /** The platform name. */
  platform: string;
  /** The user ID on the platform. */
  platformUserId: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive" | "draft";
  triggers?: Record<string, unknown>[];
  steps?: Record<string, unknown>[];
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowListResponse {
  workflows: Workflow[];
}

export interface WorkflowExecutionRequest {
  workflow_id: string;
  inputs?: Record<string, unknown>;
}

export interface WorkflowExecutionResponse {
  execution_id: string;
  status: string;
  result?: unknown;
}

export interface Todo {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority?: "low" | "medium" | "high";
  due_date?: string;
  project_id?: string;
}

export interface TodoListResponse {
  todos: Todo[];
  total: number;
}

export interface CreateTodoRequest {
  title: string;
  description?: string;
  completed?: boolean;
  priority?: "low" | "medium" | "high";
  due_date?: string;
  project_id?: string;
}

export interface Conversation {
  conversation_id: string;
  title?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
}

export interface SearchResponse {
  messages: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  notes: Record<string, unknown>[];
}

export interface BotUserContext {
  platform: "discord" | "slack" | "telegram" | "whatsapp";
  platformUserId: string;
}

export type CommandContext = BotUserContext & {
  channelId?: string;
};

/**
 * Integration information for settings.
 */
export interface IntegrationInfo {
  name: string;
  logoUrl: string | null;
  status: "created" | "connected";
}

/**
 * User settings response when not authenticated.
 */
export interface UnauthenticatedSettingsResponse {
  authenticated: false;
}

/**
 * User settings response when authenticated.
 */
export interface AuthenticatedSettingsResponse {
  authenticated: true;
  userName: string | null;
  accountCreatedAt: string | null;
  profileImageUrl: string | null;
  selectedModelName: string | null;
  selectedModelIconUrl: string | null;
  connectedIntegrations: IntegrationInfo[];
}

/**
 * User settings response (discriminated union).
 */
export type SettingsResponse =
  | UnauthenticatedSettingsResponse
  | AuthenticatedSettingsResponse;
