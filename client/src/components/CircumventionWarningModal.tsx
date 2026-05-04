import { AlertTriangle, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Hard-block modal ─────────────────────────────────────────────────────────
// Shown when content is blocked before saving (listing, profile, tagline).

type HardBlockModalProps = {
  open: boolean;
  onClose: () => void;
  field: string;
  reason: string;
  warningNumber?: number | null;
  suspended?: boolean;
  suspensionEndsAt?: string | null;
};

export function HardBlockModal({
  open,
  onClose,
  field,
  reason,
  warningNumber,
  suspended,
  suspensionEndsAt,
}: HardBlockModalProps) {
  const warningsLeft = warningNumber != null ? Math.max(0, 3 - warningNumber) : null;

  const suspensionEndFormatted = suspensionEndsAt
    ? new Date(suspensionEndsAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <DialogTitle className="text-destructive">Content blocked</DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-sm text-foreground">
              <p>
                <strong>{field}</strong> was not saved because it appears to contain
                contact information or a link that would route customers off Event Hub.
              </p>
              <p className="text-muted-foreground">{reason}</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">Why this is not allowed</p>
                <p className="mt-1 text-sm">
                  Event Hub connects vendors and customers — sharing contact details
                  directly bypasses the platform and violates our Terms of Service.
                  Your official business contact information is visible through your
                  approved vendor profile.
                </p>
              </div>
              {warningNumber != null && !suspended && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900">
                  <p className="font-medium">
                    Warning {warningNumber} of 3 issued to your account
                  </p>
                  {warningsLeft != null && warningsLeft > 0 && (
                    <p className="mt-1 text-sm">
                      You have {warningsLeft} warning{warningsLeft === 1 ? "" : "s"} remaining
                      before your account is suspended.
                    </p>
                  )}
                  {warningsLeft === 0 && (
                    <p className="mt-1 text-sm">
                      This is your final warning. One more violation will suspend your account.
                    </p>
                  )}
                </div>
              )}
              {suspended && suspensionEndFormatted && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  <p className="font-medium">Your account has been suspended</p>
                  <p className="mt-1 text-sm">
                    Your listings are inactive and you cannot publish new listings until{" "}
                    <strong>{suspensionEndFormatted}</strong>. Existing bookings are not
                    affected. Please contact support if you believe this was an error.
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Please remove the flagged content and save again.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>Got it, I'll fix it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Soft-flag notice ─────────────────────────────────────────────────────────
// Shown after content is saved but queued for admin review.

type SoftFlagNoticeProps = {
  open: boolean;
  onClose: () => void;
  field?: string;
};

export function SoftFlagNotice({ open, onClose, field }: SoftFlagNoticeProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <DialogTitle>Content submitted for review</DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-sm text-foreground">
              <p>
                Your {field ? <strong>{field.toLowerCase()}</strong> : "content"} has been
                saved and is now under review by the Event Hub team.
              </p>
              <p className="text-muted-foreground">
                This happens when content includes phrasing that may direct customers
                off-platform. Most reviews are completed quickly. If no issue is found,
                no action will be taken on your account.
              </p>
              <p className="text-muted-foreground">
                If a violation is confirmed, you will receive a warning and be asked
                to correct the content.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            OK, understood
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Chat hard-block toast payload ───────────────────────────────────────────
// For chat, we use a toast (see BookingChatWorkspace). This is the text content.

export function chatBlockMessage(warningNumber?: number | null, suspended?: boolean) {
  if (suspended) {
    return "Your account is currently suspended. You cannot send messages at this time.";
  }
  const base =
    "That message couldn't be sent — it appears to contain contact information " +
    "(email, phone, website, or social handle). Sharing contact details in chat " +
    "is not permitted on Event Hub.";
  if (warningNumber != null) {
    const left = Math.max(0, 3 - warningNumber);
    if (left > 0) {
      return `${base} Warning ${warningNumber} of 3 has been issued to your account (${left} remaining).`;
    }
    return `${base} This is warning ${warningNumber} of 3. Your account will be suspended on the next violation.`;
  }
  return base;
}

// ─── Suspension banner ────────────────────────────────────────────────────────
// Inline banner used in VendorShell to show an active suspension.

type SuspensionBannerProps = {
  endsAt: string;
  reason?: string;
};

export function SuspensionBanner({ endsAt, reason }: SuspensionBannerProps) {
  const formatted = new Date(endsAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-start gap-3 border-b border-destructive/20 bg-destructive/10 px-6 py-3">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="text-sm text-destructive">
        <p className="font-semibold">Account suspended until {formatted}</p>
        <p className="mt-0.5">
          Your listings are inactive and you cannot publish new listings.{" "}
          {reason ? `Reason: ${reason}.` : ""} Contact support to appeal.
        </p>
      </div>
    </div>
  );
}

// ─── Warning count banner ─────────────────────────────────────────────────────
// Inline banner in VendorShell when vendor has active warnings but no suspension.

type WarningCountBannerProps = {
  warningCount: number;
};

export function WarningCountBanner({ warningCount }: WarningCountBannerProps) {
  const left = Math.max(0, 3 - warningCount);
  if (warningCount === 0) return null;

  return (
    <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="text-sm text-amber-900">
        <p className="font-semibold">
          Policy warning{warningCount > 1 ? "s" : ""} on your account ({warningCount} of 3)
        </p>
        <p className="mt-0.5">
          {left > 0
            ? `You have ${left} warning${left === 1 ? "" : "s"} remaining before your account is suspended for 30 days.`
            : "This is your final warning. The next violation will suspend your account for 30 days."}
          {" "}These warnings are issued when content appears to share contact information or
          redirect customers off Event Hub.
        </p>
      </div>
    </div>
  );
}
