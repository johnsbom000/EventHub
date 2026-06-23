import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Flag, MessageSquare, ShieldAlert, Sparkles } from "lucide-react";
import { Filter } from "bad-words";
import { Chat, Channel, ChannelHeader, MessageInput, MessageList, Thread, Window, useMessageComposer } from "stream-chat-react";
import { StreamChat, type Message as StreamMessage, type SendMessageOptions, type LocalMessage } from "stream-chat";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

import { apiRequest, ApiRequestError } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { chatBlockMessage } from "@/components/CircumventionWarningModal";
import { detectChatCircumvention } from "@shared/circumvention";
import { useTranslation } from "react-i18next";

const stripePromise = (() => {
  const key = ((import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) || "").trim();
  return key.startsWith("pk_") ? loadStripe(key) : Promise.resolve(null);
})();

type Role = "customer" | "vendor";

type Conversation = {
  bookingId: string;
  eventId: string | null;
  counterpartName: string;
  eventDate: string | null;
  eventTitle: string | null;
  status: string | null;
  paymentStatus: string | null;
  paymentInfoCollected: boolean;
  retentionExpiresAt: string | null;
  expired: boolean;
  unreadCount: number;
  hasUnread: boolean;
  isInquiry?: boolean;
  vendorAccountId?: string | null;
};

type EventGroup = {
  key: string;
  eventId: string | null;
  eventTitle: string;
  eventDate: string | null;
  conversations: Conversation[];
  unreadCount: number;
};

type ChatBootstrapResponse = {
  streamApiKey: string;
  streamToken: string;
  streamUser: {
    id: string;
    name: string;
  };
  channel: {
    type: string;
    id: string;
    cid: string;
  };
  booking: {
    id: string;
    eventDate: string | null;
    eventTitle: string | null;
    counterpartName: string;
  };
  policyWarning: string;
  retentionExpiresAt: string | null;
};

