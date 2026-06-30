// Meta Pixel (Facebook Pixel) loader.
//
// The official Meta snippet is normally pasted as an inline <script> in the
// document <head>. We can't do that here: production sends a strict
// Content-Security-Policy (see server/index.ts) with no 'unsafe-inline' in
// script-src, so an inline pixel script is blocked from executing — which is
// exactly why `fbq` was undefined in production even though the markup was
// present. Running the loader from a bundled module instead means it is served
// from 'self' and always executes, with no CSP weakening. The only CSP
// additions required are Facebook's own domains in script-src / connect-src /
// img-src.

export const META_PIXEL_ID = "1047034731185783";

/**
 * Define `window.fbq`, load fbevents.js, and initialise the pixel.
 *
 * Idempotent and safe to call before render. PageView is intentionally NOT
 * fired here — useTrackPageView already fires PageView on first load and on
 * every client-side route change, so firing it here too would double-count.
 */
export function initMetaPixel(): void {
  if (typeof window === "undefined") return;
  if (window.fbq) return; // already initialised (e.g. React StrictMode re-invoke)

  /* eslint-disable */
  // Verbatim Meta Pixel loader, adapted to run inside a bundled module.
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */

  // The loader above synchronously defines window.fbq; cast through `any`
  // because TS still has it narrowed to `undefined` from the guard above.
  (window as any).fbq("init", META_PIXEL_ID);
}
