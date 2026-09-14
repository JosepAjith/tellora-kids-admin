export function extractWorkerErrorMessage(result, fallback) {
  if (result == null) return fallback;

  if (typeof result === 'string') {
    const text = result.trim();
    return text || fallback;
  }

  if (typeof result === 'object') {
    const directMessage = typeof result.message === 'string' ? result.message.trim() : '';
    if (directMessage) return directMessage;

    const directError = typeof result.error === 'string' ? result.error.trim() : '';
    if (directError) return directError;

    const nested = result.error && typeof result.error === 'object' ? result.error : null;
    if (nested) {
      const nestedMessage = typeof nested.message === 'string' ? nested.message.trim() : '';
      if (nestedMessage) return nestedMessage;

      const nestedError = typeof nested.error === 'string' ? nested.error.trim() : '';
      if (nestedError) return nestedError;
    }
  }

  return fallback;
}
