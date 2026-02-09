import axios, { type AxiosInstance } from "axios";
import type {
  AuthStatus,
  ChatRequest,
  ChatResponse,
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

/**
 * Client for interacting with the GAIA Backend Bot API.
 * Handles authentication, chat interactions, sessions, and platform linking status.
 */
export class GaiaClient {
  private client: AxiosInstance;
  private baseUrl: string;

  /**
   * Creates a new GaiaClient instance.
   *
   * @param baseUrl - The base URL of the GAIA API (e.g., http://localhost:8000)
   * @param apiKey - The secure bot API key for server-to-server communication
   */
  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
        "X-Bot-API-Key": apiKey,
      },
    });
  }

  /**
   * Sends a chat message to the GAIA agent on behalf of an authenticated user.
   *
   * @param request - The chat request containing message, platform, and user ID.
   * @returns The agent's response and session details.
   * @throws Error if the API request fails.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const { data } = await this.client.post<ChatResponse>(
        "/api/v1/bot/chat",
        {
          message: request.message,
          platform: request.platform,
          platform_user_id: request.platformUserId,
          channel_id: request.channelId,
        },
      );

      return {
        response: data.response,
        conversationId: data.conversation_id,
        authenticated: data.authenticated,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Sends a public (unauthenticated) chat message to the GAIA agent.
   * This is used for public mentions where user identity is not strictly linked.
   *
   * @param request - The chat request containing message and platform details.
   * @returns The agent's response.
   * @throws Error if the API request fails.
   */
  async chatPublic(request: ChatRequest): Promise<ChatResponse> {
    try {
      const { data } = await this.client.post<ChatResponse>(
        "/api/v1/bot/chat/public",
        {
          message: request.message,
          platform: request.platform,
          platform_user_id: request.platformUserId,
        },
      );

      return {
        response: data.response,
        conversationId: data.conversation_id,
        authenticated: false,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
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
    const params = new URLSearchParams();
    if (channelId) {
      params.set("channel_id", channelId);
    }

    try {
      const { data } = await this.client.get<SessionInfo>(
        `/api/v1/bot/session/${platform}/${platformUserId}?${params.toString()}`,
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
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
    try {
      const { data } = await this.client.get<AuthStatus>(
        `/api/v1/bot-auth/status/${platform}/${platformUserId}`,
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Lists all workflows for the authenticated user.
   */
  async listWorkflows(): Promise<WorkflowListResponse> {
    try {
      const { data } =
        await this.client.get<WorkflowListResponse>("/api/v1/workflows");
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Creates a new workflow.
   */
  async createWorkflow(request: {
    name: string;
    description: string;
    steps?: Record<string, unknown>[];
  }): Promise<Workflow> {
    try {
      const { data } = await this.client.post<{ workflow: Workflow }>(
        "/api/v1/workflows",
        request,
      );
      return data.workflow;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Gets a specific workflow by ID.
   */
  async getWorkflow(workflowId: string): Promise<Workflow> {
    try {
      const { data } = await this.client.get<{ workflow: Workflow }>(
        `/api/v1/workflows/${workflowId}`,
      );
      return data.workflow;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Executes a workflow.
   */
  async executeWorkflow(
    request: WorkflowExecutionRequest,
  ): Promise<WorkflowExecutionResponse> {
    try {
      const { data } = await this.client.post<WorkflowExecutionResponse>(
        `/api/v1/workflows/${request.workflow_id}/execute`,
        { inputs: request.inputs },
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Deletes a workflow.
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      await this.client.delete(`/api/v1/workflows/${workflowId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Lists todos for the authenticated user.
   */
  async listTodos(params?: {
    completed?: boolean;
    project_id?: string;
  }): Promise<TodoListResponse> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.completed !== undefined) {
        queryParams.set("completed", String(params.completed));
      }
      if (params?.project_id) {
        queryParams.set("project_id", params.project_id);
      }

      const { data } = await this.client.get<TodoListResponse>(
        `/api/v1/todos?${queryParams.toString()}`,
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Creates a new todo.
   */
  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    try {
      const { data } = await this.client.post<Todo>("/api/v1/todos", request);
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Gets a specific todo by ID.
   */
  async getTodo(todoId: string): Promise<Todo> {
    try {
      const { data } = await this.client.get<Todo>(`/api/v1/todos/${todoId}`);
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Updates a todo.
   */
  async updateTodo(
    todoId: string,
    updates: Partial<CreateTodoRequest>,
  ): Promise<Todo> {
    try {
      const { data } = await this.client.patch<Todo>(
        `/api/v1/todos/${todoId}`,
        updates,
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Marks a todo as complete.
   */
  async completeTodo(todoId: string): Promise<Todo> {
    return this.updateTodo(todoId, { completed: true });
  }

  /**
   * Deletes a todo.
   */
  async deleteTodo(todoId: string): Promise<void> {
    try {
      await this.client.delete(`/api/v1/todos/${todoId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Lists conversations for the authenticated user.
   */
  async listConversations(params?: {
    page?: number;
    limit?: number;
  }): Promise<ConversationListResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("page", String(params?.page || 1));
      queryParams.set("limit", String(params?.limit || 10));

      const { data } = await this.client.get<ConversationListResponse>(
        `/api/v1/conversations?${queryParams.toString()}`,
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Gets a specific conversation by ID.
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    try {
      const { data } = await this.client.get<Conversation>(
        `/api/v1/conversations/${conversationId}`,
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Gets the web URL for a conversation.
   */
  getConversationUrl(conversationId: string): string {
    return `${this.baseUrl}/chat/${conversationId}`;
  }

  /**
   * Gets weather information for a location.
   * This uses the agent's weather tool via a chat request.
   */
  async getWeather(
    location: string,
    platform: string,
    platformUserId: string,
  ): Promise<string> {
    try {
      const response = await this.chat({
        message: `What's the weather in ${location}?`,
        platform,
        platformUserId,
      });
      return response.response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Searches messages, conversations, and notes.
   */
  async search(query: string): Promise<SearchResponse> {
    try {
      const { data } = await this.client.get<SearchResponse>(
        `/api/v1/search?query=${encodeURIComponent(query)}`,
      );
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new Error(`API error: ${status || message}`);
    }
  }

  /**
   * Generates a URL for the user to authenticate and link their account.
   *
   * @param platform - The platform name.
   * @param platformUserId - The platform user ID.
   * @returns The full URL for authentication.
   */
  getAuthUrl(platform: string, platformUserId: string): string {
    const params = new URLSearchParams({
      platform,
      platform_user_id: platformUserId,
    });
    return `${this.baseUrl}/bot-auth/link/${platform}?${params.toString()}`; // Adjusted URL path to match backend
  }
}
