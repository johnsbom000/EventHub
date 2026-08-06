import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

const SECTIONS = [
  { id: "platform-agreement", label: "Platform Agreement" },
  { id: "vendor-agreement", label: "Vendor Agreement" },
  { id: "listing-terms", label: "Listing Terms" },
  { id: "transaction-agreement", label: "Transaction Agreement" },
  { id: "messaging-terms", label: "Messaging Terms" },
  { id: "post-booking", label: "Post-Booking" },
  { id: "disputes", label: "Disputes & Resolution" },
];

export default function TermsOfService() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/" className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("terms.backToEventHub")}
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("terms.pageTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Version 6 · Governing law: State of Utah · Questions: legal@eventhub.com
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
          {/* Sidebar TOC */}
          <nav className="hidden lg:block">
            <div className="sticky top-8 space-y-1">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("terms.contents")}</p>
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="prose prose-sm max-w-none text-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-medium [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:space-y-1 [&_li]:text-muted-foreground">

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Please read these Terms carefully. By accessing or using EventHub, you agree to be bound by these Terms, including mandatory arbitration and class action waiver provisions in Section 19.
            </div>

            {/* 1. Global Platform Agreement */}
            <section id="platform-agreement">
              <h2>1. Global Platform Agreement</h2>
              <p>
                EventHub operates an online marketplace connecting event rental and service vendors ("Vendors") with customers seeking event-related goods and services ("Customers"). Together, Vendors and Customers are referred to as "Users."
              </p>
              <p>EventHub expressly:</p>
              <ul>
                <li>Is <strong>not</strong> a party to any transaction, booking, or agreement formed between Users</li>
                <li>Does <strong>not</strong> own, operate, or control any listed goods or services</li>
                <li>Does <strong>not</strong> guarantee the quality, safety, legality, or accuracy of any listing</li>
                <li>Acts solely as a technology platform facilitating connections and processing payments as a limited payment collection agent</li>
              </ul>
              <p>
                By accessing, registering for, or using EventHub, you agree to be legally bound by these Terms. You must be at least 18 years of age and legally capable of entering into a binding contract.
              </p>
              <p>
                EventHub's liability to any User is capped at <strong>$100</strong> in the aggregate for any and all claims arising from use of the Platform. All disputes are subject to binding arbitration; class action claims are waived.
              </p>
              <p>
                All Vendors are independent contractors — not employees, agents, or representatives of EventHub. EventHub is not vicariously liable for the acts, omissions, negligence, or misconduct of any Vendor or Customer.
              </p>
            </section>

            <div className="border-t border-border" />

            {/* 2. Vendor Agreement */}
            <section id="vendor-agreement">
              <h2>2. Vendor Agreement</h2>
              <p>
                Before any listing goes live, Vendors must complete a separate acceptance step in the vendor dashboard. By activating a vendor account, Vendors agree to the following obligations:
              </p>
              <ul>
                <li>Provide accurate, complete, and non-misleading listing information</li>
                <li>Fulfill all confirmed bookings exactly as described</li>
                <li>Maintain compliance with all applicable laws, permits, licenses, and regulations</li>
                <li>Carry appropriate business insurance where required by law or reasonably prudent</li>
                <li>Respond to booking inquiries and customer communications in a timely manner</li>
                <li>Remit applicable taxes on all revenue received through the Platform</li>
                <li>Immediately notify EventHub of any material changes to their business or ability to fulfill bookings</li>
              </ul>
              <p>
                Vendors may not solicit off-platform bookings, payments, or communications from Customers they meet through EventHub. Violations are subject to account suspension or permanent ban under the Anti-Circumvention Policy (Section 10).
              </p>
              <p>
                EventHub may charge a service fee to customers and, depending on the vendor's subscription plan, a platform fee to vendors on bookings. Vendors on paid plans may be exempt from the vendor platform fee. All applicable fees are disclosed before checkout and in the vendor dashboard. Payments are processed by our third-party payment processor (Stripe), whose standard payment-processing fees may also apply. Payout schedules and the applicable fees are disclosed in the vendor dashboard. Payouts are processed after successful booking completion, less any applicable fees. EventHub may change its fees, fee structure, and subscription pricing at any time; any change applies only to bookings and subscription periods that begin after it takes effect, and current fees are always shown before checkout and in the vendor dashboard.
              </p>
            </section>

            <div className="border-t border-border" />

            {/* 3. Listing-Level Terms */}
            <section id="listing-terms">
              <h2>3. Listing Terms</h2>
              <p>
                All listings on EventHub are created and maintained exclusively by Vendors. EventHub does not verify, inspect, or endorse any listing, vendor, or the goods and services described therein.
              </p>
              <p>
                Before proceeding to checkout, Customers are presented with the Vendor's specific cancellation policy and damage deposit terms. By continuing to checkout after reviewing these terms, Customers acknowledge and accept those vendor-specific policies.
              </p>
              <p>
                Listing photos, descriptions, and pricing are provided by Vendors and may not reflect current availability or condition. Customers are encouraged to communicate directly with Vendors through the EventHub messaging system to confirm details before booking.
              </p>
            </section>

            <div className="border-t border-border" />

            {/* 4. Transaction Agreement */}
            <section id="transaction-agreement">
              <h2>4. Transaction Agreement</h2>
              <p>
                A binding booking is formed when a Customer completes checkout and payment is confirmed. By confirming a booking, Customers agree to:
              </p>
              <ul>
                <li>Authorize the full payment amount charged through EventHub's payment processor</li>
                <li>Accept responsibility for any damage to or loss of rented items beyond normal wear</li>
                <li>Assume all risk of personal injury arising from use of the rented goods or services</li>
                <li>Conduct all booking-related communications exclusively through the EventHub platform</li>
              </ul>
              <p>
                Customers have a <strong>72-hour window from the event date</strong> to file a refund dispute. Disputes filed after this window will not be considered. Disputes must include supporting documentation.
              </p>
              <p>
                EventHub processes payments as a limited payment collection agent on behalf of Vendors. Vendor payouts are released after the event date, subject to any open disputes. All payments are processed through Stripe and subject to Stripe's terms of service.
              </p>
            </section>

            <div className="border-t border-border" />

            {/* 5. Messaging Terms */}
            <section id="messaging-terms">
              <h2>5. Messaging &amp; Inquiry Terms</h2>
              <p>
                EventHub provides a messaging system to facilitate communication between Customers and Vendors. All booking-related communications must occur through this system.
              </p>
              <p>Users are prohibited from sharing through the messaging system:</p>
              <ul>
                <li>Email addresses or phone numbers</li>
                <li>External website URLs or booking links</li>
                <li>Social media handles or payment app usernames</li>
                <li>Any information intended to facilitate off-platform transactions</li>
              </ul>
              <p>
                EventHub's circumvention detection system monitors messages for prohibited contact information. Violations result in a warning, message block, and potential account suspension under the three-warning system. Soliciting off-platform bookings constitutes a material breach of these Terms and may result in permanent account termination.
              </p>
              <p>
                Message records may be retained and reviewed by EventHub staff in connection with disputes, investigations, or legal proceedings. By using the messaging system, you consent to this retention and review.
              </p>
            </section>

            <div className="border-t border-border" />

            {/* 6. Post-Booking Agreement */}
            <section id="post-booking">
              <h2>6. Post-Booking Agreement</h2>
              <p>
                Upon booking confirmation, both the Customer and Vendor receive a confirmation email documenting the booking terms, cancellation policy, damage deposit requirements, and fulfillment obligations. These confirmation emails constitute notice of the agreed terms.
              </p>
              <p>
                The <strong>72-hour dispute window begins from the event date</strong> — not the booking date. Customers must file any service quality claims within this window. Vendors must file any damage claims within 48 hours of item return, supported by timestamped photo evidence and, for claims over $100, a third-party estimate.
              </p>
              <p>
                Cancellation requests must follow the Vendor's cancellation policy as disclosed at the time of booking. Refunds, where applicable, are processed within 5–10 business days depending on your financial institution.
              </p>
            </section>

            <div className="border-t border-border" />

            {/* 7. Disputes */}
            <section id="disputes">
              <h2>7. Disputes &amp; Resolution</h2>
              <p>
                EventHub provides a dispute resolution process as a courtesy service. EventHub has the right — but not the obligation — to investigate disputes between Users.
              </p>
              <p>To file a dispute:</p>
              <ul>
                <li>Service quality claims must be filed within 72 hours of the event date with supporting documentation (photos, written communication, etc.)</li>
                <li>Vendor damage claims require timestamped photo evidence submitted within 72 hours of item return; claims over $100 require a third-party repair or replacement estimate</li>
                <li>Personal injury claims must be directed to the Vendor and, where applicable, their insurer — EventHub does not provide insurance coverage</li>
              </ul>
              <p>
                EventHub's dispute determinations are non-binding administrative decisions, not legal findings. EventHub does not act as an arbitrator or mediator. Any payment adjustments made by EventHub in connection with a dispute are made at EventHub's sole discretion and do not constitute an admission of liability by any party.
              </p>
              <p>
                All disputes between a User and EventHub that cannot be resolved informally are subject to binding individual arbitration under the American Arbitration Association's Consumer Arbitration Rules. Class action lawsuits and class-wide arbitration are waived. Governing law is the State of Utah.
              </p>
            </section>

            <div className="border-t border-border" />

            <p className="text-xs text-muted-foreground">
              For questions about these Terms, contact us at{" "}
              <a href="mailto:legal@eventhub.com" className="underline hover:text-foreground">
                legal@eventhub.com
              </a>
              . EventHub reserves the right to modify these Terms at any time. Continued use of the Platform after any modification constitutes your acceptance of the updated Terms.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
