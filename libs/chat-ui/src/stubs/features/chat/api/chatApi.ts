/**
 * Stub for chat-ui — real impl in apps/web. Replace at integration time.
 */
import type { EventSourceMessage } from "@microsoft/fetch-event-source";

import type { SelectedCalendarEventData } from "@/stores/calendarEventSelectionStore";
import type { MessageType } from "@/types/features/convoTypes";
import type { WorkflowData } from "@/types/features/workflowTypes";
import type { FileData } from "@/types/shared/fileTypes";

export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  url?: string;
  description?: string;
  message?: string;
}

export interface GenerateImageResponse {
  url: string;
  improved_prompt?: string;
}

// Enums copied verbatim — pure data.
export enum SystemPurpose {
  EMAIL_PROCESSING = "email_processing",
  WORKFLOW_EXECUTION = "workflow_execution",
  OTHER = "other",
}

export enum ConversationSource {
  WEB = "web",
  MOBILE = "mobile",
  TELEGRAM = "telegram",
  DISCORD = "discord",
  SLACK = "slack",
  WHATSAPP = "whatsapp",
  WORKFLOW_SYSTEM = "workflow_system",
}

export interface Conversation {
  _id: string;
  user_id: string;
  conversation_id: string;
  description: string;
  starred?: boolean;
  is_system_generated?: boolean;
  system_purpose?: SystemPurpose;
  is_unread?: boolean;
  source?: ConversationSource;
  createdAt: string;
  updatedAt?: string;
}

export interface ConversationWithMessages {
  id: string;
  title: string;
  messages: MessageType[];
}

export interface FetchConversationsResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ConversationSyncItem {
  conversation_id: string;
  last_updated?: string;
}

export const chatApi = {
  fetchConversations: async (
    _page = 1,
    _limit = 20,
  ): Promise<FetchConversationsResponse> => ({
    conversations: [],
    total: 0,
    page: 1,
    limit: 20,
    total_pages: 0,
  }),

  batchSyncConversations: async (
    _conversations: ConversationSyncItem[],
  ): Promise<{
    conversations: {
      conversation_id: string;
      description: string;
      starred?: boolean;
      is_system_generated?: boolean;
      system_purpose?: SystemPurpose;
      is_unread?: boolean;
      createdAt: string;
      updatedAt?: string;
      messages: MessageType[];
    }[];
  }> => ({ conversations: [] }),

  uploadFile: async (_file: File): Promise<FileUploadResponse> => ({
    fileId: "",
    fileName: "",
    fileSize: 0,
    contentType: "",
  }),

  generateImage: async (
    _prompt: string,
  ): Promise<GenerateImageResponse> => ({ url: "" }),

  togglePinMessage: async (
    _conversationId: string,
    _messageId: string,
    _pinned: boolean,
  ): Promise<void> => {},

  fetchMessages: async (_conversationId: string): Promise<MessageType[]> => [],

  toggleStarConversation: async (
    _conversationId: string,
    _starred: boolean,
  ): Promise<void> => {},

  deleteConversation: async (_conversationId: string): Promise<void> => {},

  deleteAllConversations: async (): Promise<void> => {},

  renameConversation: async (
    _conversationId: string,
    _title: string,
  ): Promise<void> => {},

  markAsRead: async (_conversationId: string): Promise<void> => {},

  markAsUnread: async (_conversationId: string): Promise<void> => {},

  fetchChatStream: async (
    _inputText: string,
    _convoMessages: MessageType[],
    _conversationId: string | null | undefined,
    _onMessage: (
      event: EventSourceMessage,
    ) => undefined | string | Promise<undefined | string>,
    _onClose: () => void,
    _onError: (err: Error) => void,
    _fileData: FileData[] = [],
    _selectedTool: string | null = null,
    _toolCategory: string | null = null,
    _externalController?: AbortController,
    _selectedWorkflow: WorkflowData | null = null,
    _selectedCalendarEvent: SelectedCalendarEventData | null = null,
    _replyToMessage: {
      id: string;
      content: string;
      role: "user" | "assistant";
    } | null = null,
  ): Promise<void> => {},
};
