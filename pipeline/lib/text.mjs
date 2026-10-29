// The prompts ask for a tldr of at most two sentences; models sometimes write three. Enforce it in code.
export function limitSentences(text, max = 2) {
  const parts = String(text || '').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  return parts.length <= max ? parts.join(' ') : parts.slice(0, max).join(' ');
}
