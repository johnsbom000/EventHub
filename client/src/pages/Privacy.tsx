import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

const SECTIONS = [
  { id: "information-we-collect", label: "Information We Collect" },
  { id: "how-we-use", label: "How We Use Information" },
  { id: "payment-processing", label: "Payment Processing" },
  { id: "authentication", label: "Authentication" },
  { id: "maps-location", label: "Maps & Location" },
  { id: "messaging", label: "Messaging" },
  { id: "google-calendar", label: "Google Calendar Integration" },
  { id: "how-we-share", label: "How We Share Information" },
  { id: "data-retention", label: "Data Retention" },
  { id: "security", label: "Security" },
  { id: "your-rights", label: "Your Rights" },
  { id: "california", label: "California Residents" },
  { id: "children", label: "Children's Privacy" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "Contact Us" },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/" className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to EventHub
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Effective June 3, 2026 · Governing law: State of Utah · Questions: support@eventhubglobal.com
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
          {/* Sidebar TOC */}
          <nav className="hidden lg:block">
            <div className="sticky top-8 space-y-1">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Contents</p>
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

            <p>
              EventHub, LLC ("EventHub," "we," "us," or "our") operates an online marketplace connecting event rental and service vendors with customers. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform at eventhub.com and any associated mobile or desktop applications (collectively, the "Platform").
            </p>
            <p>
              By accessing or using the Platform you agree to this Privacy Policy. If you do not agree, please discontinue use.
            </p>

            {/* 1. Information We Collect */}
            <section id="information-we-collect">
              <h2>1. Information We Collect</h2>

              <h3>Information You Provide Directly</h3>
              <ul>
                <li><strong>Account registration:</strong> name, email address, and profile photo when you create an account.</li>
                <li><strong>Vendor onboarding:</strong> business name, business address, tax identification information, and bank or debit card details (collected and stored by Stripe — see Section 3).</li>
                <li><strong>Listings:</strong> photos, descriptions, pricing, availability, and location information you submit for your rental or service offerings.</li>
                <li><strong>Bookings and payments:</strong> event dates, delivery addresses, booking details, and payment card information (collected by Stripe — see Section 3).</li>
                <li><strong>Messages:</strong> content of messages exchanged between customers and vendors through our in-app chat.</li>
                <li><strong>Reviews:</strong> ratings and written reviews you submit for completed bookings.</li>
                <li><strong>Support communications:</strong> information you provide when contacting us.</li>
              </ul>

              <h3>Information Collected Automatically</h3>
              <ul>
                <li><strong>Usage data:</strong> pages visited, search queries, listings viewed, clicks, and session duration.</li>
                <li><strong>Device information:</strong> IP address, browser type, operating system, and device identifiers.</li>
                <li><strong>Location data:</strong> approximate location inferred from IP address, and precise location (if permitted) used to show nearby vendors and to geocode addresses.</li>
                <li><strong>Cookies and similar technologies:</strong> session identifiers, analytics preferences, and feature-flag values stored in your browser. See Section 8 of our Terms of Service for details.</li>
              </ul>

              <h3>Information From Third Parties</h3>
              <ul>
                <li><strong>Auth0:</strong> authentication information including your name, email, and profile image if you sign in with a social provider (Google, etc.).</li>
                <li><strong>Stripe:</strong> payment status, dispute notifications, and payout confirmation events delivered via webhook.</li>
                <li><strong>Google Calendar:</strong> calendar event data if you connect your Google Calendar to manage vendor availability.</li>
              </ul>
            </section>

            {/* 2. How We Use Information */}
            <section id="how-we-use">
              <h2>2. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul>
                <li>Create and maintain your account and authenticate your identity.</li>
                <li>Process bookings, payments, refunds, and payouts.</li>
                <li>Connect customers with vendors and facilitate communication between them.</li>
                <li>Send transactional emails (booking confirmations, payment receipts, dispute notifications, review prompts).</li>
                <li>Enforce our Terms of Service, including our off-platform circumvention policy.</li>
                <li>Detect, investigate, and prevent fraud, abuse, and security incidents.</li>
                <li>Improve and personalize the Platform through analytics and A/B testing.</li>
                <li>Comply with applicable laws and respond to lawful requests from government authorities.</li>
              </ul>
              <p>
                We do not sell your personal information to third parties, and we do not use it to serve behavioral advertising on behalf of third-party advertisers.
              </p>
            </section>

            {/* 3. Payment Processing */}
            <section id="payment-processing">
              <h2>3. Payment Processing (Stripe)</h2>
              <p>
                All payment processing on EventHub is handled by <strong>Stripe, Inc.</strong> ("Stripe"). When you enter payment card details, those details are transmitted directly to Stripe and are never stored on EventHub's servers.
              </p>
              <p>
                Stripe is a PCI-DSS Level 1 certified payment processor. By completing a purchase or connecting as a vendor, you agree to Stripe's{" "}
                <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a href="https://stripe.com/legal/connect-account" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Stripe Connected Account Agreement
                </a>.
              </p>
              <p>
                EventHub receives from Stripe: payment status (succeeded, failed, refunded), payout confirmation, and dispute/chargeback notifications. We store these events to maintain accurate booking and financial records.
              </p>
              <p>
                Vendor payouts are held for a platform-defined period following each event before being transferred to the vendor's connected Stripe account. Stripe's data practices, including data retention for financial records, are governed by Stripe's Privacy Policy.
              </p>
            </section>

            {/* 4. Authentication */}
            <section id="authentication">
              <h2>4. Authentication (Auth0)</h2>
              <p>
                Account authentication is managed by <strong>Auth0, Inc.</strong> ("Auth0"). When you register or log in, your credentials are processed by Auth0 under their{" "}
                <a href="https://auth0.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Privacy Policy
                </a>.
              </p>
              <p>
                EventHub receives from Auth0: your user identifier, email address, name, and profile photo (if provided). We do not receive or store your password.
              </p>
              <p>
                If you sign in using a social provider (such as Google), that provider's privacy policy also applies to information shared during authentication.
              </p>
            </section>

            {/* 5. Maps & Location */}
            <section id="maps-location">
              <h2>5. Maps & Location Data (Mapbox)</h2>
              <p>
                Vendor location and map display features are powered by <strong>Mapbox, Inc.</strong> When you browse vendors or enter an address, location data may be transmitted to Mapbox for geocoding and map tile rendering, subject to Mapbox's{" "}
                <a href="https://www.mapbox.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Privacy Policy
                </a>.
              </p>
              <p>
                Precise device location (GPS) is only accessed if you explicitly grant permission through your browser. You may browse the Platform without granting location access; we use your IP-derived approximate location as a default.
              </p>
            </section>

            {/* 6. Messaging */}
            <section id="messaging">
              <h2>6. Messaging (Stream)</h2>
              <p>
                In-app messaging between customers and vendors is powered by <strong>Stream, Inc.</strong> Message content is transmitted to and stored by Stream, subject to their{" "}
                <a href="https://getstream.io/legal/privacy-policy/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Privacy Policy
                </a>.
              </p>
              <p>
                EventHub monitors message content solely to enforce our Terms of Service, including detection of off-platform solicitation. Messages flagged by our automated system may be reviewed by EventHub staff.
              </p>
            </section>

            {/* 7. Google Calendar Integration */}
            <section id="google-calendar">
              <h2>7. Google Calendar Integration</h2>
              <p>
                EventHub offers vendors an optional integration with Google Calendar to synchronize confirmed bookings into the vendor's calendar.
              </p>
              <h3>What We Access</h3>
              <p>When a vendor connects their Google account, EventHub requests three permissions:</p>
              <ul>
                <li><strong>Read and write access to calendar events</strong> (<code>calendar.events</code>) — used to create, update, and delete booking events in the vendor's selected calendar, and to register push notification watch channels so that changes made directly in Google Calendar are reflected in EventHub availability.</li>
                <li><strong>Read-only access to the vendor's calendar list</strong> (<code>calendar.calendarlist.readonly</code>) — used to display the vendor's available calendars so they can select which one to sync with.</li>
                <li><strong>Access to the vendor's Google account email address</strong> (<code>userinfo.email</code>) — used to display the connected Google account in the vendor's dashboard settings.</li>
              </ul>
              <p>
                EventHub only reads event data from the specific calendar the vendor explicitly selects. We do not access Drive, Contacts, Gmail, or any other Google data.
              </p>
              <h3>How We Use It</h3>
              <p>
                We use Google Calendar data exclusively to write and update booking events when booking status changes, write vacation block events when a vendor marks dates unavailable, and receive push notifications when a vendor edits an event directly in Google Calendar so EventHub availability stays in sync. Google Calendar data is never used for advertising, analytics, or user profiling.
              </p>
              <h3>How We Store It</h3>
              <p>
                OAuth access tokens (short-lived, ~1 hour) and refresh tokens (long-lived) are encrypted at rest using AES-256-GCM with a 256-bit key stored separately from the database. Tokens are never shared with any third party and are never logged or exposed to client-side code.
              </p>
              <h3>Retention</h3>
              <p>
                Tokens are kept while the integration is active. Disconnecting from the vendor dashboard immediately deletes all tokens from our database and revokes the access token with Google. Account deletion purges all Google tokens within 30 days.
              </p>
              <h3>Vendor Rights</h3>
              <p>
                Vendors may disconnect the Google Calendar integration at any time from dashboard Settings. This stops all future sync and deletes stored tokens. Previously created calendar events are not removed from Google Calendar on disconnect. Vendors may also revoke EventHub's access directly at{" "}
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  myaccount.google.com/permissions
                </a>.
              </p>
            </section>

            {/* 9. How We Share Information */}
            <section id="how-we-share">
              <h2>8. How We Share Your Information</h2>
              <p>We share your information only in the following circumstances:</p>
              <ul>
                <li>
                  <strong>Between customers and vendors:</strong> When a booking is created, we share the customer's name, event details, and delivery address with the vendor. The vendor's business name, location, and contact information are shared with the customer.
                </li>
                <li>
                  <strong>Service providers:</strong> We share data with Stripe, Auth0, Mapbox, Stream, and other sub-processors as described above, and with cloud infrastructure providers (such as Railway and Neon), solely to operate and improve the Platform.
                </li>
                <li>
                  <strong>Legal obligations:</strong> We may disclose information if required by law, court order, or government authority, or if we believe disclosure is necessary to protect the rights, property, or safety of EventHub, our users, or the public.
                </li>
                <li>
                  <strong>Business transfers:</strong> If EventHub is acquired, merged, or undergoes a similar corporate transaction, your information may be transferred as part of that transaction. We will notify you via email and/or a prominent notice on the Platform before your information is transferred.
                </li>
              </ul>
              <p>We do not sell, rent, or trade your personal information to third parties for their marketing purposes.</p>
            </section>

            {/* 10. Data Retention */}
            <section id="data-retention">
              <h2>9. Data Retention</h2>
              <p>
                We retain your personal information for as long as your account is active or as needed to provide services. We also retain information to comply with legal obligations (including tax and financial record-keeping requirements, which may extend up to 7 years), resolve disputes, and enforce agreements.
              </p>
              <p>
                When you request deletion of your account, we will delete or anonymize your personal information within 30 days, except where retention is required by law or needed to resolve outstanding disputes.
              </p>
            </section>

            {/* 11. Security */}
            <section id="security">
              <h2>10. Security</h2>
              <p>
                We implement industry-standard safeguards including encrypted data transmission (HTTPS/TLS), encrypted storage of sensitive credentials, server-side authentication token validation, and access controls limiting staff access to personal data.
              </p>
              <p>
                No method of transmission over the Internet or method of electronic storage is 100% secure. While we use commercially reasonable means to protect your information, we cannot guarantee absolute security. If you become aware of a security vulnerability, please contact us at security@eventhub.com.
              </p>
            </section>

            {/* 12. Your Rights */}
            <section id="your-rights">
              <h2>11. Your Rights</h2>
              <p>Depending on your location, you may have the right to:</p>
              <ul>
                <li><strong>Access:</strong> request a copy of the personal information we hold about you.</li>
                <li><strong>Correction:</strong> request correction of inaccurate or incomplete information.</li>
                <li><strong>Deletion:</strong> request deletion of your personal information, subject to legal retention requirements.</li>
                <li><strong>Portability:</strong> receive your personal information in a structured, machine-readable format.</li>
                <li><strong>Objection:</strong> object to processing of your personal information for certain purposes.</li>
                <li><strong>Withdrawal of consent:</strong> where processing is based on consent, withdraw it at any time without affecting prior processing.</li>
              </ul>
              <p>
                To exercise these rights, email us at support@eventhubglobal.com. We will respond within 30 days. We may ask you to verify your identity before fulfilling a request.
              </p>
            </section>

            {/* 13. California */}
            <section id="california">
              <h2>12. California Residents (CCPA / CPRA)</h2>
              <p>
                If you are a California resident, the California Consumer Privacy Act (CCPA) and the California Privacy Rights Act (CPRA) provide you additional rights, including:
              </p>
              <ul>
                <li>The right to know what personal information we collect, use, disclose, and sell.</li>
                <li>The right to delete personal information we have collected from you (subject to exceptions).</li>
                <li>The right to correct inaccurate personal information.</li>
                <li>The right to opt out of the sale or sharing of personal information. <strong>We do not sell or share personal information as defined under the CCPA/CPRA.</strong></li>
                <li>The right to non-discrimination for exercising your privacy rights.</li>
              </ul>
              <p>
                To submit a California privacy rights request, email support@eventhubglobal.com with "California Privacy Request" in the subject line. We will respond within 45 days.
              </p>
            </section>

            {/* 14. Children */}
            <section id="children">
              <h2>13. Children's Privacy</h2>
              <p>
                The Platform is intended for users who are at least 18 years old. We do not knowingly collect personal information from children under 13. If we learn that we have collected personal information from a child under 13 without verifiable parental consent, we will delete that information. If you believe a child has provided us with personal information, please contact us at support@eventhubglobal.com.
              </p>
            </section>

            {/* 15. Changes */}
            <section id="changes">
              <h2>14. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. If we make material changes, we will notify you by updating the effective date at the top of this policy and, where required by law, by sending an email to the address associated with your account or by displaying a prominent notice on the Platform.
              </p>
              <p>
                Your continued use of the Platform after the effective date of any changes constitutes acceptance of the updated Privacy Policy.
              </p>
            </section>

            {/* 16. Contact */}
            <section id="contact">
              <h2>15. Contact Us</h2>
              <p>If you have questions, concerns, or requests regarding this Privacy Policy, please contact us:</p>
              <ul>
                <li><strong>Email:</strong> support@eventhubglobal.com</li>
                <li><strong>Mailing address:</strong> EventHub, LLC · Attn: Privacy · [Address] · Utah, USA</li>
              </ul>
              <p>
                For disputes not resolved through our support team, you may have the right to lodge a complaint with your local data protection authority.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
