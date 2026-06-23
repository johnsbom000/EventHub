import { StreamChat } from "stream-chat";

const STREAM_CHANNEL_TYPE = "messaging";
const BOOKING_CHANNEL_PREFIX = "booking_";
const INQUIRY_CHANNEL_PREFIX = "inquiry_";
const RETENTION_DAYS_AFTER_EVENT = 30;
// User tokens expire after this lifetime; the client's token provider fetches
// a fresh one from the API on connect and whenever Stream reports expiry.
const STREAM_TOKEN_TTL_SECONDS = 24 * 60 * 60;

let cachedClient: StreamChat | null = null;

function getStreamApiKeyValue() {
  return (process.env.STREAM_API_KEY || "").trim();
}

function getStreamApiSecretValue() {
  return (process.env.STREAM_API_SECRET || "").trim();
}

function requireStreamConfig() {
  const apiKey = getStreamApiKeyValue();
  const apiSecret = getStreamApiSecretValue();
  if (!apiKey || !apiSecret) {
    throw new Error("STREAM_API_KEY and STREAM_API_SECRET must be configured");
  }
  return { apiKey, apiSecret };
}

function getServerClient() {
  if (cachedClient) return cachedClient;
  const { apiKey, apiSecret } = requireStreamConfig();
  cachedClient = StreamChat.getInstance(apiKey, apiSecret);
  return cachedClient;
}

function sanitizeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function safeDisplayName(value: string | null | undefined, fallback: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 80);
}

function isChannelExistsError(error: unknown) {
  const message = String((error as any)?.message || "").toLowerCase();
  return message.includes("already exists");
}

function createExpiringUserToken(client: StreamChat, streamUserId: string) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Backdate iat slightly so minor clock skew between this server and Stream
  // can't make a fresh token "not yet valid".
  return client.createToken(streamUserId, nowSeconds + STREAM_TOKEN_TTL_SECONDS, nowSeconds - 60);
}

export function isStreamChatConfigured() {
  return Boolean(getStreamApiKeyValue() && getStreamApiSecretValue());
}

export function getStreamApiKey() {
  return getStreamApiKeyValue();
}

export function toStreamUserId(type: "customer" | "vendor", appId: string) {
  return `${type}_${sanitizeIdPart(appId)}`.slice(0, 64);
}

export function toStreamBookingChannelId(bookingId: string) {
  const suffix = sanitizeIdPart(bookingId);
  return `${BOOKING_CHANNEL_PREFIX}${suffix}`.slice(0, 64);
}

export function toStreamBookingCid(bookingId: string) {
  return `${STREAM_CHANNEL_TYPE}:${toStreamBookingChannelId(bookingId)}`;
}

export function toStreamInquiryChannelId(vendorAccountId: string, customerId: string) {
  const suffix = `${sanitizeIdPart(vendorAccountId)}_${sanitizeIdPart(customerId)}`;
  return `${INQUIRY_CHANNEL_PREFIX}${suffix}`.slice(0, 64);
}

