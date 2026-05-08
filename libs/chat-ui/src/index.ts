// @heygaia/chat-ui — public API.
// All exports from the GAIA chat feature, extracted so they can be reused
// across surfaces (web app, motion studio, demos).

// === Core chat bubbles ===
export { default as ChatBubbleUser } from "./features/chat/components/bubbles/user/ChatBubbleUser";
export { default as ChatBubbleBot } from "./features/chat/components/bubbles/bot/ChatBubbleBot";
export { default as TextBubble } from "./features/chat/components/bubbles/bot/TextBubble";
export { default as ImageBubble } from "./features/chat/components/bubbles/bot/ImageBubble";
export { default as ThinkingBubble } from "./features/chat/components/bubbles/bot/ThinkingBubble";
export { default as FollowUpActions } from "./features/chat/components/bubbles/bot/FollowUpActions";
export { default as ToolCallsSection } from "./features/chat/components/bubbles/bot/ToolCallsSection";

// === Interface ===
export { LoadingIndicator } from "./features/chat/components/interface/LoadingIndicator";
export { default as ChatRenderer } from "./features/chat/components/interface/ChatRenderer";
export { default as MarkdownRenderer } from "./features/chat/components/interface/MarkdownRenderer";

// === Types ===
export type { ChatBubbleUserProps, ChatBubbleBotProps } from "./types/features/chatBubbleTypes";
export type * from "./types/features/baseMessageTypes";
export type * from "./types/features/convoTypes";
export type * from "./types/features/toolDataTypes";

// === Tool registries ===
export * from "./config/registries/toolRegistry";
