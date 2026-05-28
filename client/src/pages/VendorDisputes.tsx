import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale, ChevronDown, ChevronUp, Paperclip, X, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
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

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function filingBadgeClass(type: string): string {
  const map: Record<string, string> = {
    travel_cost_recovery:     "bg-amber-100 text-amber-800",
    damage_claim:             "bg-red-100 text-red-800",
    customer_no_show:         "bg-orange-100 text-orange-800",
    service_not_as_described: "bg-purple-100 text-purple-800",
    vendor_no_show:           "bg-red-100 text-red-800",
    safety_concern:           "bg-red-200 text-red-900",
    admin_note:               "bg-blue-100 text-blue-800",
    other:                    "bg-gray-100 text-gray-700",
  };
  return map[type] ?? "bg-gray-100 text-gray-700";
}

// ─── Case Card ────────────────────────────────────────────────────────────────

function CaseCard({ c }: { c: DisputeCase }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const latestFiling = c.filings[c.filings.length - 1];
  const filingCount = c.filings.length;

  function statusBadge(status: string) {
    const colorMap: Record<string, string> = {
      open:           "bg-yellow-100 text-yellow-800",
      pending_review: "bg-blue-100 text-blue-800",
      resolved:       "bg-green-100 text-green-800",
    };
    const labelMap: Record<string, string> = {
      open:           t("vendorDisputes.statusOpen"),
      pending_review: t("vendorDisputes.statusUnderReview"),
      resolved:       t("vendorDisputes.statusResolved"),
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${colorMap[status] ?? "bg-gray-100 text-gray-600"}`}>
        {labelMap[status] ?? status}
      </span>
    );
  }

  function filingTypeLabel(type: string): string {
    const map: Record<string, string> = {
      travel_cost_recovery:     t("vendorDisputes.typeTravel"),
      damage_claim:             t("vendorDisputes.typeDamage"),
      customer_no_show:         t("vendorDisputes.typeNoShow"),
      service_not_as_described: t("vendorDisputes.typeNotDescribed"),
      vendor_no_show:           t("vendorDisputes.typeVendorNoShow"),
      safety_concern:           t("vendorDisputes.typeSafety"),
      admin_note:               t("vendorDisputes.typeAdminNote"),
      other:                    t("vendorDisputes.typeOther"),
    };
    return map[type] ?? type;
  }

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
                {c.listing_title_snapshot ?? t("vendorDisputes.bookingFallback")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("vendorDisputes.event")}: {fmt(c.event_date)}
              {c.customer_name ? ` · ${c.customer_name}` : ""}
              {" · "}{t("vendorDisputes.filing", { count: filingCount })}
              {latestFiling ? ` · ${t("vendorDisputes.lastActivity")}: ${fmt(latestFiling.created_at)}` : ""}
            </p>
          </div>
          {open ? <ChevronUp className="h-4 w-4 mt-1 shrink-0" /> : <ChevronDown className="h-4 w-4 mt-1 shrink-0" />}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 pb-4 px-4 space-y-4">
          {c.case_status === "resolved" && c.resolution && (
            <div className="rounded bg-green-50 border border-green-200 p-3">
              <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">{t("vendorDisputes.resolvedHeading")}</p>
              <p className="text-sm text-green-800">{c.resolution}</p>
              {c.resolved_at && <p className="text-xs text-green-600 mt-1">{fmtTime(c.resolved_at)}</p>}
            </div>
          )}

          <div className="border-l-2 border-muted pl-4 space-y-4">
            {c.filings.map((f, fi) => (
              <div key={f.id}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{fmtTime(f.created_at)}</span>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-xs font-medium capitalize">
                    {f.filed_by === "vendor" ? t("vendorDisputes.youLabel") : f.filed_by}
                  </span>
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
                        {t("vendorDisputes.attachment")} {fi + i + 1}
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
  const { t } = useTranslation();
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

  const VENDOR_DISPUTE_TYPES = [
    { value: "travel_cost_recovery", label: t("vendorDisputes.typeTravelFull") },
    { value: "damage_claim",         label: t("vendorDisputes.typeDamageFull") },
    { value: "customer_no_show",     label: t("vendorDisputes.typeNoShowFull") },
    { value: "other",                label: t("vendorDisputes.typeOtherFull") },
  ];

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
      toast({ title: t("vendorDisputes.toastSuccessTitle"), description: t("vendorDisputes.toastSuccessDesc") });
      handleClose();
    },
    onError: () => {
      toast({ title: t("vendorDisputes.toastErrorTitle"), description: t("vendorDisputes.toastErrorDesc"), variant: "destructive" });
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
      else toast({ title: t("vendorDisputes.toastUploadFailed"), variant: "destructive" });
    } catch {
      toast({ title: t("vendorDisputes.toastUploadFailed"), variant: "destructive" });
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
          <Scale className="h-4 w-4" /> {t("vendorDisputes.modalTitle")}
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {t("vendorDisputes.stepOf", { step })}
        </DialogDescription>

        {/* Step 1 — Select booking */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("vendorDisputes.step1Title")}</p>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder={t("vendorDisputes.searchPlaceholder")}
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded p-1">
              {filteredBookings.length === 0 && (
                <p className="text-sm text-muted-foreground p-2 text-center">{t("vendorDisputes.noBookingsFound")}</p>
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
                  <span className="font-medium">{b.listing_title_snapshot ?? t("vendorDisputes.bookingFallback")}</span>
                  <span className="text-xs ml-2 opacity-75">
                    {b.event_date ? fmt(b.event_date) : ""}{b.customer_name ? ` · ${b.customer_name}` : ""}
                  </span>
                  {b.existing_case_id && (
                    <span className="ml-2 text-xs text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">{t("vendorDisputes.existingCase")}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Select dispute type */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("vendorDisputes.step2Title")}</p>
            <div className="space-y-2">
              {VENDOR_DISPUTE_TYPES.map((dt) => (
                <label
                  key={dt.value}
                  className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                    disputeType === dt.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="disputeType"
                    value={dt.value}
                    checked={disputeType === dt.value}
                    onChange={() => setDisputeType(dt.value)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">{dt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Details + uploads */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm font-medium">{t("vendorDisputes.step3Title")}</p>
            <Textarea
              placeholder={
                disputeType === "travel_cost_recovery"
                  ? t("vendorDisputes.placeholderTravel")
                  : t("vendorDisputes.placeholderGeneral")
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">{description.length}/3000</p>

            <div>
              <p className="text-sm font-medium mb-2">
                {t("vendorDisputes.attachmentsLabel")} {disputeType === "travel_cost_recovery" && <span className="text-red-500">*</span>}
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                {disputeType === "travel_cost_recovery"
                  ? t("vendorDisputes.attachmentHintTravel")
                  : t("vendorDisputes.attachmentHintGeneral")}
              </p>
              {attachmentUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 text-sm mb-1">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[260px]">
                    {t("vendorDisputes.attachment")} {i + 1}
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
                  {uploading ? t("vendorDisputes.uploading") : t("vendorDisputes.addFile")}
                </button>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileUpload} />
            </div>
          </div>
        )}

        {/* Step 4 — Review */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("vendorDisputes.step4Title")}</p>
            <div className="rounded bg-muted/40 p-3 space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">{t("vendorDisputes.reviewBooking")}:</span>{" "}
                {selectedBooking?.listing_title_snapshot ?? "—"} · {fmt(selectedBooking?.event_date)}
              </div>
              <div>
                <span className="text-muted-foreground">{t("vendorDisputes.reviewDisputeType")}:</span>{" "}
                {VENDOR_DISPUTE_TYPES.find((d) => d.value === disputeType)?.label ?? disputeType}
              </div>
              <div>
                <span className="text-muted-foreground">{t("vendorDisputes.reviewDescription")}:</span>{" "}
                {description}
              </div>
              {attachmentUrls.length > 0 && (
                <div>
                  <span className="text-muted-foreground">{t("vendorDisputes.reviewAttachments")}:</span>{" "}
                  {t("vendorDisputes.files", { count: attachmentUrls.length })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("vendorDisputes.reviewNote")}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" size="sm" onClick={step === 1 ? handleClose : () => setStep((s) => (s - 1) as any)}>
            {step === 1 ? t("vendorDisputes.cancel") : t("vendorDisputes.back")}
          </Button>
          {step < 4 ? (
            <Button size="sm" disabled={!canAdvance} onClick={() => setStep((s) => (s + 1) as any)}>
              {t("vendorDisputes.continue")}
            </Button>
          ) : (
            <Button size="sm" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              {submitMutation.isPending ? t("vendorDisputes.submitting") : t("vendorDisputes.submit")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VendorDisputes() {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const { data: cases = [], isLoading } = useQuery<DisputeCase[]>({
    queryKey: ["/api/vendor/disputes"],
  });

  return (
    <VendorShell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-bold">{t("vendorDisputes.pageTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("vendorDisputes.pageSubtitle")}</p>
          </div>
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("vendorDisputes.fileButton")}
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">{t("vendorDisputes.loading")}</p>}

        {!isLoading && cases.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <Scale className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">{t("vendorDisputes.noDisputesTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("vendorDisputes.noDisputesBody")}
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
