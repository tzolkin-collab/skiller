/**
 * Narrow an unknown caught value to a message.
 * AGENTS.md rule 1 forbids `catch (error: any)`; `unknown` plus this helper is
 * the replacement, and rule 5 ("errors are data") means the message must always
 * reach a log or a response rather than being swallowed.
 */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
