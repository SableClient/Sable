import { copyToClipboard } from '$utils/dom';

/**
 * Shares text via the native share sheet on mobile (Tauri + sharekit),
 * the Web Share API on web (PWA), or falls back to clipboard copy when no
 * share API is available. Returns true if the text was shared or copied;
 * false if the user cancelled the share sheet.
 */
export async function shareText(text: string): Promise<boolean> {
  // 1. Tauri mobile: use sharekit plugin
  try {
    const { type: osType } = await import('@tauri-apps/plugin-os');
    if (osType() === 'android' || osType() === 'ios') {
      const { shareText: sharekitShare } = await import('@choochmeque/tauri-plugin-sharekit-api');
      await sharekitShare(text);
      return true;
    }
  } catch {
    // Tauri plugin not available — fall through
  }

  // 2. Web: try navigator.share if available (PWA context, not Tauri)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch {
      return false;
    }
  }

  // 3. Fallback: clipboard copy when no share API is available
  return copyToClipboard(text);
}
