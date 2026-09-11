/** Accept local paths only, including after WHATWG URL normalization. */
export function safeRedirectPath(value: string | null, origin: string, fallback = '/account') {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const target = new URL(value, origin);
    return target.origin === new URL(origin).origin ? target.pathname + target.search + target.hash : fallback;
  } catch { return fallback; }
}
