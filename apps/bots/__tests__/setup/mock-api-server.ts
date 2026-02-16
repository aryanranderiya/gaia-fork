import http from "node:http";

export interface MockApiState {
  requests: RecordedRequest[];
  chatResponse: {
    response: string;
    conversation_id: string;
    authenticated: boolean;
  };
  streamChunks: string[];
  streamError: string | null;
  streamConversationId: string;
  sessionResponse: {
    conversation_id: string;
    platform: string;
    platform_user_id: string;
  };
  authStatus: {
    authenticated: boolean;
    platform: string;
    platform_user_id: string;
  };
  workflows: {
    workflows: Array<{
      id: string;
      name: string;
      description: string;
      status: string;
    }>;
  };
  todos: {
    todos: Array<{
      id: string;
      title: string;
      completed: boolean;
      priority?: string;
      due_date?: string;
      description?: string;
    }>;
    total: number;
  };
  conversations: {
    conversations: Array<{
      conversation_id: string;
      title: string;
      created_at: string;
      updated_at: string;
      message_count: number;
    }>;
    total: number;
    page: number;
  };
  searchResponse: {
    messages: Record<string, unknown>[];
    conversations: Record<string, unknown>[];
    notes: Record<string, unknown>[];
  };
  errorStatus: number | null;
  errorMessage: string | null;
  streamDelayMs: number;
  apiKey: string;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

function defaultState(): MockApiState {
  return {
    requests: [],
    chatResponse: {
      response: "Hello from GAIA!",
      conversation_id: "conv-123",
      authenticated: true,
    },
    streamChunks: ["Hello ", "from ", "GAIA!"],
    streamError: null,
    streamConversationId: "conv-stream-123",
    sessionResponse: {
      conversation_id: "conv-session-123",
      platform: "discord",
      platform_user_id: "user-123",
    },
    authStatus: {
      authenticated: true,
      platform: "discord",
      platform_user_id: "user-123",
    },
    workflows: {
      workflows: [
        {
          id: "wf-1",
          name: "Test Workflow",
          description: "A test workflow",
          status: "active",
        },
      ],
    },
    todos: {
      todos: [
        {
          id: "todo-1",
          title: "Test Todo",
          completed: false,
          priority: "high",
        },
      ],
      total: 1,
    },
    conversations: {
      conversations: [
        {
          conversation_id: "conv-1",
          title: "Test Conversation",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T01:00:00Z",
          message_count: 5,
        },
      ],
      total: 1,
      page: 1,
    },
    searchResponse: {
      messages: [{ id: "msg-1", text: "test" }],
      conversations: [{ id: "conv-1" }],
      notes: [],
    },
    errorStatus: null,
    errorMessage: null,
    streamDelayMs: 0,
    apiKey: "test-api-key",
  };
}

export class MockApiServer {
  private server: http.Server;
  private _port = 0;
  state: MockApiState;

