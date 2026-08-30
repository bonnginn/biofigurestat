export function resolveFeedbackFormUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    // A configured support URL is static. Never permit credentials or a URL
    // fragment that could be mistaken for application-supplied project data.
    if (url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function configuredFeedbackFormUrl(): string | null {
  return resolveFeedbackFormUrl(import.meta.env.VITE_FEEDBACK_FORM_URL);
}
