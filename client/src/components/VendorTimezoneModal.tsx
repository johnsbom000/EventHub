import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimezoneSelect, detectBrowserTimezone } from "@/components/TimezoneSelect";
import { Clock } from "lucide-react";

const DISMISSED_KEY = "eventhub.vendor.tz.confirmed";

export function useShowTimezoneModal(operatingTimezone: string | undefined | null): boolean {
  if (typeof window === "undefined") return false;
  if (!operatingTimezone || operatingTimezone !== "UTC") return false;
  if (localStorage.getItem(DISMISSED_KEY)) return false;
  return true;
}

interface VendorTimezoneModalProps {
  open: boolean;
  onClose: () => void;
}

export function VendorTimezoneModal({ open, onClose }: VendorTimezoneModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState(detectBrowserTimezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: "https://eventhub-api" },
      });
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ operatingTimezone: timezone }),
      });
      if (!res.ok) throw new Error("Failed to save timezone");
      localStorage.setItem(DISMISSED_KEY, "1");
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmUtc = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleConfirmUtc(); }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-5 w-5 text-[#E07A6A]" />
            <DialogTitle>Set your timezone</DialogTitle>
          </div>
          <DialogDescription>
            Your account timezone is currently set to UTC, which can cause booking times and
            Google Calendar events to appear at the wrong time. Please confirm your timezone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tz-modal-select">Timezone</Label>
            <TimezoneSelect
              id="tz-modal-select"
              value={timezone}
              onChange={setTimezone}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || !timezone}>
              {saving ? "Saving…" : "Save timezone"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
