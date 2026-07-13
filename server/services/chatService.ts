import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import { type BookingChatContext, normalizeBookingChatContext, extractRows } from "../lib/routeUtils";

export { type BookingChatContext };

export async function getBookingChatContextById(bookingId: string): Promise<BookingChatContext | null> {
  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) as "vendorAccountId",
      va.business_name as "vendorName",
      va.email as "vendorEmail",
      coalesce(b.event_date::text, e.date::text) as "eventDate",
      e.path as "eventTitle",
      b.status as "status",
      b.payment_status as "paymentStatus",
      b.created_at as "createdAt",
      (
        select bi.item_data->>'paymentMethodId'
        from booking_items bi
        where bi.booking_id = b.id
        limit 1
      ) as "paymentMethodId"
    from bookings b
    left join users u on u.id = b.customer_id
    left join events e on e.id = b.event_id
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select vl.account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_owner on true
    left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id)
    where b.id = ${bookingId}
    limit 1
  `);
  const row = extractRows(rows)[0];
  return row ? normalizeBookingChatContext(row) : null;
}

export async function listCustomerBookingChatContexts(customerId: string): Promise<BookingChatContext[]> {
  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) as "vendorAccountId",
      va.business_name as "vendorName",
      va.email as "vendorEmail",
      coalesce(b.event_date::text, e.date::text) as "eventDate",
      e.path as "eventTitle",
      (
        select coalesce(
          nullif(trim(bi_t.item_data->>'listingTitle'), ''),
          nullif(trim(vl_t.title), '')
        )
        from booking_items bi_t
        left join vendor_listings vl_t on vl_t.id = bi_t.listing_id
        where bi_t.booking_id = b.id
        order by bi_t.id asc
        limit 1
      ) as "bookingTitle",
      b.status as "status",
      b.payment_status as "paymentStatus",
      b.created_at as "createdAt",
      (
        select bi2.item_data->>'paymentMethodId'
        from booking_items bi2
        where bi2.booking_id = b.id
        limit 1
      ) as "paymentMethodId"
    from bookings b
    left join users u on u.id = b.customer_id
    left join events e on e.id = b.event_id
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select vl.account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_owner on true
    left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id)
    where b.customer_id = ${customerId}
    order by b.created_at desc
  `);
  return extractRows(rows).map(normalizeBookingChatContext);
}

export async function listVendorBookingChatContexts(vendorAccountId: string): Promise<BookingChatContext[]> {
  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) as "vendorAccountId",
      va.business_name as "vendorName",
      va.email as "vendorEmail",
      coalesce(b.event_date::text, e.date::text) as "eventDate",
      e.path as "eventTitle",
      (
        select coalesce(
          nullif(trim(bi_t.item_data->>'listingTitle'), ''),
          nullif(trim(vl_t.title), '')
        )
        from booking_items bi_t
        left join vendor_listings vl_t on vl_t.id = bi_t.listing_id
        where bi_t.booking_id = b.id
        order by bi_t.id asc
        limit 1
      ) as "bookingTitle",
      b.status as "status",
      b.payment_status as "paymentStatus",
      b.created_at as "createdAt",
      (
        select bi2.item_data->>'paymentMethodId'
        from booking_items bi2
        where bi2.booking_id = b.id
        limit 1
      ) as "paymentMethodId"
    from bookings b
    left join users u on u.id = b.customer_id
    left join events e on e.id = b.event_id
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select vl.account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_owner on true
    left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id)
    where coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) = ${vendorAccountId}
    order by b.created_at desc
  `);
  return extractRows(rows).map(normalizeBookingChatContext);
}

export type InquiryChannel = {
  inquiryChannelId: string;
  vendorAccountId: string;
  vendorName: string | null;
  vendorEmail: string | null;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  createdAt: Date | string | null;
};

export async function listCustomerInquiryChannels(customerId: string): Promise<InquiryChannel[]> {
  const rows: any = await db.execute(drizzleSql`
    select
      vi.stream_channel_id  as "inquiryChannelId",
      vi.vendor_account_id  as "vendorAccountId",
      va.business_name      as "vendorName",
      va.email              as "vendorEmail",
      vi.customer_id        as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email               as "customerEmail",
      vi.created_at         as "createdAt"
    from vendor_inquiries vi
    join vendor_accounts va on va.id = vi.vendor_account_id
    left join users u on u.id = vi.customer_id
    where vi.customer_id = ${customerId}
      and vi.status = 'active'
      and va.deleted_at is null
    order by vi.created_at desc
  `);
  return extractRows<InquiryChannel>(rows);
}

export async function listVendorInquiryChannels(vendorAccountId: string): Promise<InquiryChannel[]> {
  const rows: any = await db.execute(drizzleSql`
    select
      vi.stream_channel_id  as "inquiryChannelId",
      vi.vendor_account_id  as "vendorAccountId",
      va.business_name      as "vendorName",
      va.email              as "vendorEmail",
      vi.customer_id        as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email               as "customerEmail",
      vi.created_at         as "createdAt"
    from vendor_inquiries vi
    join vendor_accounts va on va.id = vi.vendor_account_id
    left join users u on u.id = vi.customer_id
    where vi.vendor_account_id = ${vendorAccountId}
      and vi.status = 'active'
      and va.deleted_at is null
    order by vi.created_at desc
  `);
  return extractRows<InquiryChannel>(rows);
}
