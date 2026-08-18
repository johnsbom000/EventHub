import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import VendorShell from "@/components/VendorShell";
import { Button } from "@/components/ui/button";
import { DiscountModal } from "@/components/DiscountModal";
import { useUpgradeModal } from "@/components/UpgradeModal";
import type { VendorMeState } from "@/lib/vendorState";
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  TicketPercent,
  Megaphone,
  CalendarRange,
  Users,
  Loader2,
  Sparkles,
} from "lucide-react";

interface Discount {
  id: string;
  discountType: "promo_code" | "public_sale";
  code?: string | null;
  percentOff: number;
  startsAt: string;
  endsAt: string;
  maxUses?: number | null;
  usedCount: number;
  active: boolean;
  listingIds: string[];
  status: "active" | "scheduled" | "expired";
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

const TAB_KEYS: Discount["status"][] = ["active", "scheduled", "expired"];

export default function VendorDiscounts() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();
  const upgrade = useUpgradeModal();

  const { data: me } = useQuery<VendorMeState>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated,
  });
  const hasProFeatures = Boolean(me?.hasProFeatures);

  const [activeTab, setActiveTab] = useState<Discount["status"]>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ discounts: Discount[] }>({
    queryKey: ["/api/vendor/discounts"],
    enabled: isAuthenticated,
  });

  const discounts = data?.discounts ?? [];
  const tabDiscounts = discounts.filter((d) => d.status === activeTab);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/vendor/discounts/${id}`);
      if (!res.ok) throw new Error("Failed to delete discount");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/discounts"] });
      setConfirmDeleteId(null);
    },
  });

  function openCreate() {
    if (!hasProFeatures) {
      upgrade.open();
      return;
    }
    setEditingDiscount(null);
    setModalOpen(true);
  }

  function openEdit(d: Discount) {
    if (!hasProFeatures) {
      upgrade.open();
      return;
    }
    setEditingDiscount(d);
    setModalOpen(true);
  }

  const counts = {
    active: discounts.filter((d) => d.status === "active").length,
    scheduled: discounts.filter((d) => d.status === "scheduled").length,
    expired: discounts.filter((d) => d.status === "expired").length,
  };

  return (
    <VendorShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[#2a3a42]">{t("vendorDiscounts.pageTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("vendorDiscounts.subtitle")}
            </p>
          </div>
          <Button
            onClick={openCreate}
            className="bg-[#e07a6a] text-white hover:bg-[#c9695a] gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("vendorDiscounts.newDiscount")}
          </Button>
        </div>

        {/* Pro gate: discounts & promos require Pro features. */}
        {!hasProFeatures ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#4a6a7d]/30 bg-[#4a6a7d]/8 px-4 py-3" data-testid="discounts-pro-banner">
            <Sparkles className="h-4 w-4 shrink-0 text-[#4a6a7d]" />
            <p className="flex-1 text-sm text-[#2a3a42]">
              Discounts &amp; promos are a Pro feature. Upgrade to create promo codes and run public sales.
            </p>
            <Button onClick={() => upgrade.open()} size="sm" className="bg-[#4a6a7d] hover:bg-[#3f5c6d] text-[#f5f0e8]">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Upgrade to Pro
            </Button>
          </div>
        ) : null}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[rgba(74,106,125,0.22)]">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                activeTab === key
                  ? "text-[#e07a6a] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-[#e07a6a]"
                  : "text-muted-foreground hover:text-[#2a3a42]"
              }`}
            >
              {key === "active" ? t("vendorDiscounts.tabActive") : key === "scheduled" ? t("vendorDiscounts.tabScheduled") : t("vendorDiscounts.tabExpired")}
              {counts[key] > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    activeTab === key
                      ? "bg-[#e07a6a]/15 text-[#e07a6a]"
                      : "bg-[rgba(74,106,125,0.1)] text-[#4a6a7d]"
                  }`}
                >
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tabDiscounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Tag className="h-10 w-10 text-[rgba(74,106,125,0.3)]" />
            <p className="text-muted-foreground text-sm">
              {activeTab === "active"
                ? t("vendorDiscounts.emptyActive")
                : activeTab === "scheduled"
                  ? t("vendorDiscounts.emptyScheduled")
                  : t("vendorDiscounts.emptyExpired")}
            </p>
            {activeTab === "active" && (
              <Button
                variant="outline"
                size="sm"
                onClick={openCreate}
                className="gap-1.5 border-[rgba(74,106,125,0.22)] text-[#4a6a7d]"
              >
                <Plus className="h-4 w-4" />
                {t("vendorDiscounts.newDiscount")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tabDiscounts.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-[rgba(74,106,125,0.22)] bg-white px-5 py-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Type icon */}
                    <div className="mt-0.5 shrink-0 rounded-lg bg-[#f5f0e8] p-2">
                      {d.discountType === "promo_code" ? (
                        <TicketPercent className="h-4 w-4 text-[#e07a6a]" />
                      ) : (
                        <Megaphone className="h-4 w-4 text-[#4a6a7d]" />
                      )}
                    </div>

                    <div className="min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-semibold text-[#2a3a42] text-[15px]">
                          {d.discountType === "promo_code" && d.code ? (
                            <span className="font-mono tracking-wider">{d.code}</span>
                          ) : (
                            t("vendorDiscounts.typePublicSale")
                          )}
                        </span>
                        <span className="rounded-full bg-[#e07a6a] px-2 py-0.5 text-xs font-bold text-white">
                          {d.percentOff}% OFF
                        </span>
                        {d.discountType === "promo_code" && (
                          <span className="rounded-full border border-[rgba(74,106,125,0.22)] px-2 py-0.5 text-[11px] text-[#4a6a7d]">
                            {t("vendorDiscounts.typePromoCode")}
                          </span>
                        )}
                        {d.discountType === "public_sale" && (
                          <span className="rounded-full border border-[rgba(74,106,125,0.22)] px-2 py-0.5 text-[11px] text-[#4a6a7d]">
                            {t("vendorDiscounts.sale")}
                          </span>
                        )}
                      </div>

                      {/* Meta row */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarRange className="h-3 w-3" />
                          {formatDate(d.startsAt)} – {formatDate(d.endsAt)}
                        </span>
                        {d.discountType === "promo_code" && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {d.usedCount} {t("vendorDiscounts.used")}
                            {d.maxUses != null ? ` / ${d.maxUses} max` : ""}
                          </span>
                        )}
                        <span>
                          {d.listingIds.length} {d.listingIds.length !== 1 ? t("vendorDiscounts.listings") : t("vendorDiscounts.listing")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {d.status !== "expired" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(d)}
                        className="h-8 w-8 text-muted-foreground hover:text-[#2a3a42]"
                        title={t("vendorDiscounts.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {confirmDeleteId === d.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{t("vendorDiscounts.deleteTitle")}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(d.id)}
                          disabled={deleteMutation.isPending}
                          className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
                        >
                          {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("vendorDiscounts.deleteConfirmYes")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                          className="h-7 px-2 text-xs"
                        >
                          {t("vendorDiscounts.deleteConfirmNo")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDeleteId(d.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        title={t("vendorDiscounts.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DiscountModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingDiscount={editingDiscount}
      />
    </VendorShell>
  );
}
