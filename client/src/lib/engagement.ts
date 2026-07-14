import { trackBoth } from "./tracking";

export function initEngagement() {
  let fired = false;
  const start = Date.now();

  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener("scroll", onScroll);
  };

  const fire = (reason: string) => {
    if (fired) return;
    fired = true;
    trackBoth(
      "vendor_engaged",
      { reason, seconds: Math.round((Date.now() - start) / 1000) },
      { event: "VendorEngaged", standard: false }
    );
    cleanup();
  };

  const onScroll = () => {
    const pct =
      ((window.scrollY + window.innerHeight) / document.body.scrollHeight) * 100;
    if (pct >= 25) fire("scroll_25");
  };

  const timer = setTimeout(() => fire("dwell_30s"), 30_000);
  window.addEventListener("scroll", onScroll, { passive: true });

  return cleanup;
}
