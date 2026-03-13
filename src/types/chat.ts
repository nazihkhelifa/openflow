/**
 * Chat Types
 *
 * Types for the conversational workflow planning interface.
 */

/** Role in conversation */
export type ChatRole = 'user' | 'assistant' | 'system';

/** Single message in conversation */
export interface ChatMessage {
  /** Unique message ID */
  id: string;
  /** Who sent the message */
  role: ChatRole;
  /** Message content (markdown supported) */
  content: string;
  /** When message was created */
  createdAt: Date;
}

/** State of the chat conversation */
export interface ConversationState {
  /** All messages in the conversation */
  messages: ChatMessage[];
  /** Whether AI is currently responding */
  isLoading: boolean;
  /** Current error if any */
  error: string | null;
}

/** Request body for /api/chat */
export interface ChatRequest {
  /** Message history */
  messages: Array<{
    role: ChatRole;
    content: string;
  }>;
}
