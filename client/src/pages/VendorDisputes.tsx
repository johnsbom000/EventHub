import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale, ChevronDown, ChevronUp, Paperclip, X, Plus } from "lucide-react";
import VendorShell from "@/components/VendorShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Filing = {
  id: string;
  case_id: string;
  filed_by: "customer" | "vendor" | "admin";
  dispute_type: string;
  description: string;
  attachment_urls: string[];
  claim_amount_cents: number | null;
  created_at: string;
  filer_customer_name: string | null;
  filer_vendor_name: string | null;
};

type DisputeCase = {
  case_id: string;
  booking_id: string;
  case_status: "open" | "pending_review" | "resolved";
  resolution: string | null;
  resolved_at: string | null;
  case_created_at: string;
  case_updated_at: string;
  event_date: string | null;
  listing_title_snapshot: string | null;
  booking_status: string;
  customer_name: string | null;
  filings: Filing[];
};

type BookingOption = {
  id: string;
  status: string;
  event_date: string | null;
  listing_title_snapshot: string | null;
  customer_name: string | null;
  existing_case_id: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VENDOR_DISPUTE_TYPES: { value: string; label: string }[] = [
  { value: "travel_cost_recovery", label: "Travel Cost Recovery — customer cancelled after I committed to travel" },
  { value: "damage_claim",         label: "Damage / Property Claim — customer damaged my equipment" },
  { value: "customer_no_show",     label: "Customer No-Show" },
  { value: "other",                label: "Other" },
];

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    open:           "bg-yellow-100 text-yellow-800",
    pending_review: "bg-blue-100 text-blue-800",
    resolved:       "bg-green-100 text-green-800",
  };
  const label: Record<string, string> = {
    open:           "Open",
    pending_review: "Under Review",
    resolved:       "Resolved",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {label[status] ?? status}
    </span>
  );
}

function filingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    travel_cost_recovery:   "Travel Cost Recovery",
    damage_claim:           "Damage Claim",
    customer_no_show:       "Customer No-Show",
    service_not_as_described: "Service Not As Described",
    vendor_no_show:         "Vendor No-Show",
    safety_concern:         "Safety Concern",
    admin_note:             "Admin Note",
    other:                  "Other",
  };
  return map[type] ?? type;
}

function filingBadgeClass(type: string): string {
  const map: Record<string, string> = {
    travel_cost_recovery:   "bg-amber-100 text-amber-800",
    damage_claim:           "bg-red-100 text-red-800",
    customer_no_show:       "bg-orange-100 text-orange-800",
    service_not_as_described: "bg-purple-100 text-purple-800",
    vendor_no_show:         "bg-red-100 text-red-800",
    safety_concern:         "bg-red-200 text-red-900",
    admin_note:             "bg-blue-100 text-blue-800",
    other:                  "bg-gray-100 text-gray-700",
  };
  return map[type] ?? "bg-gray-100 text-gray-700";
}

// ─── Case Card ────────────────────────────────────────────────────────────────

