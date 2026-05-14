import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Flag, MessageSquare, ShieldAlert } from "lucide-react";
import { Filter } from "bad-words";
import { Chat, Channel, ChannelHeader, MessageInput, MessageList, Thread, Window } from "stream-chat-react";
import { StreamChat, type Message as StreamMessage, type SendMessageOptions, type LocalMessage } from "stream-chat";

import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { chatBlockMessage } from "@/components/CircumventionWarningModal";
import { useTranslation } from "react-i18next";

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

// ─── Client-side circumvention detection (mirrors server patterns) ────────────

const CIRCUMVENTION_HARD_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
  /(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/,
  /\b(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)/i,
  /https?:\/\/[^\s<>"']+/i,
  /\bwww\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}/i,
  /\b[a-zA-Z0-9\-]{2,}\.(com|net|org|io|co|app|biz|info|me|us|shop|store|online|site|web)\b/i,
  /\b(instagram|facebook|twitter|tiktok|linkedin|snapchat|youtube|pinterest|threads|x\.com)\.(com|me)\/[^\s<>"']+/i,
  /@[a-zA-Z0-9_.]{3,}/,
];

function detectChatCircumvention(text: string): { blocked: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const pattern of CIRCUMVENTION_HARD_PATTERNS) {
    const found = text.match(pattern)?.[0];
    if (found) matches.push(found.slice(0, 120));
  }
  return { blocked: matches.length > 0, matches };
}

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

export function BookingChatWorkspace({ role, initialBookingId }: { role: Role; initialBookingId?: string }) {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [chatChannelId, setChatChannelId] = useState<string>("");
  const streamClientRef = useRef<StreamChat | null>(null);

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

  const eventGroups = useMemo<EventGroup[]>(() => {
    if (role !== "customer") return [];

    const grouped = new Map<string, EventGroup>();
    for (const conversation of conversations) {
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
  }, [conversations, role]);

  const visibleConversations = useMemo(() => {
    if (role !== "customer") return conversations;
    if (!selectedEventKey) return [];
    const group = eventGroups.find((item) => item.key === selectedEventKey);
    return group ? group.conversations : [];
  }, [conversations, eventGroups, role, selectedEventKey]);

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

    if (!conversations.length) {
      setSelectedBookingId("");
      return;
    }
    if (!selectedBookingId || !conversations.some((c) => c.bookingId === selectedBookingId)) {
      setSelectedBookingId(conversations[0].bookingId);
    }
  }, [conversations, role, selectedBookingId, showEventList, visibleConversations]);

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

  const selectedConversation = useMemo(
    () => visibleConversations.find((c) => c.bookingId === selectedBookingId) ?? null,
    [selectedBookingId, visibleConversations]
  );

  const bootstrapMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `${bootstrapPathPrefix}/${bookingId}/bootstrap`);
      return (await response.json()) as ChatBootstrapResponse;
    },
  });

  // ── Travel fee proposals (customer-only) ──────────────────────────────────────
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
    enabled: role === "customer" && Boolean(selectedBookingId),
    staleTime: 15_000,
    refetchInterval: 20_000,
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
    onSuccess: async (data) => {
      toast({ title: "Travel fee accepted", description: "You can now pay the travel/delivery fee." });
      await refetchProposals();
      if (data?.clientSecret && data?.listingId) {
        // Seed the checkout's resume-payment draft in localStorage so checkout
        // skips booking creation and goes straight to payment confirmation.
        const draft = {
          listingId: data.listingId,
          bookingId: selectedBookingId,
          idempotencyKey: `travel-fee-${selectedBookingId}`,
          createdAt: new Date().toISOString(),
        };
        window.localStorage.setItem("eventhub.checkout.pending_payment.v1", JSON.stringify(draft));
        window.location.href = `/checkout/${data.listingId}`;
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
        await nextClient.connectUser(bootstrap.streamUser, bootstrap.streamToken);
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
            eventGroups.map((group) => (
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
            ))
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
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {normalizeStatus(conversation.status)}
                      </Badge>
                    </div>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {conversation.eventTitle || t("chat.bookingChatFallback")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(conversation.eventDate, t("chat.dateUnknown"), i18n.language)}
                  </p>
                  {conversation.expired && (
                    <p className="mt-1 text-sm font-medium text-destructive">{t("chat.expired")}</p>
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

            <div className="eventhub-stream-chat flex-1 min-h-0">
              <Chat client={chatClient} theme="str-chat__theme-light">
                <Channel channel={activeChannel}>
                  <Window>
                    <ChannelHeader />
                    <MessageList renderText={renderSafeText} />
                    <MessageInput overrideSubmitHandler={sendModeratedMessage} />
                  </Window>
                  <Thread />
                </Channel>
              </Chat>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
