/**
 * Stub for chat-ui — real impl in apps/web. Replace at integration time.
 */
interface ConversationListItem {
  conversation_id: string;
  description: string;
  title: string;
  starred?: boolean;
  is_system_generated?: boolean;
  system_purpose?: unknown;
  is_unread?: boolean;
  user_id?: string;
  created_at: string;
  updated_at: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export const useConversationList = (): {
  conversations: ConversationListItem[];
  paginationMeta: null;
} => ({
  conversations: [],
  paginationMeta: null,
});
