/**
 * @module @gaia/shared/bots
 *
 * Shared bot library for all GAIA platform integrations (Discord, Slack, Telegram).
 *
 * Architecture overview:
 * - types/    - Shared TypeScript interfaces (ChatRequest, CommandContext, etc.)
 * - api/      - GaiaClient: single HTTP client for all bot-to-backend communication
 * - config/   - Environment variable loader (GAIA_API_URL, GAIA_BOT_API_KEY, etc.)
 * - utils/    - Reusable logic split into three layers:
 *     - formatters.ts  - Pure display functions (formatTodo, formatBotError, etc.)
 *     - commands.ts    - Business-logic handlers (handleTodoList, handleSearch, etc.)
 *     - streaming.ts   - handleStreamingChat: shared streaming + throttled editing
 *
 * When adding a new bot command:
 * 1. Add types to types/index.ts and API method to api/index.ts (GaiaClient)
 * 2. Add a formatter in formatters.ts if there's display logic
 * 3. Add a shared handler in commands.ts that calls GaiaClient + formatter
 * 4. In each bot, write a thin adapter: extract platform args -> call shared handler -> reply
 *
 * When adding a new platform bot:
 * 1. Create a new directory under apps/bots/<platform>/
 * 2. Import GaiaClient, shared handlers, and STREAMING_DEFAULTS from @gaia/shared
 * 3. Wire up platform-specific command registration and event listeners
 * 4. Use handleStreamingChat for chat commands - just provide editMessage callbacks
 */
export * from "./api";
export * from "./config";
export * from "./types";
export * from "./utils";