function CaseCard({ c }: { c: DisputeCase }) {
  const [open, setOpen] = useState(false);

  const latestFiling = c.filings[c.filings.length - 1];
  const filingCount = c.filings.length;

  return (
    <Card className="mb-3">
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge(c.case_status)}
              <span className="text-sm font-semibold truncate">
                {c.listing_title_snapshot ?? "Booking"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Event: {fmt(c.event_date)}
              {c.customer_name ? ` · ${c.customer_name}` : ""}
              {" · "}{filingCount} filing{filingCount !== 1 ? "s" : ""}
              {latestFiling ? ` · Last activity: ${fmt(latestFiling.created_at)}` : ""}
            </p>
          </div>
          {open ? <ChevronUp className="h-4 w-4 mt-1 shrink-0" /> : <ChevronDown className="h-4 w-4 mt-1 shrink-0" />}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 pb-4 px-4 space-y-4">
          {c.case_status === "resolved" && c.resolution && (
            <div className="rounded bg-green-50 border border-green-200 p-3">
              <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Resolved</p>
              <p className="text-sm text-green-800">{c.resolution}</p>
              {c.resolved_at && <p className="text-xs text-green-600 mt-1">{fmtTime(c.resolved_at)}</p>}
            </div>
          )}

          <div className="border-l-2 border-muted pl-4 space-y-4">
            {c.filings.map((f) => (
              <div key={f.id}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{fmtTime(f.created_at)}</span>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-xs font-medium capitalize">{f.filed_by === "vendor" ? "You" : f.filed_by}</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${filingBadgeClass(f.dispute_type)}`}>
                    {filingTypeLabel(f.dispute_type)}
                  </span>
                </div>
                {f.description && (
                  <p className="text-sm whitespace-pre-wrap text-foreground">{f.description}</p>
                )}
                {f.attachment_urls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {f.attachment_urls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Paperclip className="h-3 w-3" />
                        Attachment {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── File Dispute Modal ───────────────────────────────────────────────────────

function FileDisputeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedBooking, setSelectedBooking] = useState<BookingOption | null>(null);
  const [disputeType, setDisputeType] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");

  const { data: bookings = [] } = useQuery<BookingOption[]>({
    queryKey: ["/api/vendor/disputes/bookings"],
    enabled: open,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/vendor/disputes", {
        bookingId: selectedBooking!.id,
        disputeType,
        description,
        attachmentUrls,
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vendor/disputes"] });
      toast({ title: "Dispute filed", description: "Your case has been submitted for review." });
      handleClose();
    },
    onError: () => {
      toast({ title: "Failed to submit", description: "Please try again.", variant: "destructive" });
    },
  });

  function handleClose() {
    setStep(1);
    setSelectedBooking(null);
    setDisputeType("");
    setDescription("");
    setAttachmentUrls([]);
    setBookingSearch("");
    onClose();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/dispute-attachment", { method: "POST", body: form });
      const data = await res.json();
      if (data.url) setAttachmentUrls((prev) => [...prev, data.url]);
      else toast({ title: "Upload failed", variant: "destructive" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const filteredBookings = bookings.filter((b) => {
    const q = bookingSearch.toLowerCase();
    return (
      !q ||
      b.listing_title_snapshot?.toLowerCase().includes(q) ||
      b.customer_name?.toLowerCase().includes(q) ||
      b.event_date?.includes(q)
    );
  });

  const canAdvance =
    (step === 1 && !!selectedBooking) ||
    (step === 2 && !!disputeType) ||
    (step === 3 && description.trim().length >= 10);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4" /> File a Dispute
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Step {step} of 4
        </DialogDescription>

        {/* Step 1 — Select booking */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Which booking is this about?</p>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Search by listing name, customer, or date…"
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded p-1">
              {filteredBookings.length === 0 && (
                <p className="text-sm text-muted-foreground p-2 text-center">No bookings found</p>
              )}
              {filteredBookings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBooking(b)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedBooking?.id === b.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{b.listing_title_snapshot ?? "Booking"}</span>
                  <span className="text-xs ml-2 opacity-75">
                    {b.event_date ? fmt(b.event_date) : ""}{b.customer_name ? ` · ${b.customer_name}` : ""}
                  </span>
                  {b.existing_case_id && (
                    <span className="ml-2 text-xs text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">Case open — adding to existing</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Select dispute type */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">What is this dispute about?</p>
            <div className="space-y-2">
              {VENDOR_DISPUTE_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                    disputeType === t.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="disputeType"
                    value={t.value}
                    checked={disputeType === t.value}
                    onChange={() => setDisputeType(t.value)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">{t.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Details + uploads */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm font-medium">Describe what happened</p>
            <Textarea
              placeholder={
                disputeType === "travel_cost_recovery"
                  ? "Describe the travel you committed to (e.g. I booked a non-refundable round-trip flight and hotel room before the customer cancelled)."
                  : "Provide as much detail as possible about what happened."
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">{description.length}/3000</p>

            <div>
              <p className="text-sm font-medium mb-2">
                Attachments {disputeType === "travel_cost_recovery" && <span className="text-red-500">*</span>}
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                {disputeType === "travel_cost_recovery"
                  ? "Upload receipts proving you committed to travel (flight confirmation, hotel booking, etc.). PDF, JPG, or PNG. Up to 5 files."
                  : "Upload any supporting evidence (photos, documents). Optional. Up to 5 files."}
              </p>
              {attachmentUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 text-sm mb-1">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[260px]">
                    Attachment {i + 1}
                  </a>
                  <button onClick={() => setAttachmentUrls((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              {attachmentUrls.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed rounded px-3 py-2 w-full justify-center mt-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {uploading ? "Uploading…" : "Add file"}
                </button>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileUpload} />
            </div>
          </div>
        )}

        {/* Step 4 — Review */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Review your filing</p>
            <div className="rounded bg-muted/40 p-3 space-y-2 text-sm">
              <div><span className="text-muted-foreground">Booking:</span> {selectedBooking?.listing_title_snapshot ?? "—"} · {fmt(selectedBooking?.event_date)}</div>
              <div><span className="text-muted-foreground">Dispute type:</span> {filingTypeLabel(disputeType)}</div>
              <div><span className="text-muted-foreground">Description:</span> {description}</div>
              {attachmentUrls.length > 0 && (
                <div><span className="text-muted-foreground">Attachments:</span> {attachmentUrls.length} file{attachmentUrls.length !== 1 ? "s" : ""}</div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">EventHub will review your case and respond within 3 business days.</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" size="sm" onClick={step === 1 ? handleClose : () => setStep((s) => (s - 1) as any)}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 4 ? (
            <Button size="sm" disabled={!canAdvance} onClick={() => setStep((s) => (s + 1) as any)}>
              Continue
            </Button>
          ) : (
            <Button size="sm" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              {submitMutation.isPending ? "Submitting…" : "Submit Dispute"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VendorDisputes() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: cases = [], isLoading } = useQuery<DisputeCase[]>({
    queryKey: ["/api/vendor/disputes"],
  });

  return (
    <VendorShell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-bold">Disputes</h1>
            <p className="text-sm text-muted-foreground mt-1">File and track disputes related to your bookings.</p>
          </div>
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> File a Dispute
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && cases.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <Scale className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No disputes yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                If you have an issue with a booking, use the button above to file a case.
              </p>
            </CardContent>
          </Card>
        )}

        {cases.map((c) => <CaseCard key={c.case_id} c={c} />)}
      </div>

      <FileDisputeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </VendorShell>
  );
}
