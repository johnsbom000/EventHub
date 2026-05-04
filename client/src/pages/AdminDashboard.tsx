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
  Lightbulb, Bug, Star,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import AdminShell from "@/components/AdminShell";

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

// ─── Section: Overview ────────────────────────────────────────────────────────

function OverviewSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: userStats } = useQuery<any>({ queryKey: ["/api/admin/stats/users"], enabled: isAdmin });
  const { data: bookingStats } = useQuery<any>({ queryKey: ["/api/admin/stats/bookings"], enabled: isAdmin });
  const { data: bookingDetail } = useQuery<any>({ queryKey: ["/api/admin/stats/bookings/detail"], enabled: isAdmin });
  const { data: revenue } = useQuery<any>({ queryKey: ["/api/admin/stats/revenue"], enabled: isAdmin });
  const { data: disputes = [] } = useQuery<any[]>({ queryKey: ["/api/admin/disputes"], enabled: isAdmin });
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
        <StatCard title="Open Disputes" value={openDisputes} sub="Needs your review" icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} />
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
            <div className="text-2xl font-bold">{fmt(revenue?.overall?.avgBookingValueCents ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(revenue?.overall?.avgBookingsPerVendorPerMonth ?? 0).toFixed(1)} bookings/vendor/mo
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
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenue?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={(v) => v.slice(5)} />
                <YAxis tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Bar dataKey="revenueCents" name="Revenue" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
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
  const { data: revenue } = useQuery<any>({ queryKey: ["/api/admin/stats/revenue"], enabled: isAdmin });
  const currentYear = new Date().getFullYear();
  const annualThis = revenue?.annual?.find((a: any) => a.year === currentYear);
  const annualLast = revenue?.annual?.find((a: any) => a.year === currentYear - 1);

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

interface DisputeRow {
  id: string; bookingId: string; status: string; reason: string;
  details: string | null; vendorResponse: string | null;
  adminDecision: string | null; adminNotes: string | null;
  filedAt: string; vendorRespondedAt: string | null; resolvedAt: string | null;
  customerName: string | null; customerEmail: string | null;
  vendorBusinessName: string | null; bookingStatus: string;
  bookingEndAt: string | null; payoutStatus: string | null;
}
interface AdminNote { id: string; disputeId: string; content: string; createdAt: string; }

function DisputeCard({ dispute }: { dispute: DisputeRow }) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState("");
  const queryClient = useQueryClient();

  const { data: notes = [] } = useQuery<AdminNote[]>({
    queryKey: ["/api/admin/disputes", dispute.id, "notes"],
    queryFn: () => apiRequest("GET", `/api/admin/disputes/${dispute.id}/notes`).then((r) => r.json()),
    enabled: expanded,
  });

  const addNote = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/admin/disputes/${dispute.id}/note`, { content }).then((r) => r.json()),
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes", dispute.id, "notes"] });
    },
  });

  const resolve = useMutation({
    mutationFn: (decision: "refund" | "payout") =>
      apiRequest("POST", `/api/admin/disputes/${dispute.id}/resolve`, { decision }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] }),
  });

  const isResolved = dispute.status === "resolved_refund" || dispute.status === "resolved_payout";

  return (
    <Card className="mb-3">
      <CardHeader className="cursor-pointer select-none py-3" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={dispute.status} />
              <span className="text-sm font-semibold">{dispute.reason}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Filed {fmtDateTime(dispute.filedAt)} ·{" "}
              <span className="font-medium">{dispute.customerName ?? "Unknown customer"}</span>
              {dispute.customerEmail ? ` (${dispute.customerEmail})` : ""} vs{" "}
              <span className="font-medium">{dispute.vendorBusinessName ?? "Unknown vendor"}</span>
            </p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 mt-1 shrink-0" /> : <ChevronDown className="h-4 w-4 mt-1 shrink-0" />}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-5">
          {/* Timeline */}
          <div className="space-y-3 border-l-2 border-muted pl-4">
            <div>
              <p className="text-xs text-muted-foreground">{fmtDateTime(dispute.filedAt)} — Customer filed</p>
              <p className="text-sm font-medium mt-0.5">{dispute.reason}</p>
              {dispute.details && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{dispute.details}</p>}
            </div>
            {dispute.vendorResponse && (
              <div>
                <p className="text-xs text-muted-foreground">{fmtDateTime(dispute.vendorRespondedAt)} — Vendor responded</p>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{dispute.vendorResponse}</p>
              </div>
            )}
            {notes.map((note) => (
              <div key={note.id} className="bg-blue-50 rounded p-2">
                <p className="text-xs text-muted-foreground">{fmtDateTime(note.createdAt)} — Your note</p>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
            {isResolved && (
              <div className="bg-muted rounded p-2">
                <p className="text-xs text-muted-foreground">{fmtDateTime(dispute.resolvedAt)} — Resolved</p>
                <p className="text-sm font-medium mt-0.5">Decision: {dispute.adminDecision ?? "—"}</p>
                {dispute.adminNotes && <p className="text-sm text-muted-foreground mt-1">{dispute.adminNotes}</p>}
              </div>
            )}
          </div>

          {/* Booking context */}
          <div className="rounded bg-muted/50 p-3 text-sm grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Booking:</span> <span className="font-mono text-xs">{dispute.bookingId}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={dispute.bookingStatus} /></div>
            <div><span className="text-muted-foreground">Event end:</span> {fmtDate(dispute.bookingEndAt)}</div>
            <div><span className="text-muted-foreground">Payout:</span> {dispute.payoutStatus ? <StatusBadge status={dispute.payoutStatus} /> : "—"}</div>
          </div>

          {!isResolved && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Add a note</p>
              <textarea
                className="w-full rounded border p-2 text-sm min-h-[80px] resize-y"
                placeholder="Internal note — visible only to you…"
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

          {!isResolved && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Case decision</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate("payout")}
                >
                  ✓ Approve payout to vendor
                </button>
                <button
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  disabled={resolve.isPending}
                  onClick={() => { if (confirm("Issue a full refund to the customer?")) resolve.mutate("refund"); }}
                >
                  ↩ Refund customer
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

function DisputesSection({ isAdmin }: { isAdmin: boolean }) {
  const [filter, setFilter] = useState("");
  const { data: disputes = [] } = useQuery<DisputeRow[]>({ queryKey: ["/api/admin/disputes"], enabled: isAdmin });

  const filtered = filter ? disputes.filter((d) => d.status === filter) : disputes;
  const openCount = disputes.filter((d) => d.status !== "resolved_refund" && d.status !== "resolved_payout").length;

  return (
    <>
      <PageHeading title="Disputes" description={`${openCount} open case${openCount !== 1 ? "s" : ""} awaiting your review`} />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {["", "filed", "vendor_responded", "resolved_refund", "resolved_payout"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
              filter === f
                ? "bg-[#1e2d3a] text-white border-[#1e2d3a]"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            {f === "" ? `All (${disputes.length})` : f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No disputes {filter ? `with status "${filter.replace(/_/g, " ")}"` : "found"}.
          </CardContent>
        </Card>
      ) : (
        filtered.map((d) => <DisputeCard key={d.id} dispute={d} />)
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

function UsersSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: userStats } = useQuery<any>({ queryKey: ["/api/admin/stats/users"], enabled: isAdmin });

  return (
    <>
      <PageHeading title="Users & Vendors" description="Registrations, growth, and vendor breakdown" />

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <StatCard title="Total Users" value={userStats?.totalUsers ?? 0} sub="Registered customers" icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Total Vendors" value={userStats?.totalVendors ?? 0} sub="Vendor accounts" icon={<Building2 className="h-4 w-4 text-muted-foreground" />} />
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
    </>
  );
}

// ─── Section: Traffic ─────────────────────────────────────────────────────────

function TrafficSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: trafficStats } = useQuery<any>({ queryKey: ["/api/admin/stats/traffic"], enabled: isAdmin });

  return (
    <>
      <PageHeading title="Traffic" description="Website visits and top pages" />

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
  const [tab, setTab] = useState<"flags" | "rereviews" | "warnings">("flags");
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

  const pendingCount = flags.filter((f) => f.status === "pending").length;

  return (
    <>
      <PageHeading
        title="Moderation"
        description="Review circumvention flags, approve resubmitted listings, and track vendor warnings"
      />

      {/* Tab navigation */}
      <div className="flex gap-1 border-b mb-4">
        {(["flags", "rereviews", "warnings"] as const).map((t) => (
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
            {t === "flags" ? "Flags" : t === "rereviews" ? "Re-reviews" : "Warning History"}
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
                            {flag.warningCount}/3 warnings
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
                          className="rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                        >
                          Warn + Remove
                        </button>
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
                          {listing.warningCount}/3 warnings
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
                            {w.warningNumber}/3
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

// ─── Root: auth guard + section router ───────────────────────────────────────

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const params = useParams<{ section?: string }>();
  const { isAuthenticated } = useAuth0();

  const { data: adminMe, isLoading: loadingAdmin, isError: adminDenied } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/me"],
    enabled: isAuthenticated,
    retry: false,
  });
  const isAdmin = adminMe?.isAdmin === true;

  useEffect(() => {
    if (!isAuthenticated) { setLocation("/"); return; }
    if (!loadingAdmin && (adminDenied || (adminMe && !isAdmin))) setLocation("/");
  }, [setLocation, isAuthenticated, loadingAdmin, adminDenied, adminMe, isAdmin]);

  if (loadingAdmin) {
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
      {section === "moderation" && <ModerationSection  isAdmin={isAdmin} />}
      {section === "feedback"   && <FeedbackSection    isAdmin={isAdmin} />}
    </AdminShell>
  );
}
