/**
 * OpenAI Chat Completions: GPT-5.x and reasoning models reject `max_tokens` and
 * require `max_completion_tokens` instead.
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */
export function openaiChatCompletionTokenParams(
  modelId: string,
  maxTokens: number
): { max_tokens: number } | { max_completion_tokens: number } {
  const m = modelId.toLowerCase();
  if (
    m.startsWith("gpt-5") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  ) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens };
}
