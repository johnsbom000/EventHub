import type { Auth0ContextInterface, AppState, RedirectLoginOptions } from "@auth0/auth0-react";
import type { PopupLoginOptions } from "@auth0/auth0-spa-js";

type LoginWithPopup = Auth0ContextInterface["loginWithPopup"];
type LoginWithRedirect = Auth0ContextInterface["loginWithRedirect"];

export type PopupFirstLoginResult = "popup" | "redirect" | "cancelled";

type PopupFirstLoginArgs = {
  loginWithPopup: LoginWithPopup;
  loginWithRedirect: LoginWithRedirect;
  popupOptions?: PopupLoginOptions;
  redirectOptions?: RedirectLoginOptions<AppState>;
};

function getErrorCode(error: unknown): string {
  const maybeCode = (error as { error?: unknown; code?: unknown } | null)?.error
    ?? (error as { error?: unknown; code?: unknown } | null)?.code;
  return typeof maybeCode === "string" ? maybeCode.toLowerCase().trim() : "";
}

function getErrorMessage(error: unknown): string {
  const maybeMessage = (error as { message?: unknown } | null)?.message;
  return typeof maybeMessage === "string" ? maybeMessage.toLowerCase().trim() : "";
}

function isPopupBlockedError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === "popup_open" || code === "popup_blocked") return true;
  const message = getErrorMessage(error);
  return message.includes("unable to open a popup") || message.includes("window.open returned");
}

function isPopupCancelledOrTimeout(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "cancelled" || code === "timeout";
}

export async function loginWithPopupFirst({
  loginWithPopup,
  loginWithRedirect,
  popupOptions,
  redirectOptions,
}: PopupFirstLoginArgs): Promise<PopupFirstLoginResult> {
  try {
    await loginWithPopup(popupOptions);
    return "popup";
  } catch (error) {
    if (isPopupBlockedError(error)) {
      await loginWithRedirect(redirectOptions);
      return "redirect";
    }

    if (isPopupCancelledOrTimeout(error)) {
      return "cancelled";
    }

    throw error;
  }
}