  constructor() {
    this.state = defaultState();
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  get port(): number {
    return this._port;
  }

  get baseUrl(): string {
    return `http://localhost:${this._port}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, () => {
        const addr = this.server.address();
        if (addr && typeof addr !== "string") {
          this._port = addr.port;
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  reset(): void {
    this.state = defaultState();
  }

  getLastRequest(): RecordedRequest | undefined {
    return this.state.requests[this.state.requests.length - 1];
  }

  getRequestsByPath(path: string): RecordedRequest[] {
    return this.state.requests.filter((r) => r.url?.startsWith(path));
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const body = await this.readBody(req);
    const recorded: RecordedRequest = {
      method: req.method || "GET",
      url: req.url || "/",
      headers: req.headers,
      body,
    };
    this.state.requests.push(recorded);

    // Check API key
    const apiKey = req.headers["x-bot-api-key"];
    if (apiKey !== this.state.apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Invalid API key" }));
      return;
    }

    // Check if error should be returned
    if (this.state.errorStatus) {
      res.writeHead(this.state.errorStatus, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ detail: this.state.errorMessage || "Error" }));
      return;
    }

    const url = req.url || "/";
    const method = req.method || "GET";

    try {
      if (method === "POST" && url === "/api/v1/bot/chat") {
        this.handleChat(res);
      } else if (method === "POST" && url === "/api/v1/bot/chat/public") {
        this.handleChatPublic(res);
      } else if (method === "POST" && url === "/api/v1/bot/chat-stream") {
        await this.handleChatStream(res);
      } else if (method === "GET" && url.startsWith("/api/v1/bot/session/")) {
        this.handleGetSession(url, res);
      } else if (method === "POST" && url === "/api/v1/bot/session/new") {
        this.handleResetSession(res);
      } else if (
        method === "GET" &&
        url.startsWith("/api/v1/bot/auth-status/")
      ) {
        this.handleAuthStatus(url, res);
      } else if (
        method === "GET" &&
        url.startsWith("/api/v1/bot/workflows") &&
        !url.includes("/execute")
      ) {
        this.handleGetWorkflows(url, res);
      } else if (
        method === "POST" &&
        url.includes("/api/v1/bot/workflows") &&
        url.includes("/execute")
      ) {
        this.handleExecuteWorkflow(res);
      } else if (method === "POST" && url === "/api/v1/bot/workflows") {
        this.handleCreateWorkflow(body, res);
      } else if (
        method === "DELETE" &&
        url.startsWith("/api/v1/bot/workflows/")
      ) {
        this.handleDeleteWorkflow(res);
      } else if (method === "GET" && url.startsWith("/api/v1/bot/todos")) {
        this.handleGetTodos(res);
      } else if (method === "POST" && url === "/api/v1/bot/todos") {
        this.handleCreateTodo(body, res);
      } else if (method === "PATCH" && url.startsWith("/api/v1/bot/todos/")) {
        this.handleUpdateTodo(url, body, res);
      } else if (method === "DELETE" && url.startsWith("/api/v1/bot/todos/")) {
        this.handleDeleteTodo(res);
      } else if (
        method === "GET" &&
        url.startsWith("/api/v1/bot/conversations")
      ) {
        this.handleGetConversations(url, res);
      } else if (method === "GET" && url.startsWith("/api/v1/bot/search")) {
        this.handleSearch(res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: `Not found: ${method} ${url}` }));
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Internal server error" }));
    }
  }

  private handleChat(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.state.chatResponse));
  }

  private handleChatPublic(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ ...this.state.chatResponse, authenticated: false }),
    );
  }

  private async handleChatStream(res: http.ServerResponse): Promise<void> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    if (this.state.streamError) {
      res.write(
        `data: ${JSON.stringify({ error: this.state.streamError })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    for (const chunk of this.state.streamChunks) {
      if (this.state.streamDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.state.streamDelayMs));
      }
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    res.write(
      `data: ${JSON.stringify({ done: true, conversation_id: this.state.streamConversationId })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  }

  private handleGetSession(url: string, res: http.ServerResponse): void {
    const parts = url.replace("/api/v1/bot/session/", "").split("/");
    const response = {
      ...this.state.sessionResponse,
      platform: parts[0] || this.state.sessionResponse.platform,
      platform_user_id:
        parts[1]?.split("?")[0] || this.state.sessionResponse.platform_user_id,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  private handleResetSession(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.state.sessionResponse));
  }

  private handleAuthStatus(url: string, res: http.ServerResponse): void {
    const parts = url.replace("/api/v1/bot/auth-status/", "").split("/");
    const response = {
      ...this.state.authStatus,
      platform: parts[0] || this.state.authStatus.platform,
      platform_user_id: parts[1] || this.state.authStatus.platform_user_id,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  private handleGetWorkflows(url: string, res: http.ServerResponse): void {
    const path = url.split("?")[0];
    if (path !== "/api/v1/bot/workflows") {
      const wfId = path.replace("/api/v1/bot/workflows/", "");
      const wf = this.state.workflows.workflows.find((w) => w.id === wfId);
      if (wf) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ workflow: wf }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Workflow not found" }));
      }
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.state.workflows));
  }

  private handleExecuteWorkflow(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        execution_id: "exec-123",
        status: "running",
      }),
    );
  }

  private handleCreateWorkflow(body: unknown, res: http.ServerResponse): void {
    const b = body as Record<string, unknown>;
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        workflow: {
          id: "wf-new",
          name: b?.name || "New Workflow",
          description: b?.description || "",
          status: "draft",
        },
      }),
    );
  }

  private handleDeleteWorkflow(res: http.ServerResponse): void {
    res.writeHead(204);
    res.end();
  }

  private handleGetTodos(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.state.todos));
  }

  private handleCreateTodo(body: unknown, res: http.ServerResponse): void {
    const b = body as Record<string, unknown>;
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "todo-new",
        title: b?.title || "New Todo",
        completed: false,
        priority: b?.priority || undefined,
        description: b?.description || undefined,
      }),
    );
  }

  private handleUpdateTodo(
    url: string,
    body: unknown,
    res: http.ServerResponse,
  ): void {
    const todoId = url.replace("/api/v1/bot/todos/", "");
    const b = body as Record<string, unknown>;
    const existing = this.state.todos.todos.find((t) => t.id === todoId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: todoId,
        title: existing?.title || "Updated Todo",
        completed: b?.completed ?? existing?.completed ?? false,
        priority: existing?.priority,
      }),
    );
  }

  private handleDeleteTodo(res: http.ServerResponse): void {
    res.writeHead(204);
    res.end();
  }

  private handleGetConversations(url: string, res: http.ServerResponse): void {
    const path = url.split("?")[0];
    if (path !== "/api/v1/bot/conversations") {
      const convId = path.replace("/api/v1/bot/conversations/", "");
      const conv = this.state.conversations.conversations.find(
        (c) => c.conversation_id === convId,
      );
      if (conv) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(conv));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Conversation not found" }));
      }
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.state.conversations));
  }

  private handleSearch(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.state.searchResponse));
  }

  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        if (!raw) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      });
    });
  }
}
