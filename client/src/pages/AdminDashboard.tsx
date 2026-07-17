import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LabelList,
} from "recharts";
import {
  Users, Building2, Calendar, DollarSign, TrendingUp, Eye,
  AlertTriangle, CheckCircle, XCircle, Clock, Ban, ArrowRightLeft,
  CreditCard, FileText, ChevronDown, ChevronUp, Shield,
  Lightbulb, Bug, Star, Sparkles,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import AdminShell from "@/components/AdminShell";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100
  );
}
function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
}
function fmtDateTime(val: string | null | undefined): string {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-700",
    failed: "bg-red-100 text-red-800",
    expired: "bg-orange-100 text-orange-700",
    filed: "bg-yellow-100 text-yellow-800",
    vendor_responded: "bg-blue-100 text-blue-800",
    resolved_refund: "bg-purple-100 text-purple-800",
    resolved_payout: "bg-green-100 text-green-800",
    paid: "bg-green-100 text-green-800",
    not_ready: "bg-gray-100 text-gray-600",
    eligible: "bg-blue-100 text-blue-800",
    blocked: "bg-red-100 text-red-800",
    scheduled: "bg-indigo-100 text-indigo-800",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({ title, value, sub, icon }: {
  title: string; value: string | number; sub?: string; icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-serif font-bold">{title}</h1>
      {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
    </div>
  );
}

function QueryErrorCard({ message }: { message?: string }) {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
        <p className="text-sm font-medium text-destructive">
          {message ?? "Something went wrong loading this data."}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Check the server logs, then refresh the page.</p>
      </CardContent>
    </Card>
  );
}

// ─── Section: Overview ────────────────────────────────────────────────────────

function OverviewSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: userStats } = useQuery<any>({ queryKey: ["/api/admin/stats/users"], enabled: isAdmin });
  const { data: bookingStats } = useQuery<any>({ queryKey: ["/api/admin/stats/bookings"], enabled: isAdmin });
  const { data: bookingDetail } = useQuery<any>({ queryKey: ["/api/admin/stats/bookings/detail"], enabled: isAdmin });
  const { data: revenue, isError: revenueError } = useQuery<any>({ queryKey: ["/api/admin/stats/revenue"], enabled: isAdmin });
  const { data: disputes = [], isError: disputesError } = useQuery<any[]>({ queryKey: ["/api/admin/disputes"], enabled: isAdmin });
  const { data: stripeBalance } = useQuery<any>({ queryKey: ["/api/admin/stripe/balance"], enabled: isAdmin });

  const openDisputes = disputes.filter(
    (d: any) => d.status !== "resolved_refund" && d.status !== "resolved_payout"
  ).length;

  const currentYear = new Date().getFullYear();
  const annualThis = revenue?.annual?.find((a: any) => a.year === currentYear);

  return (
    <>
      <PageHeading title="Overview" description="EventHub marketplace at a glance" />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
        <StatCard title="Total Users" value={userStats?.totalUsers ?? 0} sub="Registered customers" icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Total Vendors" value={userStats?.totalVendors ?? 0} sub="Active accounts" icon={<Building2 className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Total Bookings" value={bookingStats?.totalBookings ?? 0} sub={`${bookingStats?.completedBookings ?? 0} completed`} icon={<Calendar className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Gross Revenue" value={fmt((bookingStats?.totalRevenue ?? 0) * 100)} sub="All time" icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Platform Earnings" value={fmt((bookingStats?.totalFeeEarnings ?? 0) * 100)} sub="Fees collected" icon={<CreditCard className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Open Disputes" value={disputesError ? "—" : openDisputes} sub={disputesError ? "Failed to load" : "Needs your review"} icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-800">Stripe Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{stripeBalance ? fmt(stripeBalance.availableCents) : "—"}</div>
            <p className="text-xs text-green-600 mt-1">Ready to pay out to your bank</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-800">Stripe Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{stripeBalance ? fmt(stripeBalance.pendingCents) : "—"}</div>
            <p className="text-xs text-yellow-600 mt-1">In transit / processing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Booking Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenueError ? "—" : fmt(revenue?.overall?.avgBookingValueCents ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {revenueError ? "Failed to load" : `${(revenue?.overall?.avgBookingsPerVendorPerMonth ?? 0).toFixed(1)} bookings/vendor/mo`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> {currentYear} Monthly Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueError ? (
              <div className="h-[220px] flex flex-col items-center justify-center text-center">
                <AlertTriangle className="h-5 w-5 text-destructive mb-2" />
                <p className="text-sm font-medium text-destructive">Couldn't load revenue data.</p>
                <p className="text-xs text-muted-foreground mt-1">Check the server logs, then refresh the page.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue?.monthly ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickFormatter={(v) => v.slice(5)} />
                  <YAxis tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Bar dataKey="revenueCents" name="Revenue" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> User Growth (30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={userStats?.userGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ─── Section: Revenue ─────────────────────────────────────────────────────────

function RevenueSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: revenue, isError } = useQuery<any>({ queryKey: ["/api/admin/stats/revenue"], enabled: isAdmin });
  const currentYear = new Date().getFullYear();
  const annualThis = revenue?.annual?.find((a: any) => a.year === currentYear);
  const annualLast = revenue?.annual?.find((a: any) => a.year === currentYear - 1);

  if (isError) {
    return (
      <>
        <PageHeading title="Revenue" description="Gross booking value, platform earnings, and projections" />
        <QueryErrorCard message="Couldn't load revenue analytics." />
      </>
    );
  }

  return (
    <>
      <PageHeading title="Revenue" description="Gross booking value, platform earnings, and projections" />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard title={`${currentYear} Revenue`} value={fmt(annualThis?.revenueCents ?? 0)} sub={`${annualThis?.bookingCount ?? 0} bookings`} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title={`${currentYear} Platform Fees`} value={fmt(annualThis?.platformFeeCents ?? 0)} sub="Your earnings this year" icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title={`${currentYear - 1} Revenue`} value={fmt(annualLast?.revenueCents ?? 0)} sub={`${annualLast?.bookingCount ?? 0} bookings`} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Projected This Year" value={fmt(revenue?.projections?.annualCents ?? 0)} sub={`Avg ${fmt(revenue?.projections?.avgMonthlyRevenueCents ?? 0)}/mo`} icon={<TrendingUp className="h-4 w-4 text-primary" />} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Monthly Revenue — Last 12 Months</CardTitle>
          <CardDescription>Gross booking value vs platform fee collected</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenue?.monthly ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tickFormatter={(v) => v.slice(0, 7)} />
              <YAxis tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} labelFormatter={(l) => String(l).slice(0, 7)} />
              <Legend />
              <Bar dataKey="revenueCents" name="Gross Revenue" fill="hsl(var(--primary))" />
              <Bar dataKey="platformFeeCents" name="Platform Fee" fill="hsl(var(--primary) / 0.4)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Daily Revenue — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={revenue?.daily ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
              <YAxis tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="revenueCents" name="Gross Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="platformFeeCents" name="Platform Fee" stroke="#e07a6a" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Service Type</CardTitle>
          <CardDescription>Overall avg booking value: {fmt(revenue?.overall?.avgBookingValueCents ?? 0)}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">Service Type</th>
                  <th className="text-right py-2 pr-4">Bookings</th>
                  <th className="text-right py-2 pr-4">Gross Revenue</th>
                  <th className="text-right py-2 pr-4">Avg Booking</th>
                  <th className="text-right py-2 pr-4">Vendors</th>
                  <th className="text-right py-2">Avg Bookings/Vendor/Mo</th>
                </tr>
              </thead>
              <tbody>
                {(revenue?.byServiceType ?? []).map((row: any) => (
                  <tr key={row.serviceType} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{row.serviceType}</td>
                    <td className="text-right py-2 pr-4">{row.bookingCount}</td>
                    <td className="text-right py-2 pr-4">{fmt(row.revenueCents)}</td>
                    <td className="text-right py-2 pr-4">{fmt(row.avgBookingValueCents)}</td>
                    <td className="text-right py-2 pr-4">{row.vendorCount}</td>
                    <td className="text-right py-2">{Number(row.avgBookingsPerVendorPerMonth).toFixed(1)}</td>
                  </tr>
                ))}
                {(!revenue?.byServiceType || revenue.byServiceType.length === 0) && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No booking data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Section: Bookings ────────────────────────────────────────────────────────

function BookingsSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: bookingStats } = useQuery<any>({ queryKey: ["/api/admin/stats/bookings"], enabled: isAdmin });
  const { data: bookingDetail } = useQuery<any>({ queryKey: ["/api/admin/stats/bookings/detail"], enabled: isAdmin });
  const byStatus = bookingDetail?.byStatus ?? {};

  return (
    <>
      <PageHeading title="Bookings" description="Status breakdown and booking health metrics" />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        {[
          { key: "pending",   label: "Pending",   icon: <Clock className="h-4 w-4 text-yellow-500" /> },
          { key: "confirmed", label: "Confirmed", icon: <CheckCircle className="h-4 w-4 text-blue-500" /> },
          { key: "completed", label: "Completed", icon: <CheckCircle className="h-4 w-4 text-green-600" /> },
          { key: "cancelled", label: "Cancelled", icon: <XCircle className="h-4 w-4 text-gray-500" /> },
          { key: "failed",    label: "Failed",    icon: <Ban className="h-4 w-4 text-red-500" /> },
          { key: "expired",   label: "Expired",   icon: <XCircle className="h-4 w-4 text-orange-500" /> },
        ].map(({ key, label, icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              {icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{byStatus[key] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-6">
        <StatCard title="Open Disputes" value={bookingDetail?.openDisputes ?? 0} sub="Unresolved cases" icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} />
        <StatCard title="Non-Cancelled" value={bookingDetail?.totalNonCancelled ?? 0} sub="Live & completed bookings" icon={<Calendar className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Active Vendors" value={bookingDetail?.activeVendors ?? 0} sub="With at least 1 booking" icon={<Building2 className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard title="Avg Booking Value" value={fmt(bookingDetail?.avgBookingValueCents ?? 0)} sub="Excluding cancelled/failed" icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Total Bookings" value={bookingStats?.totalBookings ?? 0} sub={`${bookingStats?.completedBookings ?? 0} completed · ${bookingStats?.pendingBookings ?? 0} pending`} icon={<Calendar className="h-4 w-4 text-muted-foreground" />} />
      </div>
    </>
  );
}

// ─── Section: Disputes ────────────────────────────────────────────────────────

interface AdminDisputeFiling {
  id: string;
  case_id: string;
  filed_by: "customer" | "vendor" | "admin";
  dispute_type: string;
  description: string | null;
  attachment_urls: string[] | null;
  claim_amount_cents: number | null;
  created_at: string;
  filer_customer_name: string | null;
  filer_customer_email: string | null;
  filer_vendor_name: string | null;
  filer_vendor_email: string | null;
}

interface AdminDisputeCase {
  case_id: string;
  booking_id: string;
  case_status: string;
  resolution: string | null;
  resolved_at: string | null;
  case_created_at: string;
  case_updated_at: string;
  booking_status: string;
  event_date: string | null;
  booking_end_at: string | null;
  listing_title_snapshot: string | null;
  payout_status: string | null;
  payout_blocked_reason: string | null;
  customer_name: string | null;
  customer_email: string | null;
  vendor_name: string | null;
  vendor_email: string | null;
  filings: AdminDisputeFiling[];
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  travel_cost_recovery: "Travel Cost Recovery",
  damage_claim: "Damage Claim",
  customer_no_show: "Customer No-Show",
  service_not_as_described: "Service Not As Described",
  vendor_no_show: "Vendor No-Show",
  safety_concern: "Safety Concern",
  admin_note: "Admin Note",
  other: "Other",
};

function FilingTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    travel_cost_recovery: "bg-orange-100 text-orange-800",
    damage_claim: "bg-red-100 text-red-800",
    customer_no_show: "bg-yellow-100 text-yellow-800",
    service_not_as_described: "bg-purple-100 text-purple-800",
    vendor_no_show: "bg-pink-100 text-pink-800",
    safety_concern: "bg-red-200 text-red-900",
    admin_note: "bg-blue-100 text-blue-800",
    other: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${colorMap[type] ?? "bg-gray-100 text-gray-700"}`}>
      {DISPUTE_TYPE_LABELS[type] ?? type.replace(/_/g, " ")}
    </span>
  );
}

function AdminDisputeCaseCard({ disputeCase }: { disputeCase: AdminDisputeCase }) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [withheldInput, setWithheldInput] = useState("");
  const [travelAwardInput, setTravelAwardInput] = useState("");
  const queryClient = useQueryClient();

  const isResolved = disputeCase.case_status === "resolved";

  const addNote = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/admin/disputes/${disputeCase.case_id}/note`, { content }).then((r) => r.json()),
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
    },
  });

  const resolve = useMutation({
    mutationFn: ({ decision, withheldAmountCents, travelAwardCents }: { decision: "refund" | "payout"; withheldAmountCents?: number; travelAwardCents?: number }) =>
      apiRequest("POST", `/api/admin/disputes/${disputeCase.case_id}/resolve`, { decision, withheldAmountCents, travelAwardCents }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] }),
  });

  // Summary line: unique dispute types from all non-admin filings
  const filingTypes = Array.from(new Set(
    disputeCase.filings.filter((f) => f.filed_by !== "admin").map((f) => f.dispute_type)
  ));

  // A held travel fee on a cancelled booking is settled via the travel-award flow
  // (award the vendor their incurred cost; refund the remainder to the customer).
  const isTravelDispute = filingTypes.includes("travel_cost_recovery");

  return (
    <Card className="mb-3">
      <CardHeader className="cursor-pointer select-none py-3" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={disputeCase.case_status} />
              {filingTypes.map((t) => <FilingTypeBadge key={t} type={t} />)}
              <span className="text-xs text-muted-foreground">{disputeCase.filings.length} filing{disputeCase.filings.length !== 1 ? "s" : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">{disputeCase.customer_name ?? "Unknown customer"}</span>
              {disputeCase.customer_email ? ` (${disputeCase.customer_email})` : ""} vs{" "}
              <span className="font-medium">{disputeCase.vendor_name ?? "Unknown vendor"}</span>
              {disputeCase.listing_title_snapshot ? ` · ${disputeCase.listing_title_snapshot}` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Last activity {fmtDateTime(disputeCase.case_updated_at)}
            </p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 mt-1 shrink-0" /> : <ChevronDown className="h-4 w-4 mt-1 shrink-0" />}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-5">
          {/* Chronological filing timeline */}
          <div className="space-y-3 border-l-2 border-muted pl-4">
            {disputeCase.filings.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No filings yet.</p>
            ) : (
              disputeCase.filings.map((f) => {
                const filerLabel =
                  f.filed_by === "admin"
                    ? "EventHub (admin)"
                    : f.filed_by === "vendor"
                    ? (f.filer_vendor_name ?? "Vendor")
                    : (f.filer_customer_name ?? "Customer");
                const attachments = Array.isArray(f.attachment_urls) ? f.attachment_urls : [];
                return (
                  <div key={f.id} className={f.filed_by === "admin" ? "bg-blue-50 rounded p-2" : ""}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">{fmtDateTime(f.created_at)} — <span className="font-medium">{filerLabel}</span></p>
                      <FilingTypeBadge type={f.dispute_type} />
                      {f.claim_amount_cents ? (
                        <span className="text-xs font-semibold text-orange-700">Claim: {fmt(f.claim_amount_cents)}</span>
                      ) : null}
                    </div>
                    {f.description && (
                      <p className="text-sm mt-1 whitespace-pre-wrap">{f.description}</p>
                    )}
                    {attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {attachments.map((url, i) => {
                          const isPdf = url.toLowerCase().includes(".pdf");
                          return (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-700 underline hover:text-blue-900"
                            >
                              {isPdf ? "📄" : "🖼️"} Attachment {i + 1}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {isResolved && (
              <div className="bg-muted rounded p-2">
                <p className="text-xs text-muted-foreground">{fmtDateTime(disputeCase.resolved_at)} — Resolved</p>
                {disputeCase.resolution && (
                  <p className="text-sm mt-0.5 font-medium">{disputeCase.resolution}</p>
                )}
              </div>
            )}
          </div>

          {/* Booking context */}
          <div className="rounded bg-muted/50 p-3 text-sm grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Booking:</span> <span className="font-mono text-xs">{disputeCase.booking_id}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={disputeCase.booking_status} /></div>
            <div><span className="text-muted-foreground">Event date:</span> {fmtDate(disputeCase.event_date)}</div>
            <div><span className="text-muted-foreground">Payout:</span> {disputeCase.payout_status ? <StatusBadge status={disputeCase.payout_status} /> : "—"}</div>
          </div>

          {!isResolved && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Add a note</p>
              <textarea
                className="w-full rounded border p-2 text-sm min-h-[80px] resize-y"
                placeholder="Internal note — visible to vendor and customer in their case timeline…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <button
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
                disabled={!noteText.trim() || addNote.isPending}
                onClick={() => addNote.mutate(noteText.trim())}
              >
                {addNote.isPending ? "Saving…" : "Save note"}
              </button>
            </div>
          )}

          {!isResolved && isTravelDispute && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Travel cost recovery</p>

              {/* Award the vendor their proven travel cost from the held travel fee. */}
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Award to vendor (optional)</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={travelAwardInput}
                    onChange={(e) => setTravelAwardInput(e.target.value)}
                    className="h-8 w-32 rounded border border-border px-2 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    paid to vendor from the held travel fee; remainder refunded to the customer
                  </span>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  disabled={resolve.isPending}
                  onClick={() => {
                    const awardCents = travelAwardInput.trim()
                      ? Math.round(parseFloat(travelAwardInput) * 100)
                      : 0;
                    if (!(awardCents > 0)) {
                      alert("Enter an award amount, or use “Refund all to customer”.");
                      return;
                    }
                    if (confirm(`Award $${(awardCents / 100).toFixed(2)} to the vendor and refund the remaining travel fee to the customer?`)) {
                      resolve.mutate({ decision: "payout", travelAwardCents: awardCents });
                    }
                  }}
                >
                  ✓ Award to vendor
                </button>
                <button
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  disabled={resolve.isPending}
                  onClick={() => {
                    if (confirm("Refund the entire held travel fee to the customer?")) {
                      resolve.mutate({ decision: "refund", travelAwardCents: 0 });
                    }
                  }}
                >
                  ↩ Refund all to customer
                </button>
              </div>
              {resolve.isError && <p className="text-xs text-red-600">Failed. Please try again.</p>}
            </div>
          )}

          {!isResolved && !isTravelDispute && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Case decision</p>

              {/* Partial withhold — for damage claims where vendor keeps some of the deposit */}
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Damage withhold (optional)</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={withheldInput}
                    onChange={(e) => setWithheldInput(e.target.value)}
                    className="h-8 w-32 rounded border border-border px-2 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">withheld for damages (leave blank for full refund)</span>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ decision: "payout" })}
                >
                  ✓ Approve payout to vendor
                </button>
                <button
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  disabled={resolve.isPending}
                  onClick={() => {
                    const withheldCents = withheldInput.trim()
                      ? Math.round(parseFloat(withheldInput) * 100)
                      : 0;
                    const label = withheldCents > 0
                      ? `Refund customer with $${(withheldCents / 100).toFixed(2)} withheld for damages?`
                      : "Issue a full refund to the customer?";
                    if (confirm(label)) resolve.mutate({ decision: "refund", withheldAmountCents: withheldCents || undefined });
                  }}
                >
                  ↩ {withheldInput && parseFloat(withheldInput) > 0 ? "Partial refund + withhold" : "Full refund to customer"}
                </button>
              </div>
              {resolve.isError && <p className="text-xs text-red-600">Failed. Please try again.</p>}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

const DISPUTE_TYPE_FILTERS = [
  { value: "", label: "All types" },
  { value: "travel_cost_recovery", label: "Travel Cost Recovery" },
  { value: "damage_claim", label: "Damage Claim" },
  { value: "customer_no_show", label: "Customer No-Show" },
  { value: "service_not_as_described", label: "Service Not As Described" },
  { value: "vendor_no_show", label: "Vendor No-Show" },
  { value: "safety_concern", label: "Safety Concern" },
  { value: "other", label: "Other" },
];

function DisputesSection({ isAdmin }: { isAdmin: boolean }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data: cases = [], isError } = useQuery<AdminDisputeCase[]>({
    queryKey: ["/api/admin/disputes", statusFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      return apiRequest("GET", `/api/admin/disputes?${params.toString()}`).then((r) => r.json());
    },
    enabled: isAdmin,
  });

  const openCount = cases.filter((c) => c.case_status !== "resolved").length;

  return (
    <>
      <PageHeading
        title="Disputes"
        description={isError ? "Dispute cases could not be loaded" : `${openCount} open case${openCount !== 1 ? "s" : ""} awaiting your review`}
      />

      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { value: "", label: `All (${cases.length})` },
            { value: "open", label: "Open" },
            { value: "pending_review", label: "Pending review" },
            { value: "resolved", label: "Resolved" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                statusFilter === f.value
                  ? "bg-[#1e2d3a] text-white border-[#1e2d3a]"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {DISPUTE_TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                typeFilter === f.value
                  ? "bg-[#4a6a7d] text-white border-[#4a6a7d]"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <QueryErrorCard message="Couldn't load dispute cases." />
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No dispute cases found{statusFilter || typeFilter ? " for the selected filters" : ""}.
          </CardContent>
        </Card>
      ) : (
        cases.map((c) => <AdminDisputeCaseCard key={c.case_id} disputeCase={c} />)
      )}
    </>
  );
}

// ─── Section: Payouts ─────────────────────────────────────────────────────────

function PayoutsSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: payoutsData } = useQuery<{ records: any[]; summary: any[] }>({
    queryKey: ["/api/admin/payouts"],
    enabled: isAdmin,
  });

  const summaryMap: Record<string, { count: number; totalCents: number }> = {};
  for (const s of payoutsData?.summary ?? []) summaryMap[s.payoutStatus] = { count: s.count, totalCents: s.totalCents };

  return (
    <>
      <PageHeading title="Payouts" description="Vendor payout ledger and transfer status" />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-6">
        {["paid", "eligible", "not_ready", "blocked", "scheduled"].map((s) => (
          <Card key={s}>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground capitalize">{s.replace(/_/g, " ")}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{summaryMap[s]?.count ?? 0}</div>
              <div className="text-xs text-muted-foreground">{fmt(summaryMap[s]?.totalCents ?? 0)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" /> Payout Ledger
          </CardTitle>
          <CardDescription>All deposit payments and their transfer status. Most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-3">Vendor</th>
                  <th className="text-left py-2 pr-3">Listing</th>
                  <th className="text-left py-2 pr-3">Event Date</th>
                  <th className="text-right py-2 pr-3">Total</th>
                  <th className="text-right py-2 pr-3">Platform Fee</th>
                  <th className="text-right py-2 pr-3">Vendor Payout</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Paid Out</th>
                  <th className="text-left py-2">Transfer ID</th>
                </tr>
              </thead>
              <tbody>
                {(payoutsData?.records ?? []).map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.vendorBusinessName ?? "—"}</div>
                      <div className="text-muted-foreground">{r.vendorEmail ?? ""}</div>
                    </td>
                    <td className="py-2 pr-3 max-w-[140px] truncate">{r.listingTitle ?? "—"}</td>
                    <td className="py-2 pr-3">{fmtDate(r.eventDate)}</td>
                    <td className="text-right py-2 pr-3">{fmt(r.totalAmount ?? 0)}</td>
                    <td className="text-right py-2 pr-3">{fmt(r.platformFeeAmount ?? 0)}</td>
                    <td className="text-right py-2 pr-3 font-medium">{fmt(r.payoutAdjustedAmount ?? r.vendorNetPayoutAmount ?? 0)}</td>
                    <td className="py-2 pr-3"><StatusBadge status={r.payoutStatus} /></td>
                    <td className="py-2 pr-3">{fmtDate(r.paidOutAt)}</td>
                    <td className="py-2 font-mono text-muted-foreground">
                      {r.stripeTransferId
                        ? <span title={r.stripeTransferId}>{r.stripeTransferId.slice(0, 14)}…</span>
                        : r.payoutBlockedReason ?? "—"}
                    </td>
                  </tr>
                ))}
                {(!payoutsData?.records || payoutsData.records.length === 0) && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No payout records yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Section: Users ───────────────────────────────────────────────────────────

// Admin tool: search a vendor and grant / cancel complimentary Pro (DB-only,
// never touches Stripe). Billed subscriptions are managed in the Stripe dashboard.
function CompManagementCard() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; businessName: string; email: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setMessage("Type at least 2 characters.");
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const res = await apiRequest("GET", `/api/admin/vendors/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(Array.isArray(json?.vendors) ? json.vendors : []);
      if (!json?.vendors?.length) setMessage("No vendors found.");
    } catch {
      setMessage("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  async function grant(vendorId: string) {
    setMessage(null);
    try {
      const res = await apiRequest("POST", `/api/admin/vendors/${vendorId}/grant-comp`, { days: 30 });
      if (!res.ok) throw new Error();
      setMessage("Granted 30 days of complimentary Pro.");
    } catch {
      setMessage("Could not grant comp.");
    }
  }

  async function cancel(vendorId: string) {
    setMessage(null);
    try {
      const res = await apiRequest("POST", `/api/admin/vendors/${vendorId}/cancel-comp`, {});
      if (!res.ok) throw new Error();
      setMessage("Complimentary Pro ended; vendor dropped to Free.");
    } catch {
      setMessage("Could not cancel comp (vendor may not be on a comp grant).");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complimentary Pro</CardTitle>
        <CardDescription>Grant or end a free Pro grant for a specific vendor. Does not affect billed subscriptions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder="Search vendor by name or email"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {results.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border">
            {results.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{v.businessName}</p>
                  <p className="text-muted-foreground truncate">{v.email}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => grant(v.id)} className="px-3 py-1.5 text-xs bg-[#4a6a7d] text-[#f5f0e8] rounded hover:opacity-90">
                    Grant 30d Pro
                  </button>
                  <button onClick={() => cancel(v.id)} className="px-3 py-1.5 text-xs bg-muted text-foreground rounded hover:bg-muted/70">
                    End comp
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UsersSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: userStats } = useQuery<any>({ queryKey: ["/api/admin/stats/users"], enabled: isAdmin });

  return (
    <>
      <PageHeading title="Users & Vendors" description="Registrations, growth, and vendor breakdown" />

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <StatCard title="Total Users" value={userStats?.totalUsers ?? 0} sub="Registered customers" icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Total Vendors" value={userStats?.totalVendors ?? 0} sub="Vendor accounts" icon={<Building2 className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground mb-3">Pro subscriptions</h3>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5 mb-6">
        <StatCard title="Pro (total)" value={userStats?.subscriptionCounts?.pro ?? 0} sub="Active + trial + comp" icon={<Sparkles className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Paying" value={userStats?.subscriptionCounts?.active ?? 0} sub="Active subscriptions" icon={<CreditCard className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Trialing" value={userStats?.subscriptionCounts?.trialing ?? 0} sub="In free trial" icon={<Clock className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Complimentary" value={userStats?.subscriptionCounts?.comp ?? 0} sub="Comp grants" icon={<Star className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Past due" value={userStats?.subscriptionCounts?.pastDue ?? 0} sub="Payment retrying" icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div className="mb-6">
        <CompManagementCard />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>User Growth — Last 30 Days</CardTitle>
            <CardDescription>Daily new registrations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={userStats?.userGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendors by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={userStats?.vendorsByType ?? []} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))">
                  <LabelList dataKey="count" position="top" style={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ─── Section: Listings ────────────────────────────────────────────────────────

function ListingsSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: listingStats } = useQuery<any>({ queryKey: ["/api/admin/stats/listings"], enabled: isAdmin });

  return (
    <>
      <PageHeading title="Listings" description="Vendor listing inventory and status" />

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <StatCard title="Total"    value={listingStats?.totalListings ?? 0}    icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Active"   value={listingStats?.activeListings ?? 0}   icon={<CheckCircle className="h-4 w-4 text-green-600" />} />
        <StatCard title="Draft"    value={listingStats?.draftListings ?? 0}    icon={<Clock className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Inactive" value={listingStats?.inactiveListings ?? 0} icon={<XCircle className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <Card>
        <CardHeader><CardTitle>Listings by Category</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={listingStats?.listingsByType ?? []} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))">
                <LabelList dataKey="count" position="top" style={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Subcategory breakdowns — one chart per category that has data */}
      {listingStats?.subcatByCategory &&
        Object.entries(listingStats.subcatByCategory as Record<string, { name: string; count: number; details: { name: string; count: number }[] }[]>).map(([category, subcats]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{category} — Subcategories</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, subcats.length * 36 + 40)}>
                <BarChart
                  layout="vertical"
                  data={subcats}
                  margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, _name, props) => {
                      const entry = props.payload as any;
                      const details = entry?.details ?? [];
                      if (details.length > 0) {
                        return [
                          `${value} total (${details.map((d: any) => `${d.name}: ${d.count}`).join(", ")})`,
                          "Listings",
                        ];
                      }
                      return [value, "Listings"];
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary) / 0.75)">
                    <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))
      }
    </>
  );
}

// ─── Section: Traffic ─────────────────────────────────────────────────────────

function TrafficSection({ isAdmin }: { isAdmin: boolean }) {
  const [excludeInternal, setExcludeInternal] = useState(true);
  const trafficUrl = excludeInternal
    ? "/api/admin/stats/traffic?excludeInternal=true"
    : "/api/admin/stats/traffic";
  const { data: trafficStats } = useQuery<any>({ queryKey: [trafficUrl], enabled: isAdmin });

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold">Traffic</h1>
          <p className="text-muted-foreground text-sm mt-1">Website visits and top pages</p>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <Switch id="exclude-internal" checked={excludeInternal} onCheckedChange={setExcludeInternal} />
          <label htmlFor="exclude-internal" className="text-sm text-muted-foreground cursor-pointer select-none">
            Exclude my accounts
          </label>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-2 mb-6">
        <StatCard title="Total Visits" value={trafficStats?.totalVisits ?? 0} sub="All time" icon={<Eye className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Unique Visitors" value={trafficStats?.uniqueVisitors ?? 0} sub="Logged-in users" icon={<Users className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Traffic — Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trafficStats?.dailyTraffic ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Most Visited Pages</CardTitle>
            <CardDescription>Top 10 by all-time traffic</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(trafficStats?.topPaths ?? []).slice(0, 10).map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1 text-muted-foreground font-mono text-xs">{item.path}</span>
                  <span className="ml-4 font-semibold">{item.count}</span>
                </div>
              ))}
              {(!trafficStats?.topPaths || trafficStats.topPaths.length === 0) && (
                <p className="text-sm text-muted-foreground">No traffic data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ─── Section: Moderation ─────────────────────────────────────────────────────

const FLAG_TYPE_LABELS: Record<string, string> = {
  hard_block_attempt: "Hard block",
  soft_flag: "Soft flag",
  customer_report: "Customer report",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  chat_message: "Chat message",
  listing_description: "Listing description",
  listing_title: "Listing title",
  vendor_description: "Vendor description",
  tagline: "Tagline",
};

const FLAG_TYPE_COLORS: Record<string, string> = {
  hard_block_attempt: "bg-red-100 text-red-800",
  soft_flag: "bg-amber-100 text-amber-800",
  customer_report: "bg-blue-100 text-blue-800",
};

function ModerationSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"flags" | "rereviews" | "warnings" | "suspensions">("flags");
  const [statusFilter, setStatusFilter] = useState<"pending" | "dismissed" | "actioned">("pending");

  const { data: flags = [], isLoading: loadingFlags } = useQuery<any[]>({
    queryKey: ["/api/admin/circumvention/flags", statusFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/circumvention/flags?status=${statusFilter}`);
      return res.json();
    },
    enabled: isAdmin && tab === "flags",
  });

  const { data: rereviews = [], isLoading: loadingRereviews } = useQuery<any[]>({
    queryKey: ["/api/admin/circumvention/rereviews"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/circumvention/rereviews");
      return res.json();
    },
    enabled: isAdmin && tab === "rereviews",
  });

  const { data: warnings = [], isLoading: loadingWarnings } = useQuery<any[]>({
    queryKey: ["/api/admin/circumvention/warnings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/circumvention/warnings");
      return res.json();
    },
    enabled: isAdmin && tab === "warnings",
  });

  const { data: suspensions = [], isLoading: loadingSuspensions } = useQuery<any[]>({
    queryKey: ["/api/admin/circumvention/suspensions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/circumvention/suspensions");
      return res.json();
    },
    enabled: isAdmin && tab === "suspensions",
  });

  const dismissMutation = useMutation({
    mutationFn: async (flagId: string) => {
      const res = await apiRequest("POST", `/api/admin/circumvention/flags/${flagId}/dismiss`);
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/flags", statusFilter] }),
  });

  const warnRemoveMutation = useMutation({
    mutationFn: async (flagId: string) => {
      const res = await apiRequest("POST", `/api/admin/circumvention/flags/${flagId}/warn-remove`);
      if (!res.ok) throw new Error("Failed to warn + remove");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/flags", statusFilter] });
      qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/rereviews"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/warnings"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/admin/circumvention/listings/${listingId}/approve`);
      if (!res.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/rereviews"] }),
  });

  // Vendor targeted by the suspend dialog (null = dialog closed).
  const [suspendTarget, setSuspendTarget] = useState<{ vendorAccountId: string; businessName: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDuration, setSuspendDuration] = useState("30");

  const suspendMutation = useMutation({
    mutationFn: async (vars: { vendorAccountId: string; reason: string; durationDays: number }) => {
      const res = await apiRequest("POST", `/api/admin/circumvention/vendors/${vars.vendorAccountId}/suspend`, {
        reason: vars.reason || undefined,
        durationDays: vars.durationDays,
      });
      if (!res.ok) throw new Error("Failed to suspend");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/flags", statusFilter] });
      qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/suspensions"] });
      setSuspendTarget(null);
      setSuspendReason("");
      setSuspendDuration("30");
    },
  });

  const liftMutation = useMutation({
    mutationFn: async (suspensionId: string) => {
      const res = await apiRequest("POST", `/api/admin/circumvention/suspensions/${suspensionId}/lift`);
      if (!res.ok) throw new Error("Failed to lift suspension");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/circumvention/suspensions"] }),
  });

  const pendingCount = flags.filter((f) => f.status === "pending").length;

  return (
    <>
      <PageHeading
        title="Moderation"
        description="Review circumvention flags, approve resubmitted listings, and track vendor warnings"
      />

      {/* Tab navigation */}
      <div className="flex gap-1 border-b mb-4">
        {(["flags", "rereviews", "warnings", "suspensions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "flags" ? "Flags" : t === "rereviews" ? "Re-reviews" : t === "warnings" ? "Warning History" : "Suspensions"}
            {t === "flags" && pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
            {t === "rereviews" && rereviews.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {rereviews.length}
              </span>
            )}
            {t === "suspensions" && suspensions.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {suspensions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Flags tab ─────────────────────────────────────────────────────────── */}
      {tab === "flags" && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Circumvention Flags
                </CardTitle>
                <CardDescription>Content flagged for potential off-platform redirection</CardDescription>
              </div>
              <div className="flex gap-1">
                {(["pending", "dismissed", "actioned"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingFlags ? (
              <p className="py-8 text-center text-muted-foreground text-sm">Loading flags…</p>
            ) : flags.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No {statusFilter} flags. {statusFilter === "pending" ? "All clear." : ""}
              </p>
            ) : (
              <div className="space-y-3">
                {flags.map((flag: any) => (
                  <div key={flag.id} className="rounded-lg border p-4 space-y-2">
                    {/* Header row */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm">
                          {flag.businessName || "Unknown vendor"}
                        </p>
                        <p className="text-xs text-muted-foreground">{flag.vendorEmail}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${FLAG_TYPE_COLORS[flag.flagType] ?? "bg-gray-100 text-gray-700"}`}>
                          {FLAG_TYPE_LABELS[flag.flagType] ?? flag.flagType}
                        </span>
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {CONTENT_TYPE_LABELS[flag.contentType] ?? flag.contentType}
                        </span>
                        {flag.warningCount > 0 && (
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${flag.warningCount >= 3 ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}>
                            {flag.warningCount} {flag.warningCount === 1 ? "warning" : "warnings"}
                          </span>
                        )}
                        {flag.isSuspended && (
                          <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                            <Ban className="h-3 w-3" /> Suspended
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content snapshot */}
                    <div className="rounded bg-muted px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Flagged content:</p>
                      <p className="whitespace-pre-wrap break-words">{flag.contentSnapshot}</p>
                    </div>

                    {/* Matches */}
                    {flag.matches?.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Matched: {flag.matches.slice(0, 5).join(", ")}
                      </p>
                    )}

                    {/* Listing info */}
                    {flag.listingTitle && (
                      <p className="text-xs text-muted-foreground">
                        Listing: <span className="font-medium">{flag.listingTitle}</span>
                        {" — "}
                        <StatusBadge status={flag.listingStatus ?? "unknown"} />
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Flagged {fmtDateTime(flag.createdAt)}
                      {flag.reviewedBy && ` · Reviewed by ${flag.reviewedBy} on ${fmtDateTime(flag.reviewedAt)}`}
                    </p>

                    {/* Actions */}
                    {flag.status === "pending" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={dismissMutation.isPending}
                          onClick={() => dismissMutation.mutate(flag.id)}
                          className="rounded border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          Dismiss — no violation
                        </button>
                        <button
                          type="button"
                          disabled={warnRemoveMutation.isPending}
                          onClick={() => warnRemoveMutation.mutate(flag.id)}
                          className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                        >
                          Warn + Remove listing
                        </button>
                        {flag.vendorAccountId && !flag.isSuspended && (
                          <button
                            type="button"
                            onClick={() => {
                              setSuspendReason("");
                              setSuspendDuration("30");
                              setSuspendTarget({ vendorAccountId: flag.vendorAccountId, businessName: flag.businessName || "this vendor" });
                            }}
                            className="rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                          >
                            Suspend vendor
                          </button>
                        )}
                        {flag.vendorAccountId && flag.isSuspended && (
                          <span className="inline-flex items-center rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-700">
                            Already suspended
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Re-reviews tab ────────────────────────────────────────────────────── */}
      {tab === "rereviews" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" /> Listings Awaiting Re-review
            </CardTitle>
            <CardDescription>
              Vendors have corrected these listings after a violation removal.
              Review and approve to make them live again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRereviews ? (
              <p className="py-8 text-center text-muted-foreground text-sm">Loading…</p>
            ) : rereviews.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No listings awaiting re-review.
              </p>
            ) : (
              <div className="space-y-3">
                {rereviews.map((listing: any) => (
                  <div key={listing.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{listing.title || "(Untitled listing)"}</p>
                        <p className="text-xs text-muted-foreground">
                          {listing.businessName} · {listing.vendorEmail}
                        </p>
                      </div>
                      {listing.warningCount > 0 && (
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${listing.warningCount >= 3 ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}>
                          {listing.warningCount} {listing.warningCount === 1 ? "warning" : "warnings"}
                        </span>
                      )}
                    </div>
                    {listing.description && (
                      <div className="rounded bg-muted px-3 py-2 text-sm">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Listing description:</p>
                        <p className="line-clamp-4 whitespace-pre-wrap">{listing.description}</p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Last updated: {fmtDateTime(listing.updatedAt)}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(listing.id)}
                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        Approve &amp; Publish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Warning history tab ───────────────────────────────────────────────── */}
      {tab === "warnings" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Warning History
            </CardTitle>
            <CardDescription>All circumvention warnings issued across all vendors</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingWarnings ? (
              <p className="py-8 text-center text-muted-foreground text-sm">Loading…</p>
            ) : warnings.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">No warnings issued yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Vendor</th>
                      <th className="pb-2 pr-4 font-medium">#</th>
                      <th className="pb-2 pr-4 font-medium">Reason</th>
                      <th className="pb-2 pr-4 font-medium">Issued By</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {warnings.map((w: any) => (
                      <tr key={w.id} className="text-sm">
                        <td className="py-2 pr-4">
                          <p className="font-medium">{w.businessName}</p>
                          <p className="text-xs text-muted-foreground">{w.vendorEmail}</p>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${w.warningNumber >= 3 ? "bg-red-100 text-red-800" : w.warningNumber === 2 ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"}`}>
                            #{w.warningNumber}
                          </span>
                        </td>
                        <td className="py-2 pr-4 max-w-xs">
                          <p className="text-xs text-muted-foreground">{w.reason}</p>
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{w.issuedBy}</td>
                        <td className="py-2 text-xs text-muted-foreground">{fmtDateTime(w.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Suspensions tab ───────────────────────────────────────────────────── */}
      {tab === "suspensions" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-600" /> Active Suspensions
            </CardTitle>
            <CardDescription>Vendor accounts currently suspended for circumvention violations</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSuspensions ? (
              <p className="py-8 text-center text-muted-foreground text-sm">Loading…</p>
            ) : suspensions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">No active suspensions.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Vendor</th>
                      <th className="pb-2 pr-4 font-medium">Reason</th>
                      <th className="pb-2 pr-4 font-medium">Started</th>
                      <th className="pb-2 pr-4 font-medium">Expires</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {suspensions.map((s: any) => (
                      <tr key={s.id} className="text-sm">
                        <td className="py-2 pr-4">
                          <p className="font-medium">{s.businessName}</p>
                          <p className="text-xs text-muted-foreground">{s.vendorEmail}</p>
                        </td>
                        <td className="py-2 pr-4 max-w-xs">
                          <p className="text-xs text-muted-foreground">{s.reason}</p>
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{fmtDate(s.startsAt)}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{fmtDate(s.endsAt)}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            disabled={liftMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Lift the suspension for ${s.businessName || "this vendor"}?`)) {
                                liftMutation.mutate(s.id);
                              }
                            }}
                            className="rounded border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            Lift
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Suspend vendor dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!suspendTarget} onOpenChange={(open) => { if (!open) setSuspendTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" /> Suspend vendor
            </DialogTitle>
            <DialogDescription>
              Suspending <span className="font-medium text-foreground">{suspendTarget?.businessName}</span> deactivates
              all their live listings for the duration below and emails them. You can lift it early from the Suspensions tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="suspend-duration">Duration (days)</Label>
              <Input
                id="suspend-duration"
                type="number"
                min={1}
                max={3650}
                value={suspendDuration}
                onChange={(e) => setSuspendDuration(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suspend-reason">Reason <span className="text-muted-foreground font-normal">(optional — shown to the vendor)</span></Label>
              <Textarea
                id="suspend-reason"
                rows={3}
                placeholder="e.g. Repeated attempts to share off-platform contact information."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setSuspendTarget(null)}
              className="rounded border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={suspendMutation.isPending || !suspendTarget || !(Number(suspendDuration) > 0)}
              onClick={() => {
                if (!suspendTarget) return;
                suspendMutation.mutate({
                  vendorAccountId: suspendTarget.vendorAccountId,
                  reason: suspendReason.trim(),
                  durationDays: Math.floor(Number(suspendDuration)),
                });
              }}
              className="rounded bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {suspendMutation.isPending ? "Suspending…" : "Suspend vendor"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Section: Feedback ────────────────────────────────────────────────────────

function FeedbackSection({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/feedback"],
    enabled: isAdmin,
  });

  const flagMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/feedback/${id}/flag`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] }),
  });

  const [activeTab, setActiveTab] = useState<"all" | "feature_request" | "bug_report" | "flagged">("all");

  const filtered = items.filter((item) => {
    if (activeTab === "flagged") return item.flagged;
    if (activeTab === "all") return true;
    return item.type === activeTab;
  });

  const featureCount = items.filter((i) => i.type === "feature_request").length;
  const bugCount = items.filter((i) => i.type === "bug_report").length;
  const flaggedCount = items.filter((i) => i.flagged).length;

  return (
    <>
      <PageHeading title="Feedback" description="Feature requests and bug reports from customers and vendors" />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard title="Total Submissions" value={items.length} icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Feature Requests" value={featureCount} icon={<Lightbulb className="h-4 w-4 text-amber-500" />} />
        <StatCard title="Bug Reports" value={bugCount} icon={<Bug className="h-4 w-4 text-red-500" />} />
        <StatCard title="Flagged" value={flaggedCount} sub="Items you've marked important" icon={<Star className="h-4 w-4 text-blue-500" />} />
      </div>

      {/* Tab filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "feature_request", "bug_report", "flagged"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-[#1e2d3a] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab === "all" && `All (${items.length})`}
            {tab === "feature_request" && `Features (${featureCount})`}
            {tab === "bug_report" && `Bugs (${bugCount})`}
            {tab === "flagged" && `Flagged (${flaggedCount})`}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((item: any) => (
                <div key={item.id} className="flex items-start gap-4 px-6 py-4">
                  {/* Type icon */}
                  <div className="mt-0.5 shrink-0">
                    {item.type === "feature_request" ? (
                      <Lightbulb className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Bug className="h-5 w-5 text-red-500" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm leading-snug">{item.title}</p>
                      <span className={`shrink-0 inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                        item.type === "feature_request"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {item.type === "feature_request" ? "Feature Request" : "Bug Report"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{item.description}</p>
                    {item.attachmentUrl && (
                      <a
                        href={item.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                      >
                        View attachment
                      </a>
                    )}
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {item.submitterRole === "vendor" ? "Vendor" : "Customer"}
                        {item.submitterName ? ` · ${item.submitterName}` : ""}
                        {item.submitterEmail ? ` · ${item.submitterEmail}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmtDateTime(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Flag button */}
                  <button
                    onClick={() => flagMutation.mutate(item.id)}
                    disabled={flagMutation.isPending}
                    title={item.flagged ? "Remove flag" : "Flag as important"}
                    className={`mt-0.5 shrink-0 transition-colors ${
                      item.flagged
                        ? "text-blue-500 hover:text-blue-700"
                        : "text-muted-foreground hover:text-blue-500"
                    }`}
                  >
                    <Star className={`h-4 w-4 ${item.flagged ? "fill-current" : ""}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Section: Platform Health ────────────────────────────────────────────────

function HealthSection({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/health"],
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000, // re-check every 5 min
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Scanning platform…</div>;
  }

  const staleBookings: any[]  = data?.staleBookings  ?? [];
  const unreadMessages: any[] = data?.unreadMessages ?? [];
  const stalePayouts: any[]   = data?.stalePayouts   ?? [];
  const doubleBookings: any[] = data?.doubleBookings ?? [];
  const thresholds: any       = data?.thresholds     ?? {};

  const totalAlerts = (data?.summary?.totalAlerts ?? 0);

  return (
    <>
      <PageHeading
        title="Platform Health"
        description="Actionable items that have gone unattended past their expected response window."
      />

      {/* Summary row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Stale Bookings"
          value={staleBookings.length}
          sub={`Pending > ${thresholds.staleBookingHours ?? 6}h`}
          icon={<Clock className="h-4 w-4 text-yellow-500" />}
        />
        <StatCard
          title="Unread Messages"
          value={unreadMessages.length}
          sub={`Unread > ${thresholds.staleMessageHours ?? 4}h`}
          icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
        />
        <StatCard
          title="Stale Payouts"
          value={stalePayouts.length}
          sub={`Eligible > ${thresholds.stalePayoutHours ?? 48}h`}
          icon={<DollarSign className="h-4 w-4 text-red-500" />}
        />
        <StatCard
          title="Double Bookings"
          value={doubleBookings.length}
          sub="Should always be 0"
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
        />
      </div>

      {totalAlerts === 0 && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-green-800 font-medium">All clear — no actionable items right now.</p>
            <p className="text-green-600 text-xs mt-1">This page auto-refreshes every 5 minutes.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Stale Pending Bookings ─────────────────────────────────────────── */}
      {staleBookings.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Booking Requests Awaiting Vendor Response
            </CardTitle>
            <CardDescription>
              Vendor has not accepted or declined. Auto-expiry will cancel these — intervene if needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-2 font-medium">Listing</th>
                  <th className="text-left pb-2 font-medium">Vendor</th>
                  <th className="text-left pb-2 font-medium">Customer</th>
                  <th className="text-left pb-2 font-medium">Event Date</th>
                  <th className="text-right pb-2 font-medium">Value</th>
                  <th className="text-right pb-2 font-medium">Waiting</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staleBookings.map((b: any) => (
                  <tr key={b.id} className="hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{b.listing_title_snapshot ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span>{b.vendor_name ?? "—"}</span>
                      {b.vendor_email && (
                        <span className="block text-xs text-muted-foreground">{b.vendor_email}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span>{b.customer_name ?? "—"}</span>
                      {b.customer_email && (
                        <span className="block text-xs text-muted-foreground">{b.customer_email}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-sm">{fmtDate(b.event_date)}</td>
                    <td className="py-2 pr-3 text-right">{fmt(b.total_amount ?? 0)}</td>
                    <td className="py-2 text-right">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                        {Math.round(Number(b.hours_waiting))}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Unread Messages ───────────────────────────────────────────────────── */}
      {unreadMessages.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Conversations with Unread Messages
            </CardTitle>
            <CardDescription>
              Active bookings where a message has gone unread past the response window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-2 font-medium">Booking / Listing</th>
                  <th className="text-left pb-2 font-medium">Vendor</th>
                  <th className="text-left pb-2 font-medium">Customer</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                  <th className="text-right pb-2 font-medium">Unread</th>
                  <th className="text-right pb-2 font-medium">Oldest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {unreadMessages.map((m: any) => (
                  <tr key={m.booking_id} className="hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{m.listing_title_snapshot ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground font-mono">{m.booking_id}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span>{m.vendor_name ?? "—"}</span>
                      {m.vendor_email && (
                        <span className="block text-xs text-muted-foreground">{m.vendor_email}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span>{m.customer_name ?? "—"}</span>
                      {m.customer_email && (
                        <span className="block text-xs text-muted-foreground">{m.customer_email}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3"><StatusBadge status={m.booking_status} /></td>
                    <td className="py-2 pr-3 text-right font-medium">{m.unread_count}</td>
                    <td className="py-2 text-right">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800">
                        {Math.round(Number(m.hours_waiting))}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Stale Eligible Payouts ────────────────────────────────────────────── */}
      {stalePayouts.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-red-500" />
              Payouts Eligible but Not Transferred
            </CardTitle>
            <CardDescription>
              These payments passed the 24h post-event window and are eligible for payout, but the transfer has not completed. Go to Payouts to process them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-2 font-medium">Listing</th>
                  <th className="text-left pb-2 font-medium">Vendor</th>
                  <th className="text-left pb-2 font-medium">Event Date</th>
                  <th className="text-right pb-2 font-medium">Vendor Amount</th>
                  <th className="text-right pb-2 font-medium">Eligible For</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stalePayouts.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{p.listing_title_snapshot ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span>{p.vendor_name ?? "—"}</span>
                      {p.vendor_email && (
                        <span className="block text-xs text-muted-foreground">{p.vendor_email}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-sm">{fmtDate(p.event_date)}</td>
                    <td className="py-2 pr-3 text-right font-medium">{fmt(p.vendor_net_payout_amount ?? 0)}</td>
                    <td className="py-2 text-right">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                        {Math.round(Number(p.hours_waiting))}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Suspected Double Bookings ─────────────────────────────────────────── */}
      {doubleBookings.length > 0 && (
        <Card className="mb-6 border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Suspected Double Bookings — Investigate Immediately
            </CardTitle>
            <CardDescription>
              Two active bookings overlap for the same listing. The system prevents these at creation — if any appear here, investigate the booking IDs immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-2 font-medium">Listing</th>
                  <th className="text-left pb-2 font-medium">Vendor</th>
                  <th className="text-left pb-2 font-medium">Booking A</th>
                  <th className="text-left pb-2 font-medium">Booking B</th>
                  <th className="text-left pb-2 font-medium">Overlap Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {doubleBookings.map((d: any) => (
                  <tr key={`${d.booking_a_id}-${d.booking_b_id}`} className="hover:bg-red-50/50">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{d.listing_title_snapshot ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span>{d.vendor_name ?? "—"}</span>
                      {d.vendor_email && (
                        <span className="block text-xs text-muted-foreground">{d.vendor_email}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">{d.booking_a_id}</span>
                      <StatusBadge status={d.status_a} />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">{d.booking_b_id}</span>
                      <StatusBadge status={d.status_b} />
                    </td>
                    <td className="py-2 text-xs">
                      {fmtDateTime(d.start_a)} – {fmtDateTime(d.end_a)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}


// ─── Root: auth guard + section router ───────────────────────────────────────

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const params = useParams<{ section?: string }>();
  const { isAuthenticated, isLoading: authLoading } = useAuth0();

  const { data: adminMe, isLoading: loadingAdmin, isError: adminDenied } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/me"],
    enabled: isAuthenticated && !authLoading,
    retry: 2,
  });
  const isAdmin = adminMe?.isAdmin === true;

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { setLocation("/"); return; }
    if (!loadingAdmin && (adminDenied || (adminMe && !isAdmin))) setLocation("/");
  }, [setLocation, authLoading, isAuthenticated, loadingAdmin, adminDenied, adminMe, isAdmin]);

  if (authLoading || loadingAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }
  if (!isAdmin) return null;

  const section = params?.section ?? "";

  return (
    <AdminShell>
      {section === ""           && <OverviewSection    isAdmin={isAdmin} />}
      {section === "revenue"    && <RevenueSection     isAdmin={isAdmin} />}
      {section === "bookings"   && <BookingsSection    isAdmin={isAdmin} />}
      {section === "disputes"   && <DisputesSection    isAdmin={isAdmin} />}
      {section === "payouts"    && <PayoutsSection     isAdmin={isAdmin} />}
      {section === "users"      && <UsersSection       isAdmin={isAdmin} />}
      {section === "listings"   && <ListingsSection    isAdmin={isAdmin} />}
      {section === "traffic"    && <TrafficSection     isAdmin={isAdmin} />}
      {section === "moderation" && <ModerationSection       isAdmin={isAdmin} />}
      {section === "feedback"   && <FeedbackSection         isAdmin={isAdmin} />}
      {section === "health"     && <HealthSection           isAdmin={isAdmin} />}
    </AdminShell>
  );
}
