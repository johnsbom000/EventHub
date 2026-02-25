import { StreamChat } from "stream-chat";

const STREAM_CHANNEL_TYPE = "messaging";
const BOOKING_CHANNEL_PREFIX = "booking_";
const RETENTION_DAYS_AFTER_EVENT = 30;

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
      return client.createToken(streamUserId);
    },
  };
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

  const channels = await client.queryChannels(
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
