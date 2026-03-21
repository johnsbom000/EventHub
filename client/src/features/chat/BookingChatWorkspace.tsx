import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, MessageSquare, ShieldAlert } from "lucide-react";
import { Filter } from "bad-words";
import { Chat, Channel, ChannelHeader, MessageInput, MessageList, Thread, Window } from "stream-chat-react";
import { StreamChat, type Message as StreamMessage, type SendMessageOptions } from "stream-chat";

import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

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

function formatDate(value: string | null) {
  if (!value) return "Date TBD";
  const asDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(asDate.getTime())) return value;
  return asDate.toLocaleDateString("en-US", {
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

export function BookingChatWorkspace({ role }: { role: Role }) {
  const { toast } = useToast();
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
        eventTitle: conversation.eventTitle || "Untitled Event",
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

  useEffect(() => {
    if (!selectedConversation || !selectedConversation.bookingId) return;
    if (selectedConversation.expired || !selectedConversation.paymentInfoCollected) return;
    bootstrapMutation.mutate(selectedConversation.bookingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.bookingId, selectedConversation?.expired, selectedConversation?.paymentInfoCollected]);

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
          title: "Unable to open chat",
          description: "Please refresh and try again.",
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

  const sendModeratedMessage = useCallback(
    async (
      streamChannel: ReturnType<StreamChat["channel"]>,
      message: StreamMessage,
      sendOptions?: SendMessageOptions
    ) => {
      const sourceText = String(message.text || "");
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
          title: "Message adjusted for safety",
          description: "Inappropriate language was masked and account activity was flagged.",
        });
      }

      if (!safeText && !hasAttachments) {
        return Promise.resolve({} as any);
      }

      return streamChannel.sendMessage(
        {
          ...message,
          text: safeText,
        },
        sendOptions
      );
    },
    [moderationFlagMutation, profanityFilter, role, selectedConversation?.bookingId, toast]
  );

  const renderSafeText = useCallback(
    (text?: string) => {
      const moderated = moderateText(profanityFilter, text || "");
      return moderated.sanitizedText;
    },
    [profanityFilter]
  );

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
            {role === "customer" ? (showEventList ? "Events" : "Vendors") : "Conversations"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
          {loadingConversations ? (
            <p className="text-sm text-muted-foreground">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <div className="pt-8 text-center">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No booking conversations available yet.</p>
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
                <p className="text-xs text-muted-foreground">{formatDate(group.eventDate)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.conversations.length} vendor conversation
                  {group.conversations.length === 1 ? "" : "s"}
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
                  Back
                </button>
              ) : null}
              {role === "customer" && selectedEvent ? (
                <div className="mb-2 rounded-lg bg-muted/60 px-3 py-2">
                  <p className="truncate text-sm font-medium">{selectedEvent.eventTitle}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(selectedEvent.eventDate)}</p>
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
                  <p className="truncate text-xs text-muted-foreground">
                    {conversation.eventTitle || "Booking chat"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(conversation.eventDate)}
                  </p>
                  {conversation.expired && (
                    <p className="mt-1 text-xs font-medium text-destructive">Expired</p>
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
            Select an event to see vendor chats
          </CardContent>
        ) : !selectedConversation ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
            Select a conversation
          </CardContent>
        ) : selectedConversation.expired ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center px-10 text-center">
            <div className="space-y-3">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
              <p className="text-sm">
                This conversation expired because chats are retained for 30 days after the event date.
              </p>
            </div>
          </CardContent>
        ) : !selectedConversation.paymentInfoCollected ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center px-10 text-center">
            <p className="text-sm text-muted-foreground">
              Chat will unlock after payment information is collected for this booking request.
            </p>
          </CardContent>
        ) : !chatClient || !activeChannel || bootstrapMutation.isPending ? (
          <CardContent className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
            Opening chat...
          </CardContent>
        ) : (
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex items-start gap-3 border-b border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 px-4 py-3 text-xs text-cyan-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
              <p className="leading-relaxed">
                {bootstrapMutation.data?.policyWarning ||
                  "For your safety, do not share personal information in chat."}
              </p>
            </div>
            <div className="eventhub-stream-chat flex-1 min-h-0">
              <Chat client={chatClient} theme="str-chat__theme-light">
                <Channel channel={activeChannel} doSendMessageRequest={sendModeratedMessage}>
                  <Window>
                    <ChannelHeader />
                    <MessageList renderText={renderSafeText} />
                    <MessageInput />
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
