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
  SettingsResponse,
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
 * Client for interacting with the GAIA Backend API.
 *
 * Bot requests are authenticated via:
 * 1. X-Bot-API-Key + X-Bot-Platform + X-Bot-Platform-User-Id headers
 *    (handled by BotAuthMiddleware which sets request.state.user)
 * 2. Optional Authorization: Bearer <jwt> for faster subsequent requests
 *
 * This allows bots to use the same endpoints as the web app.
 */
export class GaiaClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private frontendUrl: string;
  private apiKey: string;
  private sessionTokens: Map<string, string> = new Map();

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

  /**
   * Build headers for authenticated bot requests.
   * Always includes X-Bot-API-Key and platform headers.
   * Optionally includes JWT session token for faster auth.
   */
  private userHeaders(ctx: BotUserContext) {
    const sessionKey = this.getSessionKey(ctx);
    const sessionToken = this.sessionTokens.get(sessionKey);

    const headers: Record<string, string> = {
      "X-Bot-API-Key": this.apiKey,
      "X-Bot-Platform": ctx.platform,
      "X-Bot-Platform-User-Id": ctx.platformUserId,
    };

    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    return headers;
  }

  private clearSessionToken(ctx: BotUserContext): void {
    const sessionKey = this.getSessionKey(ctx);
    this.sessionTokens.delete(sessionKey);
  }

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
   * Sends a chat message to the GAIA agent (authenticated users only).
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
   * Streams a chat response via SSE (authenticated users only).
   */
  async chatStream(
    request: ChatRequest,
    onChunk: (text: string) => void | Promise<void>,
    onDone: (fullText: string, conversationId: string) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
  ): Promise<string> {
    return this._chatStreamInternal(
      request,
      onChunk,
      onDone,
      onError,
      false,
      "/api/v1/bot/chat-stream",
    );
  }

  /**
   * Streams a chat response for unauthenticated @mentions.
   * Uses guild-based rate limiting instead of user auth.
   */
  async chatMention(
    request: ChatRequest,
    onChunk: (text: string) => void | Promise<void>,
    onDone: (fullText: string, conversationId: string) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
  ): Promise<string> {
    return this._chatStreamInternal(
      request,
      onChunk,
      onDone,
      onError,
      false,
      "/api/v1/bot/chat-mention",
    );
  }

  private async _chatStreamInternal(
    request: ChatRequest,
    onChunk: (text: string) => void | Promise<void>,
    onDone: (fullText: string, conversationId: string) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
    retried: boolean,
    endpoint: string,
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
        endpoint,
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
          endpoint,
        );
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      await onError(new Error(message));
    }

    return conversationId;
  }

  /**
   * Retrieves or creates a session for a user on a specific platform.
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
            "X-Bot-Platform": platform,
            "X-Bot-Platform-User-Id": platformUserId,
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
            "X-Bot-Platform": platform,
            "X-Bot-Platform-User-Id": platformUserId,
          },
        },
      );
      return data;
    });
  }

  /**
   * Gets user settings including account info, integrations, and selected model.
   */
  async getSettings(
    platform: string,
    platformUserId: string,
  ): Promise<SettingsResponse> {
    return this.request(async () => {
      const { data } = await this.client.get(
        `/api/v1/bot/settings/${platform}/${platformUserId}`,
        {
          headers: {
            "X-Bot-API-Key": this.apiKey,
            "X-Bot-Platform": platform,
            "X-Bot-Platform-User-Id": platformUserId,
          },
        },
      );
      return {
        authenticated: data.authenticated,
        userName: data.user_name ?? null,
        accountCreatedAt: data.account_created_at ?? null,
        profileImageUrl: data.profile_image_url ?? null,
        selectedModelName: data.selected_model_name ?? null,
        selectedModelIconUrl: data.selected_model_icon_url ?? null,
        connectedIntegrations:
          data.connected_integrations?.map(
            (i: { name: string; logo_url?: string; status: string }) => ({
              name: i.name,
              logoUrl: i.logo_url ?? null,
              status: i.status,
            }),
          ) ?? [],
      };
    });
  }

  /**
   * Lists all workflows for the authenticated user.
   * Uses the regular /api/v1/workflows endpoint via bot middleware auth.
   */
  async listWorkflows(ctx: BotUserContext): Promise<WorkflowListResponse> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get<WorkflowListResponse>(
        "/api/v1/workflows",
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
        "/api/v1/workflows",
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
        `/api/v1/workflows/${workflowId}`,
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
        `/api/v1/workflows/${request.workflow_id}/execute`,
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
      await this.client.delete(`/api/v1/workflows/${workflowId}`, {
        headers: this.userHeaders(ctx),
      });
    }, ctx);
  }

  /**
   * Lists todos for the authenticated user.
   * Uses the regular /api/v1/todos endpoint via bot middleware auth.
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

      const { data } = await this.client.get(
        `/api/v1/todos?${queryParams.toString()}`,
        { headers: this.userHeaders(ctx) },
      );

      // Map from regular API format (data/meta) to bot format (todos/total)
      const todos = (data.data || data.todos || []).map(mapTodoResponse);
      const total = data.meta?.total ?? data.total ?? todos.length;

      return { todos, total };
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
      const { data } = await this.client.post("/api/v1/todos", request, {
        headers: this.userHeaders(ctx),
      });
      return mapTodoResponse(data);
    }, ctx);
  }

  /**
   * Gets a specific todo by ID.
   */
  async getTodo(todoId: string, ctx: BotUserContext): Promise<Todo> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get(`/api/v1/todos/${todoId}`, {
        headers: this.userHeaders(ctx),
      });
      return mapTodoResponse(data);
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
      const { data } = await this.client.put(
        `/api/v1/todos/${todoId}`,
        updates,
        { headers: this.userHeaders(ctx) },
      );
      return mapTodoResponse(data);
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
      await this.client.delete(`/api/v1/todos/${todoId}`, {
        headers: this.userHeaders(ctx),
      });
    }, ctx);
  }

  /**
   * Lists conversations for the authenticated user.
   * Uses the regular /api/v1/conversations endpoint via bot middleware auth.
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

      const { data } = await this.client.get(
        `/api/v1/conversations?${queryParams.toString()}`,
        { headers: this.userHeaders(ctx) },
      );

      // Map from regular API format to bot format
      const conversations = (data.conversations || []).map(
        mapConversationResponse,
      );

      return {
        conversations,
        total: data.total ?? conversations.length,
        page: data.page ?? 1,
      };
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
      const { data } = await this.client.get(
        `/api/v1/conversations/${conversationId}`,
        { headers: this.userHeaders(ctx) },
      );
      return mapConversationResponse(data);
    }, ctx);
  }

  getConversationUrl(conversationId: string): string {
    return `${this.frontendUrl}/c/${conversationId}`;
  }

  /**
   * Gets weather information via the agent.
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
   * Uses the regular /api/v1/search endpoint via bot middleware auth.
   */
  async search(query: string, ctx: BotUserContext): Promise<SearchResponse> {
    return this.requestWithAuth(async () => {
      const { data } = await this.client.get<SearchResponse>(
        `/api/v1/search?query=${encodeURIComponent(query)}`,
        { headers: this.userHeaders(ctx) },
      );
      return data;
    }, ctx);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getFrontendUrl(): string {
    return this.frontendUrl;
  }

  /**
   * Creates a secure, time-limited link token for platform account linking.
   * The token is stored in Redis and expires after 10 minutes.
   */
  async createLinkToken(
    platform: string,
    platformUserId: string,
  ): Promise<{ token: string; authUrl: string }> {
    return this.request(async () => {
      const { data } = await this.client.post(
        "/api/v1/bot/create-link-token",
        {
          platform,
          platform_user_id: platformUserId,
        },
        {
          headers: {
            "X-Bot-API-Key": this.apiKey,
          },
        },
      );
      return {
        token: data.token,
        authUrl: data.auth_url,
      };
    });
  }

  /**
   * Resets the session for a user, creating a fresh conversation.
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
            "X-Bot-Platform": platform,
            "X-Bot-Platform-User-Id": platformUserId,
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

/**
 * Maps a todo response from the regular API format to the bot-expected format.
 */
function mapTodoResponse(data: Record<string, unknown>): Todo {
  return {
    id: (data.id as string) || "",
    title: (data.title as string) || "",
    description: data.description as string | undefined,
    completed: (data.completed as boolean) || false,
    priority: data.priority as "low" | "medium" | "high" | undefined,
    due_date: data.due_date as string | undefined,
    project_id: data.project_id as string | undefined,
  };
}

/**
 * Maps a conversation response from the regular API format to the bot-expected format.
 */
function mapConversationResponse(
  data: Record<string, unknown>,
): Conversation {
  return {
    conversation_id:
      (data.conversation_id as string) || (data.id as string) || "",
    title: (data.description as string) || (data.title as string) || undefined,
    created_at:
      (data.createdAt as string) || (data.created_at as string) || "",
    updated_at:
      (data.updatedAt as string) || (data.updated_at as string) || "",
    message_count: data.message_count as number | undefined,
  };
}