const TOXIC_PATTERN = /\b(kill yourself|go die|i will hurt you|i'll hurt you|hate you)\b/gi;

// Circumvention detection (patterns + detectChatCircumvention) lives in
// @shared/circumvention so the AI reply assistant on the server holds generated
// drafts to the same off-platform policy as typed messages.

function formatDate(value: string | null, fallback: string, locale?: string) {
  if (!value) return fallback;
  const asDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(asDate.getTime())) return value;
  return asDate.toLocaleDateString(locale || "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeStatus(value: string | null | undefined) {
  const safe = (value || "").trim();
  if (!safe) return "unknown";
  return safe.replace(/_/g, " ");
}

function moderateText(filter: Filter, input: string) {
  const raw = input || "";
  const hasProfanity = filter.isProfane(raw);
  const hasToxic = TOXIC_PATTERN.test(raw);
  const cleanedProfanity = filter.clean(raw);
  const cleanedAll = cleanedProfanity.replace(TOXIC_PATTERN, "[redacted]");
  const flagged = hasProfanity || hasToxic;
  const reason = hasProfanity ? "profanity" : hasToxic ? "toxicity" : null;
  return {
    flagged,
    reason,
    sanitizedText: cleanedAll,
  };
}

function getConversationEventKey(conversation: Conversation) {
  if (conversation.eventId && conversation.eventId.trim().length > 0) {
    return `id:${conversation.eventId}`;
  }
  const title = (conversation.eventTitle || "Event").trim().toLowerCase();
  const date = (conversation.eventDate || "").trim();
  return `name:${title}|date:${date}`;
}

type PendingTravelFeePayment = {
  clientSecret: string;
  proposalId: string;
  amountCents: number;
  bookingId: string;
};

function TravelFeePaymentForm({
  pending,
  onSuccess,
  onClose,
}: {
  pending: PendingTravelFeePayment;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmCardPayment(pending.clientSecret, {
      payment_method: { card: cardElement },
    });

    if (result.error) {
      setError(result.error.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }

    try {
      const confirmRes = await apiRequest(
        "POST",
        `/api/bookings/${pending.bookingId}/travel-fee-proposals/${pending.proposalId}/confirm-payment`
      );
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to confirm payment");
      }
      toast({ title: "Travel fee paid", description: "The vendor has been notified." });
      onSuccess();
    } catch (err: any) {
      setError(err?.message || "Payment confirmed but failed to finalize. Contact support.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You are paying a travel / delivery fee of{" "}
        <span className="font-semibold text-foreground">{fmt(pending.amountCents)}</span>.
      </p>
      <div className="rounded-md border p-3">
        <CardElement
          options={{
            style: {
              base: { fontSize: "14px", color: "#1a1a1a", "::placeholder": { color: "#9ca3af" } },
            },
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={handlePay} disabled={submitting || !stripe} className="flex-1">
          {submitting ? "Processing…" : `Pay ${fmt(pending.amountCents)}`}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TravelFeePaymentModal({
  pending,
  onSuccess,
  onClose,
}: {
  pending: PendingTravelFeePayment | null;
  onSuccess: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay travel / delivery fee</DialogTitle>
        </DialogHeader>
        {pending ? (
          <Elements stripe={stripePromise}>
            <TravelFeePaymentForm pending={pending} onSuccess={onSuccess} onClose={onClose} />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type AiSettings = {
  isPro: boolean;
  enabled: boolean;
  overageEnabled: boolean;
  includedPerPeriod: number;
  used: number;
  remaining: number;
  periodResetsAt: string;
  overagePriceCents: number;
};

/**
 * Vendor-only toolbar above the composer: generates 1-2 AI draft replies on demand
 * and injects the chosen draft into the message input (editable, never auto-sent).
 * Rendered inside <Channel> so it can reach the message composer.
 */
function AiReplyToolbar({
  enabled,
  bookingId,
  channelId,
  onUsed,
  t,
}: {
  enabled: boolean;
  bookingId?: string;
  channelId?: string;
  onUsed: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const composer = useMessageComposer();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);

  if (!enabled) return null;

  const generate = async () => {
    setLoading(true);
    setDrafts([]);
    try {
      const res = await apiRequest("POST", "/api/vendor/ai/suggest-reply", {
        bookingId: bookingId || undefined,
        channelId: channelId || undefined,
      });
      const data = await res.json();
      setDrafts(Array.isArray(data?.replies) ? data.replies : []);
      onUsed();
    } catch (err) {
      let code = "";
      if (err instanceof ApiRequestError) {
        try {
          code = JSON.parse(err.responseText)?.error || "";
        } catch {
          /* non-JSON body */
        }
      }
      const description =
        code === "ai_limit_reached"
          ? t("ai.limitReached")
          : code === "ai_pro_required"
            ? t("ai.proRequired")
            : code === "ai_disabled"
              ? t("ai.disabled")
              : t("ai.error");
      toast({ title: t("ai.errorTitle"), description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const useDraft = (text: string) => {
    composer?.textComposer?.setText(text);
    setDrafts([]);
  };

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {loading ? t("ai.drafting") : t("ai.draftReplyButton")}
      </button>
      {drafts.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {drafts.map((draft, index) => (
            <button
              key={index}
              type="button"
              onClick={() => useDraft(draft)}
              className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:border-violet-300 hover:bg-violet-50"
            >
              {draft}
            </button>
          ))}
          <p className="text-[11px] text-gray-400">{t("ai.draftHint")}</p>
        </div>
      )}
    </div>
  );
}

export function BookingChatWorkspace({ role, initialBookingId, initialVendorId }: { role: Role; initialBookingId?: string; initialVendorId?: string }) {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [chatChannelId, setChatChannelId] = useState<string>("");
  const streamClientRef = useRef<StreamChat | null>(null);
  const [pendingTravelFeePayment, setPendingTravelFeePayment] = useState<PendingTravelFeePayment | null>(null);

  const listPath =
    role === "customer"
      ? "/api/customer/messages/conversations"
      : "/api/vendor/messages/conversations";
  const bootstrapPathPrefix =
    role === "customer" ? "/api/customer/messages" : "/api/vendor/messages";

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: [listPath],
    staleTime: 0,
    refetchInterval: 10_000,
  });

  const inquiryConversations = useMemo(() => conversations.filter((c) => c.isInquiry), [conversations]);
  const bookingConversations = useMemo(() => conversations.filter((c) => !c.isInquiry), [conversations]);

  const eventGroups = useMemo<EventGroup[]>(() => {
    if (role !== "customer") return [];

    const grouped = new Map<string, EventGroup>();
    for (const conversation of bookingConversations) {
      const key = getConversationEventKey(conversation);
      const existing = grouped.get(key);
      if (existing) {
        existing.conversations.push(conversation);
        existing.unreadCount += Math.max(0, conversation.unreadCount || 0);
        continue;
      }

      grouped.set(key, {
        key,
        eventId: conversation.eventId,
        eventTitle: conversation.eventTitle || t("chat.untitledEvent"),
        eventDate: conversation.eventDate,
        conversations: [conversation],
        unreadCount: Math.max(0, conversation.unreadCount || 0),
      });
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.eventDate && b.eventDate) {
        return b.eventDate.localeCompare(a.eventDate);
      }
      if (a.eventDate) return -1;
      if (b.eventDate) return 1;
      return a.eventTitle.localeCompare(b.eventTitle);
    });
  }, [bookingConversations, role]);

  const visibleConversations = useMemo(() => {
    if (role !== "customer") return conversations;
    if (!selectedEventKey) return [];
    if (selectedEventKey === "__inquiry__") return inquiryConversations;
    const group = eventGroups.find((item) => item.key === selectedEventKey);
    return group ? group.conversations : [];
  }, [conversations, eventGroups, inquiryConversations, role, selectedEventKey]);

  const selectedEvent = useMemo(
    () => (role === "customer" && selectedEventKey ? eventGroups.find((item) => item.key === selectedEventKey) ?? null : null),
    [eventGroups, role, selectedEventKey]
  );

  const showEventList = role === "customer" && !selectedEventKey;

  useEffect(() => {
    if (role === "customer") {
      if (showEventList) {
        setSelectedBookingId("");
        return;
      }
      if (!visibleConversations.length) {
        setSelectedBookingId("");
        return;
      }
      if (!selectedBookingId || !visibleConversations.some((c) => c.bookingId === selectedBookingId)) {
        setSelectedBookingId(visibleConversations[0].bookingId);
      }
      return;
    }

    if (!bookingConversations.length) {
      setSelectedBookingId("");
      return;
    }
    if (!selectedBookingId || !conversations.some((c) => c.bookingId === selectedBookingId)) {
      setSelectedBookingId(bookingConversations[0].bookingId);
    }
  }, [bookingConversations, conversations, role, selectedBookingId, showEventList, visibleConversations]);

  useEffect(() => {
    if (role !== "customer") {
      setSelectedEventKey(null);
      return;
    }
    if (eventGroups.length === 0) {
      setSelectedEventKey(null);
      return;
    }
    if (selectedEventKey && eventGroups.some((item) => item.key === selectedEventKey)) {
      return;
    }
    setSelectedEventKey(null);
  }, [eventGroups, role, selectedEventKey]);

  // ── Deep-link: auto-select a specific booking when navigated from another page ──
  const initialAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialBookingId || initialAppliedRef.current) return;
    if (loadingConversations || conversations.length === 0) return;
    const match = conversations.find((c) => c.bookingId === initialBookingId);
    if (!match) return;
    initialAppliedRef.current = true;
    setSelectedBookingId(match.bookingId);
    if (role === "customer") {
      const key = getConversationEventKey(match);
      setSelectedEventKey(key);
    }
  }, [conversations, initialBookingId, loadingConversations, role]);

  // ── Deep-link: auto-open an inquiry channel by vendorId ──────────────────────
  const initialVendorAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialVendorId || initialVendorAppliedRef.current) return;
    if (loadingConversations || conversations.length === 0) return;
    const match = conversations.find((c) => c.isInquiry && c.vendorAccountId === initialVendorId);
    if (!match) return;
    initialVendorAppliedRef.current = true;
    setSelectedBookingId(match.bookingId);
    if (role === "customer") {
      setSelectedEventKey("__inquiry__");
    }
  }, [conversations, initialVendorId, loadingConversations, role]);

  const selectedConversation = useMemo(
    () => visibleConversations.find((c) => c.bookingId === selectedBookingId) ?? null,
    [selectedBookingId, visibleConversations]
  );

  const bootstrapMutation = useMutation({
    mutationFn: async (conversationKey: string) => {
      const conv = conversations.find((c) => c.bookingId === conversationKey);
      const url = conv?.isInquiry
        ? `${bootstrapPathPrefix}/inquiry/${conversationKey}/bootstrap`
        : `${bootstrapPathPrefix}/${conversationKey}/bootstrap`;
      const response = await apiRequest("POST", url);
      const data = (await response.json()) as ChatBootstrapResponse;
      return { ...data, bootstrapUrl: url };
    },
  });

  const isSelectedInquiry = selectedConversation?.isInquiry ?? false;

  // ── Travel fee proposals ──────────────────────────────────────────────────────
  type TravelFeeProposal = {
    id: string;
    bookingId: string;
    amountCents: number;
    reason: string | null;
    status: "pending" | "accepted" | "declined" | "cancelled";
    paymentScheduleId: string | null;
    proposedAt: string;
    respondedAt: string | null;
  };

  const { data: proposals = [], refetch: refetchProposals } = useQuery<TravelFeeProposal[]>({
    queryKey: [`/api/bookings/${selectedBookingId}/travel-fee-proposals`, selectedBookingId],
    queryFn: async () => {
      if (!selectedBookingId || role !== "customer") return [];
      const res = await apiRequest("GET", `/api/bookings/${selectedBookingId}/travel-fee-proposals`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: role === "customer" && Boolean(selectedBookingId) && !isSelectedInquiry,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const { data: vendorProposals = [], refetch: refetchVendorProposals } = useQuery<TravelFeeProposal[]>({
    queryKey: [`/api/vendor/bookings/${selectedBookingId}/travel-fee-proposals`, selectedBookingId],
    queryFn: async () => {
      if (!selectedBookingId || role !== "vendor") return [];
      const res = await apiRequest("GET", `/api/vendor/bookings/${selectedBookingId}/travel-fee-proposals`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: role === "vendor" && Boolean(selectedBookingId) && !isSelectedInquiry,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  // AI reply assistant settings (Pro + feature toggle + credit meter). Vendor only.
  const { data: aiSettings, refetch: refetchAiSettings } = useQuery<AiSettings>({
    queryKey: ["/api/vendor/ai/settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/ai/settings");
      return res.json();
    },
    enabled: role === "vendor",
    staleTime: 30_000,
  });
  const aiEnabled = role === "vendor" && Boolean(aiSettings?.isPro) && Boolean(aiSettings?.enabled);

  // Most-recent vendor proposal that was declined and has no newer pending/accepted proposal
  const declinedVendorProposal = (() => {
    if (role !== "vendor" || vendorProposals.length === 0) return null;
    const hasPendingOrAccepted = vendorProposals.some(
      (p) => p.status === "pending" || p.status === "accepted"
    );
    if (hasPendingOrAccepted) return null;
    return vendorProposals.find((p) => p.status === "declined") ?? null;
  })();

  const [vendorProposalAmount, setVendorProposalAmount] = useState("");
  const [vendorProposalReason, setVendorProposalReason] = useState("");
  const [vendorProposalError, setVendorProposalError] = useState<string | null>(null);
  const [showVendorProposalForm, setShowVendorProposalForm] = useState(false);

  const vendorProposeMutation = useMutation({
    mutationFn: async ({ bookingId, amountCents, reason }: { bookingId: string; amountCents: number; reason?: string }) => {
      const res = await apiRequest("POST", `/api/bookings/${bookingId}/travel-fee-proposals`, {
        amountCents,
        reason: reason || undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to submit proposal");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Travel fee proposed", description: "The customer has been notified." });
      setShowVendorProposalForm(false);
      setVendorProposalAmount("");
      setVendorProposalReason("");
      setVendorProposalError(null);
      await refetchVendorProposals();
    },
    onError: (err: Error) => {
      setVendorProposalError(err.message);
    },
  });

  const vendorCancelBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("PATCH", `/api/vendor/bookings/${bookingId}`, {
        status: "cancelled",
        cancellationReason: "vendor_declined_travel_fee",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to cancel booking");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Booking declined", description: "The booking has been cancelled." });
      await refetchVendorProposals();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const pendingProposal = proposals.find((p) => p.status === "pending") ?? null;

  const acceptProposalMutation = useMutation({
    mutationFn: async ({ bookingId, proposalId }: { bookingId: string; proposalId: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/bookings/${bookingId}/travel-fee-proposals/${proposalId}/accept`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to accept proposal");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data?.clientSecret) {
        setPendingTravelFeePayment({
          clientSecret: data.clientSecret,
          proposalId: variables.proposalId,
          amountCents: data.amountCents,
          bookingId: variables.bookingId,
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const declineProposalMutation = useMutation({
    mutationFn: async ({ bookingId, proposalId }: { bookingId: string; proposalId: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/bookings/${bookingId}/travel-fee-proposals/${proposalId}/decline`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to decline proposal");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Travel fee declined", description: "The vendor has been notified." });
      await refetchProposals();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!selectedConversation || !selectedConversation.bookingId) return;
    if (selectedConversation.expired) return;
    bootstrapMutation.mutate(selectedConversation.bookingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.bookingId, selectedConversation?.expired]);

  useEffect(() => {
    const bootstrap = bootstrapMutation.data;
    if (!bootstrap) return;

    let cancelled = false;

    const connect = async () => {
      let nextClient = streamClientRef.current;

      // Keep one live Stream client per mounted workspace; reconnect only if user changes.
      if (!nextClient) {
        nextClient = new StreamChat(bootstrap.streamApiKey);
      } else if (nextClient.userID && nextClient.userID !== bootstrap.streamUser.id) {
        // Drop stale channel/client state before disconnecting old client.
        setChatChannelId("");
        setChatClient(null);
        await nextClient.disconnectUser();
        nextClient = new StreamChat(bootstrap.streamApiKey);
      }

      if (!nextClient.userID) {
        // Server tokens expire (24h), so hand Stream a token provider: the
        // first call reuses the bootstrap token, and when Stream reports the
        // token expired it calls again and we fetch a fresh one.
        let usedBootstrapToken = false;
        await nextClient.connectUser(bootstrap.streamUser, async () => {
          if (!usedBootstrapToken) {
            usedBootstrapToken = true;
            return bootstrap.streamToken;
          }
          const response = await apiRequest("POST", bootstrap.bootstrapUrl);
          const fresh = (await response.json()) as ChatBootstrapResponse;
          return fresh.streamToken;
        });
      }

      const channel = nextClient.channel(bootstrap.channel.type, bootstrap.channel.id);
      await channel.watch();
      if (cancelled) {
        return;
      }

      streamClientRef.current = nextClient;
      setChatClient(nextClient);
      setChatChannelId(bootstrap.channel.id);
    };

    connect().catch((error) => {
      console.error("Failed to connect to Stream chat", error);
      if (!cancelled) {
        toast({
          variant: "destructive",
          title: t("chat.errorOpenTitle"),
          description: t("chat.errorOpenDesc"),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bootstrapMutation.data, toast]);

  useEffect(() => {
    return () => {
      const activeClient = streamClientRef.current;
      streamClientRef.current = null;
      if (activeClient) {
        void activeClient.disconnectUser();
      }
    };
  }, []);

  const profanityFilter = useMemo(() => {
    const filter = new Filter();
    filter.addWords("dm me", "text me", "cashapp", "venmo");
    return filter;
  }, []);

  const moderationFlagMutation = useMutation({
    mutationFn: async (payload: {
      bookingId: string;
      reason: "profanity" | "toxicity" | "inappropriate_content" | "pii_attempt";
      sampleText: string;
      metadata: Record<string, unknown>;
    }) => {
      await apiRequest("POST", "/api/chat/moderation/flag", payload);
    },
  });

  const [reportSent, setReportSent] = useState<string | null>(null); // bookingId that was reported

  const customerReportMutation = useMutation({
    mutationFn: async (payload: { bookingId: string; contentSnapshot: string }) => {
      const res = await apiRequest("POST", "/api/circumvention/report", {
        contentType: "chat_message",
        contentSnapshot: payload.contentSnapshot,
        bookingId: payload.bookingId,
      });
      if (!res.ok) throw new Error("Failed to send report");
    },
    onSuccess: (_, variables) => setReportSent(variables.bookingId),
  });

  const circumventionFlagMutation = useMutation({
    mutationFn: async (payload: {
      bookingId: string;
      contentSnapshot: string;
      matches: string[];
    }) => {
      const res = await apiRequest("POST", "/api/chat/circumvention/flag", payload);
      return res.json() as Promise<{
        flagId: string;
        warningNumber: number | null;
        suspended: boolean;
        suspensionEndsAt: string | null;
      }>;
    },
  });

  const activeChannel = useMemo(() => {
    if (!chatClient || !chatChannelId) return null;
    try {
      return chatClient.channel("messaging", chatChannelId);
    } catch (error) {
      // Guard against race conditions where a channel is requested after disconnect.
      console.warn("Skipping stale Stream channel after disconnect", error);
      return null;
    }
  }, [chatClient, chatChannelId]);

  // ── overrideSubmitHandler: intercepts BEFORE Stream adds the optimistic message.
  // Returning early here means the message never touches Stream state — no stuck
  // "sending" message, no retry loop, no phantom unread-count polling.
  const sendModeratedMessage = useCallback(
    async ({
      message,
      sendOptions,
    }: {
      cid: string;
      localMessage: LocalMessage;
      message: StreamMessage;
      sendOptions: SendMessageOptions;
    }) => {
      const sourceText = String(message.text || "");

      // ── Circumvention check (hard block — runs before profanity filter) ──────
      const circumvention = detectChatCircumvention(sourceText);
      if (circumvention.blocked && selectedConversation?.bookingId) {
        // Fire-and-forget: log flag + issue warning on server
        circumventionFlagMutation
          .mutateAsync({
            bookingId: selectedConversation.bookingId,
            contentSnapshot: sourceText.slice(0, 2000),
            matches: circumvention.matches,
          })
          .then((result) => {
            toast({
              variant: "destructive",
              title: t("chat.messageBlockedTitle"),
              description: chatBlockMessage(result.warningNumber, result.suspended),
              duration: 8000,
            });
          })
          .catch(() => {
            toast({
              variant: "destructive",
              title: t("chat.messageBlockedTitle"),
              description: chatBlockMessage(),
              duration: 6000,
            });
          });
        // Return without calling activeChannel.sendMessage — message is silently
        // dropped. Because we're in overrideSubmitHandler, the optimistic message
        // was never added to Stream channel state, so nothing lingers in the UI.
        return;
      }
      // ── End circumvention check ───────────────────────────────────────────────

      const moderation = moderateText(profanityFilter, sourceText);
      const safeText = moderation.sanitizedText.trim();
      const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;

      if (moderation.flagged && selectedConversation?.bookingId) {
        await moderationFlagMutation
          .mutateAsync({
            bookingId: selectedConversation.bookingId,
            reason: (moderation.reason || "inappropriate_content") as
              | "profanity"
              | "toxicity"
              | "inappropriate_content"
              | "pii_attempt",
            sampleText: moderation.sanitizedText.slice(0, 280),
            metadata: {
              role,
              originalLength: sourceText.length,
            },
          })
          .catch(() => {
            // Keep chat sending resilient even if flag logging fails.
          });

        toast({
          title: t("chat.messageSafetyTitle"),
          description: t("chat.messageSafetyDesc"),
        });
      }

      if (!safeText && !hasAttachments) return;

      await activeChannel?.sendMessage({ ...message, text: safeText }, sendOptions);
      trackEvent("contact_message_sent", {
        booking_id: selectedConversation?.bookingId ?? null,
        role,
      });
    },
    [activeChannel, circumventionFlagMutation, moderationFlagMutation, profanityFilter, role, selectedConversation?.bookingId, t, toast]
  );

  const renderSafeText = useCallback(
    (text?: string) => {
      const moderated = moderateText(profanityFilter, text || "");
      return moderated.sanitizedText;
    },
    [profanityFilter]
  );

  useEffect(() => {
    if (!activeChannel || !selectedConversation?.bookingId) return;
    activeChannel.markRead().catch(() => {
      // Avoid blocking chat UI on mark-read errors.
    });
    void queryClient.invalidateQueries({ queryKey: [listPath] });
    const unreadKey =
      role === "customer" ? "/api/customer/messages/unread-count" : "/api/vendor/messages/unread-count";
    void queryClient.invalidateQueries({ queryKey: [unreadKey] });
  }, [activeChannel, listPath, queryClient, role, selectedConversation?.bookingId]);

  const useCustomerSeparatorLayout = role === "customer";

  return (
    <div
      className={cn(
        "grid gap-6",
        useCustomerSeparatorLayout ? "md:grid-cols-[320px_auto_1fr] md:gap-0" : "md:grid-cols-[320px_1fr]"
      )}
    >
      <Card
        className={cn(
          "flex h-[72vh] min-h-[560px] flex-col overflow-hidden md:h-[76vh]",
          useCustomerSeparatorLayout && "border-0 bg-transparent shadow-none"
        )}
      >
        <CardHeader className="shrink-0">
          <CardTitle className="text-[20px]">
            {role === "customer" ? (showEventList ? t("chat.cardTitleEvents") : t("chat.cardTitleVendors")) : t("chat.cardTitleConversations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
          {loadingConversations ? (
            <p className="text-sm text-muted-foreground">{t("chat.loadingConversations")}</p>
          ) : conversations.length === 0 ? (
            <div className="pt-8 text-center">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("chat.noConversations")}</p>
            </div>
          ) : showEventList ? (
            <>
              {eventGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => {
                    setSelectedEventKey(group.key);
                    setSelectedBookingId(group.conversations[0]?.bookingId || "");
                  }}
                  className="w-full rounded-lg border border-[rgba(74,106,125,0.22)] p-3 text-left transition-colors hover:bg-muted/50"
                  data-testid={`chat-event-${group.key}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{group.eventTitle}</p>
                    {group.unreadCount > 0 ? (
                      <Badge className="bg-cyan-600 text-[10px] text-white hover:bg-cyan-600">
                        {group.unreadCount}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{formatDate(group.eventDate, t("chat.dateUnknown"), i18n.language)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("chat.vendorCount", { count: group.conversations.length })}
                  </p>
                </button>
              ))}
              {inquiryConversations.length > 0 && (
                <>
                  <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pre-Booking Inquiries
                  </p>
                  {inquiryConversations.map((inq) => {
                    const inqActive = inq.bookingId === selectedBookingId && selectedEventKey === "__inquiry__";
                    return (
                      <button
                        key={inq.bookingId}
                        type="button"
                        onClick={() => {
                          setSelectedEventKey("__inquiry__");
                          setSelectedBookingId(inq.bookingId);
                        }}
                        className={cn(
                          "w-full rounded-lg border border-[rgba(74,106,125,0.22)] p-3 text-left transition-colors",
                          inqActive ? "bg-primary/5" : inq.hasUnread ? "bg-cyan-50/70 hover:bg-cyan-50" : "hover:bg-muted/50"
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{inq.counterpartName}</p>
                          {inq.unreadCount > 0 ? (
                            <Badge className="bg-cyan-600 text-[10px] text-white hover:bg-cyan-600">
                              {inq.unreadCount}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">Pre-booking inquiry</p>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          ) : (
            <>
              {role === "customer" ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEventKey(null);
                    setSelectedBookingId("");
                  }}
                  className="mb-1 flex w-full items-center gap-2 rounded-lg border border-[#4a6a7d] bg-[#4a6a7d] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#405b6c]"
                  data-testid="chat-events-back"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("chat.back")}
                </button>
              ) : null}
              {role === "customer" && selectedEvent ? (
                <div className="mb-2 rounded-lg bg-muted/60 px-3 py-2">
                  <p className="truncate text-sm font-medium">{selectedEvent.eventTitle}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(selectedEvent.eventDate, t("chat.dateUnknown"), i18n.language)}</p>
                </div>
              ) : null}
              {visibleConversations.map((conversation) => {
              const active = conversation.bookingId === selectedBookingId;
              return (
                <button
                  key={conversation.bookingId}
                  type="button"
                  onClick={() => setSelectedBookingId(conversation.bookingId)}
                  className={cn(
                    "w-full rounded-lg border border-[rgba(74,106,125,0.22)] p-3 text-left transition-colors",
                    active
                      ? "border-[rgba(74,106,125,0.22)] bg-primary/5"
                      : conversation.hasUnread
                        ? "border-[rgba(74,106,125,0.22)] bg-cyan-50/70 hover:bg-cyan-50"
                        : "hover:bg-muted/50"
                  )}
                  data-testid={`chat-conversation-${conversation.bookingId}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{conversation.counterpartName}</p>
                    <div className="flex items-center gap-1.5">
                      {conversation.unreadCount > 0 ? (
                        <Badge className="bg-cyan-600 text-[10px] text-white hover:bg-cyan-600">
                          {conversation.unreadCount}
                        </Badge>
                      ) : null}
                      {conversation.isInquiry ? (
                        <Badge variant="outline" className="text-[10px]">Inquiry</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {normalizeStatus(conversation.status)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {conversation.isInquiry ? (
                    <p className="text-xs text-muted-foreground">Pre-booking inquiry</p>
                  ) : (
                    <>
                      <p className="truncate text-sm text-muted-foreground">
                        {conversation.eventTitle || t("chat.bookingChatFallback")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(conversation.eventDate, t("chat.dateUnknown"), i18n.language)}
                      </p>
                      {conversation.expired && (
                        <p className="mt-1 text-sm font-medium text-destructive">{t("chat.expired")}</p>
                      )}
                    </>
                  )}
                </button>
              );
            })}
            </>
          )}
        </CardContent>
      </Card>

      {useCustomerSeparatorLayout ? (
        <div className="hidden w-px bg-[var(--dashboard-divider-blue)] md:block" aria-hidden />
      ) : null}

      <Card
        className={cn(
          "flex h-[72vh] min-h-[560px] flex-col overflow-hidden md:h-[76vh]",
          useCustomerSeparatorLayout && "border-0 bg-transparent shadow-none"
        )}
      >
        {role === "customer" && showEventList ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
            {t("chat.selectEventPrompt")}
          </CardContent>
        ) : !selectedConversation ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
            {t("chat.selectConversationPrompt")}
          </CardContent>
        ) : selectedConversation.expired ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center px-10 text-center">
            <div className="space-y-3">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
              <p className="text-sm">
                {t("chat.expiredMessage")}
              </p>
            </div>
          </CardContent>
        ) : !chatClient || !activeChannel || bootstrapMutation.isPending ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
            {t("chat.openingChat")}
          </CardContent>
        ) : (
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex items-start justify-between gap-3 border-b border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 px-4 py-3 text-sm text-cyan-900">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
                <p className="leading-relaxed">
                  {bootstrapMutation.data?.policyWarning || t("chat.policyFallback")}
                </p>
              </div>
              {role === "customer" && selectedConversation?.bookingId && (
                <div className="shrink-0">
                  {reportSent === selectedConversation.bookingId ? (
                    <p className="text-xs text-cyan-700">{t("chat.reported")}</p>
                  ) : (
                    <button
                      type="button"
                      title="Report this conversation for contact information sharing"
                      onClick={() => {
                        if (!selectedConversation?.bookingId) return;
                        customerReportMutation.mutate({
                          bookingId: selectedConversation.bookingId,
                          contentSnapshot: "Customer-reported chat conversation",
                        });
                      }}
                      disabled={customerReportMutation.isPending}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-700 hover:bg-cyan-100 transition-colors disabled:opacity-50"
                    >
                      <Flag className="h-3 w-3" />
                      {t("chat.report")}
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Travel fee proposal banner — customer only */}
            {role === "customer" && proposals.length > 0 ? (() => {
              const fmt = (cents: number) =>
                new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
              const pastProposals = proposals.filter((p) => p.status !== "pending");
              const hasDeclined = proposals.some((p) => p.status === "declined");

              return (
                <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
                  {/* Active pending proposal */}
                  {pendingProposal ? (
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Travel / delivery fee proposed</p>
                      <p className="mt-0.5 text-sm text-amber-800">
                        {fmt(pendingProposal.amountCents)}
                        {pendingProposal.reason ? ` — ${pendingProposal.reason}` : ""}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={acceptProposalMutation.isPending || declineProposalMutation.isPending}
                          onClick={() =>
                            acceptProposalMutation.mutate({
                              bookingId: selectedBookingId,
                              proposalId: pendingProposal.id,
                            })
                          }
                          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                        >
                          {acceptProposalMutation.isPending ? "Accepting…" : "Accept & pay"}
                        </button>
                        <button
                          type="button"
                          disabled={acceptProposalMutation.isPending || declineProposalMutation.isPending}
                          onClick={() =>
                            declineProposalMutation.mutate({
                              bookingId: selectedBookingId,
                              proposalId: pendingProposal.id,
                            })
                          }
                          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                        >
                          {declineProposalMutation.isPending ? "Declining…" : "Decline"}
                        </button>
                      </div>
                    </div>
                  ) : hasDeclined ? (
                    /* Awaiting vendor response after a decline */
                    <p className="text-sm font-medium text-amber-800">
                      Travel fee declined — awaiting vendor response.
                    </p>
                  ) : null}

                  {/* Proposal history */}
                  {pastProposals.length > 0 && (
                    <div className="space-y-1 border-t border-amber-200 pt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                        Proposal history
                      </p>
                      {pastProposals.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 text-xs text-amber-800">
                          <span>
                            {fmt(p.amountCents)}
                            {p.reason ? ` — ${p.reason}` : ""}
                          </span>
                          <span
                            className={`capitalize font-medium ${
                              p.status === "accepted"
                                ? "text-emerald-700"
                                : p.status === "declined"
                                ? "text-red-600"
                                : "text-amber-600"
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })() : null}

            {/* Travel fee declined — vendor action banner */}
            {role === "vendor" && declinedVendorProposal ? (
              <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-red-900">Customer declined your travel fee</p>
                <p className="text-xs text-red-700">
                  Proposed {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(declinedVendorProposal.amountCents / 100)}
                  {declinedVendorProposal.reason ? ` — ${declinedVendorProposal.reason}` : ""}
                </p>
                {showVendorProposalForm ? (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-red-900">New fee amount (USD)</label>
                      <div className="relative max-w-[160px]">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <input
                          className="w-full rounded-md border border-input pl-7 pr-3 h-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                          inputMode="decimal"
                          placeholder="e.g. 75"
                          value={vendorProposalAmount}
                          onChange={(e) => setVendorProposalAmount(e.target.value.replace(/[^\d.]/g, ""))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-red-900">Reason (optional)</label>
                      <input
                        className="w-full rounded-md border border-input px-3 h-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="e.g. 45 miles outside service area"
                        value={vendorProposalReason}
                        onChange={(e) => setVendorProposalReason(e.target.value)}
                      />
                    </div>
                    {vendorProposalError ? (
                      <p className="text-xs text-destructive">{vendorProposalError}</p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={vendorProposeMutation.isPending || !vendorProposalAmount}
                        onClick={() => {
                          const cents = Math.round(parseFloat(vendorProposalAmount) * 100);
                          if (!cents || cents <= 0) {
                            setVendorProposalError("Enter a valid amount");
                            return;
                          }
                          setVendorProposalError(null);
                          vendorProposeMutation.mutate({
                            bookingId: selectedBookingId,
                            amountCents: cents,
                            reason: vendorProposalReason || undefined,
                          });
                        }}
                        className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
                      >
                        {vendorProposeMutation.isPending ? "Sending…" : "Send new proposal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowVendorProposalForm(false);
                          setVendorProposalAmount("");
                          setVendorProposalReason("");
                          setVendorProposalError(null);
                        }}
                        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowVendorProposalForm(true)}
                      className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
                    >
                      Propose new fee
                    </button>
                    <button
                      type="button"
                      disabled={vendorCancelBookingMutation.isPending}
                      onClick={() => vendorCancelBookingMutation.mutate(selectedBookingId)}
                      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                    >
                      {vendorCancelBookingMutation.isPending ? "Declining…" : "Decline the job"}
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="eventhub-stream-chat flex-1 min-h-0">
              <Chat client={chatClient} theme="str-chat__theme-light">
                <Channel channel={activeChannel}>
                  <Window>
                    <ChannelHeader />
                    <MessageList renderText={renderSafeText} />
                    <AiReplyToolbar
                      enabled={aiEnabled}
                      bookingId={isSelectedInquiry ? undefined : selectedBookingId || undefined}
                      channelId={activeChannel?.id}
                      onUsed={() => refetchAiSettings()}
                      t={t}
                    />
                    <MessageInput overrideSubmitHandler={sendModeratedMessage} />
                  </Window>
                  <Thread />
                </Channel>
              </Chat>
            </div>
          </CardContent>
        )}
      </Card>

      <TravelFeePaymentModal
        pending={pendingTravelFeePayment}
        onSuccess={async () => {
          setPendingTravelFeePayment(null);
          await refetchProposals();
        }}
        onClose={() => setPendingTravelFeePayment(null)}
      />
    </div>
  );
}
