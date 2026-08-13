/**
 * Narrow an unknown caught value to a displayable message.
 * `catch (e: unknown)` is the only form allowed by AGENTS.md rule 1.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
