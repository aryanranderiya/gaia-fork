import type { Readable } from "node:stream";
import axios, { type AxiosInstance } from "axios";
import type {
  AuthStatus,
  BotUserContext,
  ChatRequest,
  ChatResponse,
  CommandContext,
  Conversation,
  ConversationListResponse,
  CreateTodoRequest,
  SearchResponse,
  SessionInfo,
  Todo,
  TodoListResponse,
  Workflow,
  WorkflowExecutionRequest,
  WorkflowExecutionResponse,
  WorkflowListResponse,
} from "../types";

export class GaiaApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GaiaApiError";
    this.status = status;
  }
}

/**
 * Client for interacting with the GAIA Backend Bot API.
 * Handles authentication, chat interactions, sessions, and platform linking status.
 */
export class GaiaClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private frontendUrl: string;
  private apiKey: string;
  private sessionTokens: Map<string, string> = new Map();

  /**
   * Creates a new GaiaClient instance.
   *
   * @param baseUrl - The base URL of the GAIA API (e.g., http://localhost:8000)
   * @param apiKey - The secure bot API key for server-to-server communication
   * @param frontendUrl - The base URL of the GAIA frontend app (e.g., http://localhost:3000)
   */
  constructor(baseUrl: string, apiKey: string, frontendUrl: string) {
    this.baseUrl = baseUrl;
    this.frontendUrl = frontendUrl;
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  private getSessionKey(ctx: BotUserContext): string {
    return `${ctx.platform}:${ctx.platformUserId}`;
  }

  private userHeaders(ctx: BotUserContext) {
    const sessionKey = this.getSessionKey(ctx);
    const sessionToken = this.sessionTokens.get(sessionKey);

    const headers: Record<string, string> = {
      "X-Bot-Platform": ctx.platform,
      "X-Bot-Platform-User-Id": ctx.platformUserId,
    };

    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    } else {
      headers["X-Bot-API-Key"] = this.apiKey;
    }

    return headers;
  }

  /**
   * Clears the session token for a user, forcing re-authentication.
   * This is called automatically when a 401 error is encountered.
   */
  private clearSessionToken(ctx: BotUserContext): void {
    const sessionKey = this.getSessionKey(ctx);
    this.sessionTokens.delete(sessionKey);
  }

  /**
   * Wraps all API calls with consistent error handling.
   * Catches axios errors, extracts HTTP status, and throws GaiaApiError.
   * Passes through GaiaApiError unchanged (prevents double-wrapping
   * when methods like getWeather call chatPublic internally).
   */
  private async request<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (error instanceof GaiaApiError) throw error;
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new GaiaApiError(`API error: ${status || message}`, status);
    }
  }

  /**
   * Wraps API calls that require user authentication with automatic token refresh.
   * If a 401 error is encountered, clears the cached token and retries once.
   * This allows the bot to get a fresh JWT token via the fallback API key auth.
   */
  private async requestWithAuth<T>(
    fn: () => Promise<T>,
    ctx: BotUserContext,
    retried = false,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;

      if (status === 401 && !retried) {
        this.clearSessionToken(ctx);
        return this.requestWithAuth(fn, ctx, true);
      }

      if (error instanceof GaiaApiError) throw error;
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new GaiaApiError(`API error: ${status || message}`, status);
    }
  }

  /**
   * Sends a chat message to the GAIA agent on behalf of an authenticated user.
   *
   * @param request - The chat request containing message, platform, and user ID.
   * @returns The agent's response and session details.
   * @throws Error if the API request fails.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const ctx = {
      platform: request.platform,
      platformUserId: request.platformUserId,
      channelId: request.channelId,
    };

    return this.requestWithAuth(async () => {
      const { data } = await this.client.post(
        "/api/v1/bot/chat",
        {
          message: request.message,
          platform: request.platform,
          platform_user_id: request.platformUserId,
          channel_id: request.channelId,
        },
        {
          headers: this.userHeaders(ctx),
        },
      );

      if (data.session_token) {
        const sessionKey = this.getSessionKey(ctx);
        this.sessionTokens.set(sessionKey, data.session_token);
      }

      return {
        response: data.response,
        conversationId: data.conversation_id,
        authenticated: data.authenticated,
      };
    }, ctx);
  }

  /**
   * Sends a chat message and streams the response via SSE.
   * Uses the streaming endpoint for real-time progressive updates.
   *
   * @param request - The chat request.
   * @param onChunk - Called with each text chunk as it arrives.
   * @param onDone - Called with the full accumulated text when streaming completes.
   * @param onError - Called if an error occurs during streaming.
   * @returns The conversation ID.
   */
  async chatStream(
    request: ChatRequest,
    onChunk: (text: string) => void | Promise<void>,
    onDone: (fullText: string, conversationId: string) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
  ): Promise<string> {
    return this._chatStreamInternal(request, onChunk, onDone, onError, false);
  }

  private async _chatStreamInternal(
    request: ChatRequest,
    onChunk: (text: string) => void | Promise<void>,
    onDone: (fullText: string, conversationId: string) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
    retried: boolean,
  ): Promise<string> {
    let fullText = "";
    let conversationId = "";

    const STREAM_TIMEOUT_MS = 120_000;

    const ctx = {
      platform: request.platform,
      platformUserId: request.platformUserId,
      channelId: request.channelId,
    };

    try {
      const response = await this.client.post(
        "/api/v1/bot/chat-stream",
        {
          message: request.message,
          platform: request.platform,
          platform_user_id: request.platformUserId,
          channel_id: request.channelId,
        },
        {
          responseType: "stream",
          timeout: STREAM_TIMEOUT_MS,
          headers: {
            Accept: "text/event-stream",
            ...this.userHeaders(ctx),
          },
        },
      );

      const stream = response.data as Readable;
      let buffer = "";
      let finished = false;
      let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

      const resetInactivityTimer = (resolve: () => void) => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(async () => {
          if (!finished) {
            finished = true;
            stream.destroy();
            if (fullText) {
              await onDone(fullText, conversationId);
            } else {
              await onError(new Error("Stream timed out"));
            }
            resolve();
          }
        }, 60_000);
      };

      await new Promise<void>((resolve) => {
        resetInactivityTimer(resolve);

        stream.on("data", async (rawChunk: Buffer) => {
          if (finished) return;
          resetInactivityTimer(resolve);
          buffer += rawChunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (finished) return;
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const raw = trimmed.slice(6);
            if (raw === "[DONE]") continue;

            try {
              const data = JSON.parse(raw);
              if (data.error === "not_authenticated") {
                finished = true;
                if (inactivityTimer) clearTimeout(inactivityTimer);
                await onError(new Error("not_authenticated"));
                resolve();
                return;
              }
              if (data.error) {
                finished = true;
                if (inactivityTimer) clearTimeout(inactivityTimer);
                await onError(new Error(data.error));
                resolve();
                return;
              }
              if (data.session_token) {
                const sessionKey = this.getSessionKey(ctx);
                this.sessionTokens.set(sessionKey, data.session_token);
              }
              if (data.text) {
                fullText += data.text;
                await onChunk(data.text);
              }
              if (data.done) {
                finished = true;
                if (inactivityTimer) clearTimeout(inactivityTimer);
                conversationId = data.conversation_id || "";
                await onDone(fullText, conversationId);
                resolve();
                return;
              }
            } catch {}
          }
        });

        stream.on("end", async () => {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (!finished && fullText) {
            finished = true;
            await onDone(fullText, conversationId);
          }
          resolve();
        });

        stream.on("error", async (err: Error) => {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (!finished) {
            finished = true;
            await onError(err);
          }
          resolve();
        });
      });
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;

      if (status === 401 && !retried) {
        this.clearSessionToken(ctx);
        return this._chatStreamInternal(
          request,
          onChunk,
          onDone,
          onError,
          true,
        );
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      await onError(new Error(message));
    }

    return conversationId;
  }

  /**
   * Retrieves or creates a session for a user on a specific platform.
   *
   * @param platform - The platform name (discord, slack, telegram).
   * @param platformUserId - The user's ID on that platform.
   * @param channelId - Optional channel ID to scope the session.
   * @returns Session information including conversation ID.
   * @throws Error if the API request fails.
   */
  async getSession(
    platform: string,
    platformUserId: string,
    channelId?: string,
  ): Promise<SessionInfo> {
    return this.request(async () => {
      const params = new URLSearchParams();
      if (channelId) {
        params.set("channel_id", channelId);
      }

      const { data } = await this.client.get(
        `/api/v1/bot/session/${platform}/${platformUserId}?${params.toString()}`,
        {
          headers: {
            "X-Bot-API-Key": this.apiKey,
          },
        },
      );
      return {
        conversationId: data.conversation_id ?? data.conversationId,
        platform: data.platform,
        platformUserId: data.platform_user_id ?? data.platformUserId,
      } as SessionInfo;
    });
  }

  /**
   * Checks if a platform user is linked to a GAIA account.
   *
   * @param platform - The platform name.
   * @param platformUserId - The platform user ID.
   * @returns Authentication status.
   * @throws Error if the API request fails.
   */
  async checkAuthStatus(
    platform: string,
    platformUserId: string,
  ): Promise<AuthStatus> {
    return this.request(async () => {
      const { data } = await this.client.get<AuthStatus>(
        `/api/v1/bot/auth-status/${platform}/${platformUserId}`,
        {
          headers: {
            "X-Bot-API-Key": this.apiKey,
          },
        },
      );
      return data;
    });
  }

  /**
   * Lists all workflows for the authenticated user.
   */
  async listWorkflows(ctx: BotUserContext): Promise<WorkflowListResponse> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get<WorkflowListResponse>(
        "/api/v1/bot/workflows",
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Creates a new workflow.
   */
  async createWorkflow(
    request: {
      name: string;
      description: string;
      steps?: Record<string, unknown>[];
    },
    ctx: BotUserContext,
  ): Promise<Workflow> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.post<{ workflow: Workflow }>(
        "/api/v1/bot/workflows",
        request,
        { headers: this.userHeaders(ctx) },
      );
      return data.workflow;
    }, ctx);
  }

  /**
   * Gets a specific workflow by ID.
   */
  async getWorkflow(
    workflowId: string,
    ctx: BotUserContext,
  ): Promise<Workflow> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get<{ workflow: Workflow }>(
        `/api/v1/bot/workflows/${workflowId}`,
        { headers: this.userHeaders(ctx) },
      );
      return data.workflow;
    }, ctx);
  }

  /**
   * Executes a workflow.
   */
  async executeWorkflow(
    request: WorkflowExecutionRequest,
    ctx: BotUserContext,
  ): Promise<WorkflowExecutionResponse> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.post<WorkflowExecutionResponse>(
        `/api/v1/bot/workflows/${request.workflow_id}/execute`,
        { inputs: request.inputs },
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Deletes a workflow.
   */
  async deleteWorkflow(workflowId: string, ctx: BotUserContext): Promise<void> {
    return this.requestWithAuth(async () => {
      await this.client.delete(`/api/v1/bot/workflows/${workflowId}`, {
        headers: this.userHeaders(ctx),
      });
    }, ctx);
  }

  /**
   * Lists todos for the authenticated user.
   */
  async listTodos(
    ctx: BotUserContext,
    params?: {
      completed?: boolean;
      project_id?: string;
    },
  ): Promise<TodoListResponse> {
    return this.requestWithAuth(async () => {
      const queryParams = new URLSearchParams();
      if (params?.completed !== undefined) {
        queryParams.set("completed", String(params.completed));
      }
      if (params?.project_id) {
        queryParams.set("project_id", params.project_id);
      }

      const { data } = await this.client.get<TodoListResponse>(
        `/api/v1/bot/todos?${queryParams.toString()}`,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Creates a new todo.
   */
  async createTodo(
    request: CreateTodoRequest,
    ctx: BotUserContext,
  ): Promise<Todo> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.post<Todo>(
        "/api/v1/bot/todos",
        request,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Gets a specific todo by ID.
   */
  async getTodo(todoId: string, ctx: BotUserContext): Promise<Todo> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get<Todo>(
        `/api/v1/bot/todos/${todoId}`,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Updates a todo.
   */
  async updateTodo(
    todoId: string,
    updates: Partial<CreateTodoRequest>,
    ctx: BotUserContext,
  ): Promise<Todo> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.patch<Todo>(
        `/api/v1/bot/todos/${todoId}`,
        updates,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Marks a todo as complete.
   */
  async completeTodo(todoId: string, ctx: BotUserContext): Promise<Todo> {
    return this.updateTodo(todoId, { completed: true }, ctx);
  }

  /**
   * Deletes a todo.
   */
  async deleteTodo(todoId: string, ctx: BotUserContext): Promise<void> {
    return this.requestWithAuth(async () => {
      await this.client.delete(`/api/v1/bot/todos/${todoId}`, {
        headers: this.userHeaders(ctx),
      });
    }, ctx);
  }

  /**
   * Lists conversations for the authenticated user.
   */
  async listConversations(
    ctx: BotUserContext,
    params?: {
      page?: number;
      limit?: number;
    },
  ): Promise<ConversationListResponse> {
    return this.requestWithAuth(async () => {
      const queryParams = new URLSearchParams();
      queryParams.set("page", String(params?.page || 1));
      queryParams.set("limit", String(params?.limit || 10));

      const { data } = await this.client.get<ConversationListResponse>(
        `/api/v1/bot/conversations?${queryParams.toString()}`,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Gets a specific conversation by ID.
   */
  async getConversation(
    conversationId: string,
    ctx: BotUserContext,
  ): Promise<Conversation> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get<Conversation>(
        `/api/v1/bot/conversations/${conversationId}`,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Gets the web URL for a conversation.
   */
  getConversationUrl(conversationId: string): string {
    return `${this.frontendUrl}/chat/${conversationId}`;
  }

  /**
   * Gets weather information for a location.
   * This uses the agent's weather tool via a chat request.
   */
  async getWeather(location: string, ctx: CommandContext): Promise<string> {
    const response = await this.chat({
      message: `What's the weather in ${location}?`,
      platform: ctx.platform,
      platformUserId: ctx.platformUserId,
      channelId: ctx.channelId,
    });
    return response.response;
  }

  /**
   * Searches messages, conversations, and notes.
   */
  async search(query: string, ctx: BotUserContext): Promise<SearchResponse> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get<SearchResponse>(
        `/api/v1/bot/search?query=${encodeURIComponent(query)}`,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  /**
   * Generates a URL for the user to authenticate and link their account.
   *
   * @param platform - The platform name.
   * @param platformUserId - The platform user ID.
   * @returns The full URL for authentication.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  getFrontendUrl(): string {
    return this.frontendUrl;
  }

  getAuthUrl(platform: string, platformUserId: string): string {
    return `${this.frontendUrl}/auth/link-platform?platform=${encodeURIComponent(platform)}&pid=${encodeURIComponent(platformUserId)}`;
  }

  /**
   * Resets the session for a user, creating a fresh conversation.
   *
   * @param platform - The platform name.
   * @param platformUserId - The platform user ID.
   * @param channelId - Optional channel ID.
   * @returns The new session info.
   */
  async resetSession(
    platform: string,
    platformUserId: string,
    channelId?: string,
  ): Promise<SessionInfo> {
    return this.request(async () => {
      const { data } = await this.client.post(
        "/api/v1/bot/session/new",
        {
          platform,
          platform_user_id: platformUserId,
          channel_id: channelId,
        },
        {
          headers: {
            "X-Bot-API-Key": this.apiKey,
          },
        },
      );
      return {
        conversationId: data.conversation_id ?? data.conversationId,
        platform: data.platform,
        platformUserId: data.platform_user_id ?? data.platformUserId,
      } as SessionInfo;
    });
  }
}
