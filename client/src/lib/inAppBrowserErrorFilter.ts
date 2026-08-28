/**
 * In-app browser bridge error filter for PostHog autocapture.
 *
 * Facebook and Instagram inject a JavaScript bridge into their own in-app
 * browser WebView. On Android that bridge dies when the user leaves the page,
 * and the still-running injected script then throws "Java object is gone". The
 * frames name the injected script's own functions (`sendDataToNative`,
 * `sendJsBlockingTimeMessage`) — no EventHub code path is on the stack, and
 * nothing user-facing breaks, because the bridge only dies on the way out.
 *
 * Paid Meta traffic keeps landing in that browser, so autocapture keeps sending
 * these errors as $exception events. This filter drops them before they leave
 * the browser. It is dependency free (a type-only posthog-js import) so it can
 * run directly under `node --import tsx` and be driven with fakes.
 */

import type { CaptureResult } from "posthog-js";

/**
 * Bridge function names the in-app browser injects. A $exception whose stack
 * names one of these comes from the injected script, not from EventHub.
 */
const IN_APP_BROWSER_BRIDGE_FUNCTIONS = new Set([
  "sendDataToNative",
  "sendJsBlockingTimeMessage",
]);

/**
 * `before_send` hook. Returns `null` to drop a $exception that comes from an
 * in-app browser bridge, and passes every other event through unchanged.
 */
export function dropInAppBrowserBridgeExceptions(
  event: CaptureResult | null,
): CaptureResult | null {
  if (!event || event.event !== "$exception") return event;

  const exceptions = event.properties?.$exception_list;
  if (!Array.isArray(exceptions)) return event;

  for (const exception of exceptions) {
    const frames = exception?.stacktrace?.frames;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      if (frame && IN_APP_BROWSER_BRIDGE_FUNCTIONS.has(frame.function)) {
        return null;
      }
    }
  }

  return event;
}