export function computeChatRetentionExpiry(eventDate: string): Date | null {
  const parsed = new Date(`${eventDate}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + RETENTION_DAYS_AFTER_EVENT);
  return parsed;
}

export function isChatExpiredForEventDate(eventDate: string, now = new Date()) {
  const expiresAt = computeChatRetentionExpiry(eventDate);
  if (!expiresAt) return false;
  return now.getTime() > expiresAt.getTime();
}

// Conversations are visible until 48 hours after the event ends.
// After that they are removed from the list (chat data is retained for RETENTION_DAYS_AFTER_EVENT).
const CONVERSATION_VISIBILITY_HOURS_AFTER_EVENT = 48;

export function isChatWindowClosedForEventDate(eventDate: string, now = new Date()): boolean {
  const eventEndOfDay = new Date(`${eventDate}T23:59:59.999Z`);
  if (Number.isNaN(eventEndOfDay.getTime())) return false; // unknown date — keep visible
  const windowCloseMs =
    eventEndOfDay.getTime() + CONVERSATION_VISIBILITY_HOURS_AFTER_EVENT * 60 * 60 * 1000;
  return now.getTime() > windowCloseMs;
}

export async function ensureStreamBookingChannel(params: {
  bookingId: string;
  eventDate: string;
  eventTitle?: string | null;
  customerId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  vendorAccountId: string;
  vendorName?: string | null;
  vendorEmail?: string | null;
}) {
  const client = getServerClient();
  const apiKey = getStreamApiKeyValue();
  const retention = computeChatRetentionExpiry(params.eventDate);
  const retentionIso = retention ? retention.toISOString() : null;
  const customerStreamUserId = toStreamUserId("customer", params.customerId);
  const vendorStreamUserId = toStreamUserId("vendor", params.vendorAccountId);
  const channelId = toStreamBookingChannelId(params.bookingId);
  const channelCid = `${STREAM_CHANNEL_TYPE}:${channelId}`;
  const channelNameParts = [
    safeDisplayName(params.vendorName, "Vendor"),
    (params.eventTitle || "").trim() || params.eventDate,
  ];
  const channelName = channelNameParts.join(" - ");

  await client.upsertUsers([
    {
      id: customerStreamUserId,
      name: safeDisplayName(params.customerName, "Customer"),
      role: "user",
      app_role: "customer",
      app_user_id: params.customerId,
      email: params.customerEmail || undefined,
    } as any,
    {
      id: vendorStreamUserId,
      name: safeDisplayName(params.vendorName, "Vendor"),
      role: "user",
      app_role: "vendor",
      app_user_id: params.vendorAccountId,
      email: params.vendorEmail || undefined,
    } as any,
  ]);

  const channel = client.channel(STREAM_CHANNEL_TYPE, channelId, {
    name: channelName,
    members: [customerStreamUserId, vendorStreamUserId],
    created_by_id: vendorStreamUserId,
    booking_id: params.bookingId,
    event_date: params.eventDate,
    retention_expires_at: retentionIso,
    customer_id: params.customerId,
    vendor_account_id: params.vendorAccountId,
  } as any);

  try {
    await channel.create({ watch: false, state: false });
  } catch (error) {
    if (!isChannelExistsError(error)) {
      throw error;
    }
  }

  await channel.addMembers([customerStreamUserId, vendorStreamUserId]).catch(() => {
    // Safe no-op for existing channel memberships.
  });

  await channel.updatePartial({
    set: {
      name: channelName,
      booking_id: params.bookingId,
      event_date: params.eventDate,
      retention_expires_at: retentionIso,
      customer_id: params.customerId,
      vendor_account_id: params.vendorAccountId,
    },
  } as any);

  return {
    apiKey,
    channelType: STREAM_CHANNEL_TYPE,
    channelId,
    channelCid,
    customerStreamUserId,
    vendorStreamUserId,
    retentionExpiresAt: retentionIso,
    tokenForUser(streamUserId: string) {
      return createExpiringUserToken(client, streamUserId);
    },
  };
}

export async function ensureStreamInquiryChannel(params: {
  vendorAccountId: string;
  customerId: string;
  vendorName?: string | null;
  vendorEmail?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  initialListingId?: string | null;
}) {
  const client = getServerClient();
  const apiKey = getStreamApiKeyValue();
  const customerStreamUserId = toStreamUserId("customer", params.customerId);
  const vendorStreamUserId = toStreamUserId("vendor", params.vendorAccountId);
  const channelId = toStreamInquiryChannelId(params.vendorAccountId, params.customerId);
  const channelCid = `${STREAM_CHANNEL_TYPE}:${channelId}`;
  const channelName = `Inquiry with ${safeDisplayName(params.vendorName, "Vendor")}`;

  await client.upsertUsers([
    {
      id: customerStreamUserId,
      name: safeDisplayName(params.customerName, "Customer"),
      role: "user",
      app_role: "customer",
      app_user_id: params.customerId,
      email: params.customerEmail || undefined,
    } as any,
    {
      id: vendorStreamUserId,
      name: safeDisplayName(params.vendorName, "Vendor"),
      role: "user",
      app_role: "vendor",
      app_user_id: params.vendorAccountId,
      email: params.vendorEmail || undefined,
    } as any,
  ]);

  const channel = client.channel(STREAM_CHANNEL_TYPE, channelId, {
    name: channelName,
    members: [customerStreamUserId, vendorStreamUserId],
    created_by_id: customerStreamUserId,
    channel_type: "inquiry",
    vendor_account_id: params.vendorAccountId,
    customer_id: params.customerId,
    initial_listing_id: params.initialListingId ?? null,
  } as any);

  try {
    await channel.create({ watch: false, state: false });
  } catch (error) {
    if (!isChannelExistsError(error)) {
      throw error;
    }
  }

  await channel.addMembers([customerStreamUserId, vendorStreamUserId]).catch(() => {});

  await channel.updatePartial({
    set: {
      name: channelName,
      channel_type: "inquiry",
      vendor_account_id: params.vendorAccountId,
      customer_id: params.customerId,
      initial_listing_id: params.initialListingId ?? null,
    },
  } as any);

  return {
    apiKey,
    channelType: STREAM_CHANNEL_TYPE,
    channelId,
    channelCid,
    customerStreamUserId,
    vendorStreamUserId,
    tokenForUser(streamUserId: string) {
      return createExpiringUserToken(client, streamUserId);
    },
  };
}

export async function promoteInquiryToBookingChannel(params: {
  channelId: string;
  bookingId: string;
  eventDate: string;
  retentionExpiresAt: string | null;
}) {
  if (!isStreamChatConfigured()) return;

  const client = getServerClient();
  const channel = client.channel(STREAM_CHANNEL_TYPE, params.channelId);

  try {
    await channel.updatePartial({
      set: {
        booking_id: params.bookingId,
        event_date: params.eventDate,
        retention_expires_at: params.retentionExpiresAt,
        channel_type: "booking",
      },
    } as any);

    await client.upsertUser({ id: "system", name: "EventHub", role: "admin" });
    await channel.sendMessage({
      text: "Booking created — your conversation continues here.",
      user_id: "system",
      type: "system",
    } as any);
  } catch {
    // Non-blocking — promotion failure must never fail the booking creation.
  }
}

/**
 * Posts a system message into a booking's Stream Chat channel.
 * Uses a dedicated "system" user so the message is visually distinct
 * from customer/vendor chat messages.
 * Silent no-op if Stream Chat is not configured or the channel doesn't exist.
 */
export async function sendBookingSystemMessage(params: {
  bookingId: string;
  text: string;
  /** Arbitrary key-value data attached to the message (e.g. proposal_id, proposal_status). */
  metadata?: Record<string, unknown>;
}) {
  if (!isStreamChatConfigured()) return;

  const client = getServerClient();
  const channelId = toStreamBookingChannelId(params.bookingId);

  try {
    // Upsert a system user so Stream Chat accepts the send.
    await client.upsertUser({ id: "system", name: "EventHub", role: "admin" });

    const channel = client.channel(STREAM_CHANNEL_TYPE, channelId);
    await channel.sendMessage({
      text: params.text,
      user_id: "system",
      type: "system",
      ...(params.metadata ? { eventhub: params.metadata } : {}),
    } as any);
  } catch {
    // Non-blocking — system messages are informational only.
    // A failure here should never prevent the proposal action from succeeding.
  }
}

export async function deleteStreamBookingChannel(bookingId: string) {
  const client = getServerClient();
  const cid = toStreamBookingCid(bookingId);
  await client.deleteChannels([cid], { hard_delete: true });
}

export async function getStreamUnreadCountsForBookings(params: {
  role: "customer" | "vendor";
  appUserId: string;
  bookingIds: string[];
}) {
  const counts: Record<string, number> = {};
  for (const bookingId of params.bookingIds) counts[bookingId] = 0;
  let totalUnread = 0;

  if (!isStreamChatConfigured()) {
    return { counts, totalUnread };
  }

  const uniqueBookingIds = Array.from(
    new Set(
      params.bookingIds
        .map((x) => String(x || "").trim())
        .filter((x) => x.length > 0)
    )
  );
  if (uniqueBookingIds.length === 0) {
    return { counts, totalUnread };
  }

  const streamUserId = toStreamUserId(params.role, params.appUserId);
  const channelIds = uniqueBookingIds.map((bookingId) => toStreamBookingChannelId(bookingId));
  const client = getServerClient();

  let channels: Awaited<ReturnType<typeof client.queryChannels>>;
  try {
    channels = await client.queryChannels(
      {
        type: STREAM_CHANNEL_TYPE,
        members: { $in: [streamUserId] },
        id: { $in: channelIds },
      } as any,
      { last_message_at: -1 } as any,
      {
        state: true,
        watch: false,
        presence: false,
        limit: Math.max(uniqueBookingIds.length, 30),
      } as any
    );
  } catch {
    // Stream Chat unavailable or user not yet bootstrapped — return zero counts
    // rather than propagating an error that would cause a 500 for every poll.
    return { counts, totalUnread };
  }

  for (const channel of channels) {
    const bookingIdFromData = String((channel.data as any)?.booking_id || "").trim();
    const bookingId =
      bookingIdFromData ||
      String(channel.id || "")
        .replace(/^booking_/, "")
        .trim();
    if (!bookingId) continue;

    const unreadFromReadState = Number(channel.state?.read?.[streamUserId]?.unread_messages ?? 0);
    const unreadFromState = Number(channel.state?.unreadCount ?? 0);
    const unreadCount = Math.max(0, Number.isFinite(unreadFromReadState) && unreadFromReadState > 0
      ? unreadFromReadState
      : unreadFromState);

    counts[bookingId] = unreadCount;
  }

  for (const bookingId of uniqueBookingIds) {
    totalUnread += Number(counts[bookingId] || 0);
  }

  return { counts, totalUnread };
}

// Like getStreamUnreadCountsForBookings but accepts already-formed channel IDs (for inquiry channels).
export async function getStreamUnreadCountsForChannels(params: {
  role: "customer" | "vendor";
  appUserId: string;
  channelIds: string[];
}) {
  const counts: Record<string, number> = {};
  for (const id of params.channelIds) counts[id] = 0;
  let totalUnread = 0;

  if (!isStreamChatConfigured() || params.channelIds.length === 0) {
    return { counts, totalUnread };
  }

  const uniqueChannelIds = Array.from(new Set(params.channelIds.filter((x) => x.length > 0)));
  const streamUserId = toStreamUserId(params.role, params.appUserId);
  const client = getServerClient();

  let channels: Awaited<ReturnType<typeof client.queryChannels>>;
  try {
    channels = await client.queryChannels(
      {
        type: STREAM_CHANNEL_TYPE,
        members: { $in: [streamUserId] },
        id: { $in: uniqueChannelIds },
      } as any,
      { last_message_at: -1 } as any,
      { state: true, watch: false, presence: false, limit: Math.max(uniqueChannelIds.length, 30) } as any
    );
  } catch {
    return { counts, totalUnread };
  }

  for (const channel of channels) {
    const channelId = String(channel.id || "").trim();
    if (!channelId || !counts.hasOwnProperty(channelId)) continue;
    const unreadFromReadState = Number(channel.state?.read?.[streamUserId]?.unread_messages ?? 0);
    const unreadFromState = Number(channel.state?.unreadCount ?? 0);
    counts[channelId] = Math.max(
      0,
      Number.isFinite(unreadFromReadState) && unreadFromReadState > 0 ? unreadFromReadState : unreadFromState
    );
  }

  for (const id of uniqueChannelIds) totalUnread += Number(counts[id] || 0);
  return { counts, totalUnread };
}

export async function getAverageVendorResponseMinutesForBookings(params: {
  vendorAccountId: string;
  bookingIds: string[];
  channelLimit?: number;
  messageLimitPerChannel?: number;
}): Promise<number | null> {
  if (!isStreamChatConfigured()) return null;

  const vendorAccountId = String(params.vendorAccountId || "").trim();
  if (!vendorAccountId) return null;

  const bookingIds = Array.from(
    new Set(
      (params.bookingIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0)
    )
  );
  if (bookingIds.length === 0) return null;

  const vendorStreamUserId = toStreamUserId("vendor", vendorAccountId);
  const channelIds = bookingIds.map((bookingId) => toStreamBookingChannelId(bookingId));
  const client = getServerClient();
  const channelLimit = Math.max(1, Math.min(params.channelLimit ?? 40, 80));
  const messageLimitPerChannel = Math.max(10, Math.min(params.messageLimitPerChannel ?? 100, 200));

  const channels = await client.queryChannels(
    {
      type: STREAM_CHANNEL_TYPE,
      members: { $in: [vendorStreamUserId] },
      id: { $in: channelIds },
    } as any,
    { last_message_at: -1 } as any,
    {
      state: false,
      watch: false,
      presence: false,
      limit: channelLimit,
    } as any
  );

  const responseMinutes: number[] = [];

  for (const channel of channels.slice(0, channelLimit)) {
    try {
      const state = await channel.query({
        messages: { limit: messageLimitPerChannel },
        state: true,
        watch: false,
        presence: false,
      } as any);

      const rawMessages = Array.isArray((state as any)?.messages)
        ? (state as any).messages
        : Array.isArray((channel as any)?.state?.messages)
          ? (channel as any).state.messages
          : [];

      const orderedMessages = rawMessages
        .map((message: any) => {
          const userId = String(message?.user?.id || "");
          const createdAt = new Date(message?.created_at || message?.createdAt || 0);
          return {
            userId,
            createdAt,
          };
        })
        .filter((message: { userId: string; createdAt: Date }) => {
          return message.userId.length > 0 && !Number.isNaN(message.createdAt.getTime());
        })
        .sort((a: { createdAt: Date }, b: { createdAt: Date }) => a.createdAt.getTime() - b.createdAt.getTime());

      let pendingCustomerMessageAt: Date | null = null;

      for (const message of orderedMessages) {
        const isCustomer = message.userId.startsWith("customer_");
        const isVendor = message.userId === vendorStreamUserId;

        if (isCustomer) {
          if (!pendingCustomerMessageAt) {
            pendingCustomerMessageAt = message.createdAt;
          }
          continue;
        }

        if (!isVendor || !pendingCustomerMessageAt) continue;

        const diffMinutes = (message.createdAt.getTime() - pendingCustomerMessageAt.getTime()) / (1000 * 60);
        if (Number.isFinite(diffMinutes) && diffMinutes >= 0 && diffMinutes <= 60 * 24 * 14) {
          responseMinutes.push(diffMinutes);
        }
        pendingCustomerMessageAt = null;
      }
    } catch {
      // Keep aggregate resilient if one channel query fails.
    }
  }

  if (responseMinutes.length === 0) return null;
  const total = responseMinutes.reduce((sum, value) => sum + value, 0);
  return Math.round(total / responseMinutes.length);
}

export type StreamReplyMessage = {
  role: "customer" | "vendor";
  text: string;
  createdAt: Date;
};

/**
 * Fetch the most recent messages of a Stream channel (booking or inquiry) for the
 * AI reply assistant. Returns oldest-first so the model reads the conversation in
 * order. Senders are classified by Stream user-id prefix: "customer_" → customer,
 * "vendor_" → vendor; system/other messages are dropped. Empty array if Stream is
 * unconfigured, the channel is empty, or the query fails (caller treats it as "no
 * history" rather than erroring the draft request).
 */
export async function getRecentMessagesForChannel(
  channelId: string,
  limit = 12
): Promise<StreamReplyMessage[]> {
  if (!isStreamChatConfigured()) return [];
  const id = String(channelId || "").trim();
  if (!id) return [];

  const messageLimit = Math.max(1, Math.min(limit, 50));
  const client = getServerClient();

  try {
    const channel = client.channel(STREAM_CHANNEL_TYPE, id);
    const state = await channel.query({
      messages: { limit: messageLimit },
      state: true,
      watch: false,
      presence: false,
    } as any);

    const rawMessages = Array.isArray((state as any)?.messages)
      ? (state as any).messages
      : Array.isArray((channel as any)?.state?.messages)
        ? (channel as any).state.messages
        : [];

    return rawMessages
      .map((message: any): StreamReplyMessage | null => {
        const userId = String(message?.user?.id || "");
        const text = String(message?.text || "").trim();
        const createdAt = new Date(message?.created_at || message?.createdAt || 0);
        if (!text || Number.isNaN(createdAt.getTime())) return null;
        const role: "customer" | "vendor" | null = userId.startsWith("customer_")
          ? "customer"
          : userId.startsWith("vendor_")
            ? "vendor"
            : null;
        if (!role) return null;
        return { role, text, createdAt };
      })
      .filter((m: StreamReplyMessage | null): m is StreamReplyMessage => m !== null)
      .sort((a: StreamReplyMessage, b: StreamReplyMessage) => a.createdAt.getTime() - b.createdAt.getTime());
  } catch {
    return [];
  }
}
