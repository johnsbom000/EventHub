// Cross-page persistence for the vendor onboarding tour.
//
// Each vendor page mounts its own VendorShell, so the tour's in-progress state
// (whether it's running and which step) cannot live in component state — it
// would reset on every navigation. We persist it in localStorage, keyed by
// account, so the next VendorShell that mounts can resume mid-tour. The
// permanent "never show again" gate is still the server-side
// dashboard_tour_completed_at; this only tracks an in-flight tour.

function activeKey(accountId?: string | null) {
  return accountId ? `eventhub:vendor-tour:active:${accountId}` : "eventhub:vendor-tour:active";
}

function stepKey(accountId?: string | null) {
  return accountId ? `eventhub:vendor-tour:step:${accountId}` : "eventhub:vendor-tour:step";
}

export function isTourActive(accountId?: string | null): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(activeKey(accountId)) === "1";
}

export function readTourStep(accountId?: string | null): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(stepKey(accountId));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function startTourProgress(accountId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeKey(accountId), "1");
  window.localStorage.setItem(stepKey(accountId), "0");
}

export function writeTourStep(accountId: string | null | undefined, step: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(stepKey(accountId), String(step));
}

export function clearTourProgress(accountId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(activeKey(accountId));
  window.localStorage.removeItem(stepKey(accountId));
}
