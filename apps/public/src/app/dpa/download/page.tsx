'use client';

import Image from 'next/image';

export default function DpaDownloadPage() {
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Print button - hidden when printing */}
      <div className="sticky top-0 z-10 flex justify-end gap-3 border-gray-200 border-b bg-white px-8 py-3 print:hidden">
        <button
          className="rounded bg-black px-4 py-2 font-medium text-sm text-white hover:bg-gray-800"
          onClick={() => window.print()}
          type="button"
        >
          Download / Print PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-8 py-12 print:py-0">
        {/* Header */}
        <div className="mb-10 border-gray-300 border-b pb-8">
          <p className="mb-1 text-gray-500 text-xs uppercase tracking-widest">
            OpenPanel AB
          </p>
          <h1 className="mb-2 font-bold text-3xl">Data Processing Agreement</h1>
          <p className="text-gray-500 text-sm">
            Version 1.0 &middot; Last updated: March 3, 2026
          </p>
        </div>

        <p className="mb-8 text-gray-700 text-sm leading-relaxed">
          This Data Processing Agreement ("DPA") is entered into between
          OpenPanel AB ("OpenPanel", "Processor") and the customer identified in
          the signature block below ("Controller"). It applies where OpenPanel
          processes personal data on behalf of the Controller as part of the
          OpenPanel Cloud service, and forms part of the OpenPanel Terms of
          Service.
        </p>

        <Section number="1" title="Definitions">
          <ul className="list-none space-y-2 text-gray-700 text-sm">
            <li>
              <strong>GDPR</strong> means Regulation (EU) 2016/679 of the
              European Parliament and of the Council.
            </li>
            <li>
              <strong>Controller</strong> means the customer, who determines the
              purposes and means of processing.
            </li>
            <li>
              <strong>Processor</strong> means OpenPanel, who processes data on
              the Controller's behalf.
            </li>
            <li>
              <strong>Personal Data</strong>, <strong>Processing</strong>,{' '}
              <strong>Data Subject</strong>, and{' '}
              <strong>Supervisory Authority</strong> have the meanings given in
              the GDPR.
            </li>
            <li>
              <strong>Sub-processor</strong> means any third party engaged by
              OpenPanel to process Personal Data in connection with the service.
            </li>
          </ul>
        </Section>

        <Section number="2" title="Our approach to privacy">
          <p className="mb-3 text-gray-700 text-sm leading-relaxed">
            OpenPanel is built to minimize personal data collection by design.
            We do not use cookies for analytics tracking. We do not store IP
            addresses. Instead, we generate a daily-rotating anonymous
            identifier using a one-way hash of the visitor's IP address, user
            agent, and project ID combined with a salt that is replaced every 24
            hours. The raw IP address is discarded immediately and the
            identifier becomes irreversible once the salt is rotated.
          </p>
          <p className="mb-2 text-gray-700 text-sm">
            The data we store per event is:
          </p>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-gray-700 text-sm">
            <li>Page URL and referrer</li>
            <li>Browser name and version</li>
            <li>Operating system name and version</li>
            <li>Device type, brand, and model</li>
            <li>
              City, country, and region (derived from IP at the time of the
              request; IP is then discarded)
            </li>
            <li>Custom event properties the Controller chooses to send</li>
          </ul>
          <p className="mb-3 text-gray-700 text-sm">
            No persistent identifiers, no cookies, no cross-site tracking.
            Because of this approach, the analytics data OpenPanel collects in
            standard website tracking mode does not constitute personal data
            under GDPR Art. 4(1). We provide this DPA for Controllers who
            require it for their own compliance documentation and records of
            processing activities.
          </p>
          <p className="mb-1 text-gray-700 text-sm font-semibold">
            Session replay (optional feature)
          </p>
          <p className="text-gray-700 text-sm">
            OpenPanel optionally supports session replay, which must be
            explicitly enabled by the Controller. When enabled, session replay
            records DOM snapshots and user interactions (mouse movements, clicks,
            scrolls) using rrweb. All text content and form inputs are masked by
            default. The Controller is responsible for ensuring their use of
            session replay complies with applicable privacy law, including
            providing appropriate notice to end users.
          </p>
        </Section>

        <Section number="3" title="Scope and roles">
          <p className="text-gray-700 text-sm leading-relaxed">
            OpenPanel acts as a Processor when processing data on behalf of the
            Controller. The Controller is responsible for the analytics data
            collected from visitors to their websites and applications.
          </p>
        </Section>

        <Section number="4" title="Processor obligations">
          <p className="mb-2 text-gray-700 text-sm">
            OpenPanel commits to the following:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 text-sm">
            <li>
              Process Personal Data only on the Controller's documented
              instructions and for no other purpose.
            </li>
            <li>
              Ensure that all personnel with access to Personal Data are bound
              by appropriate confidentiality obligations.
            </li>
            <li>
              Implement and maintain technical and organizational measures in
              accordance with Section 7 of this DPA.
            </li>
            <li>
              Not engage a Sub-processor without prior general or specific
              written authorization and flow down equivalent data protection
              obligations to any Sub-processor.
            </li>
            <li>
              Assist the Controller, where reasonably possible, in responding to
              Data Subject requests to exercise their rights under GDPR.
            </li>
            <li>
              Notify the Controller without undue delay (and no later than 48
              hours) upon becoming aware of a Personal Data breach.
            </li>
            <li>
              Make available all information necessary to demonstrate compliance
              with this DPA and cooperate with audits conducted by the
              Controller or their designated auditor, subject to reasonable
              notice and confidentiality obligations.
            </li>
            <li>
              At the Controller's choice, delete or return all Personal Data
              upon termination of the service.
            </li>
          </ul>
        </Section>

        <Section number="5" title="Controller obligations">
          <p className="mb-2 text-gray-700 text-sm">
            The Controller confirms that:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 text-sm">
            <li>
              They have a lawful basis for the processing described in this DPA.
            </li>
            <li>
              They have provided appropriate privacy notices to their end users.
            </li>
            <li>
              They are responsible for the accuracy and lawfulness of the data
              they instruct OpenPanel to process.
            </li>
          </ul>
        </Section>

        <Section number="6" title="Sub-processors">
          <p className="mb-3 text-gray-700 text-sm">
            OpenPanel uses the following sub-processors to deliver the service:
          </p>
          <table className="mb-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border border-gray-300 bg-gray-50">
                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                  Sub-processor
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                  Purpose
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                  Location
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 px-3 py-2">
                  Hetzner Online GmbH
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  Cloud infrastructure and data storage
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  Germany (EU)
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 px-3 py-2">
                  Cloudflare R2
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  Backup storage
                </td>
                <td className="border border-gray-300 px-3 py-2">EU</td>
              </tr>
            </tbody>
          </table>
          <p className="text-gray-700 text-sm">
            OpenPanel will inform the Controller of any intended changes to this
            list with reasonable notice, giving the Controller the opportunity
            to object.
          </p>
        </Section>

        <Section number="7" title="Technical and organizational measures">
          <div className="space-y-4 text-gray-700 text-sm">
            <div>
              <p className="mb-1 font-semibold">
                Data minimization and anonymization
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  IP addresses are never stored. They are used only to derive
                  geolocation and generate an anonymous daily identifier, then
                  discarded.
                </li>
                <li>
                  Daily-rotating cryptographic salts ensure visitor identifiers
                  cannot be reversed or linked to individuals after 24 hours.
                </li>
                <li>
                  No cookies or persistent cross-device identifiers are used.
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold">Access control</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Dashboard access is protected by authentication and role-based
                  access control.
                </li>
                <li>
                  Production systems are accessible only to authorized
                  personnel.
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold">
                Encryption and transport security
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>All data is transmitted over HTTPS (TLS).</li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold">
                Infrastructure and availability
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  All data is hosted on Hetzner servers located in Germany
                  within the EU.
                </li>
                <li>Regular backups are performed.</li>
                <li>
                  No data leaves the EEA in the course of normal operations.
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold">Incident response</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  We maintain procedures for detecting, reporting, and
                  investigating Personal Data breaches.
                </li>
                <li>
                  In the event of a breach affecting the Controller's data, we
                  will notify them within 48 hours of becoming aware.
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold">Open source</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  The OpenPanel codebase is publicly available on GitHub,
                  allowing independent review of our data handling practices.
                </li>
              </ul>
            </div>
          </div>
        </Section>

        <Section number="8" title="International data transfers">
          <p className="text-gray-700 text-sm leading-relaxed">
            OpenPanel stores and processes all analytics data on Hetzner
            infrastructure located in Germany. No Personal Data is transferred
            to countries outside the EEA in the course of delivering the
            service.
          </p>
        </Section>

        <Section number="9" title="Data retention and deletion">
          <ul className="list-disc space-y-1 pl-5 text-gray-700 text-sm">
            <li>
              <strong>Analytics events</strong> are retained for as long as the
              Controller's account is active. No maximum retention period is
              currently enforced. If a retention limit is introduced in the
              future, all customers will be notified in advance.
            </li>
            <li>
              <strong>Session replays</strong> are retained for 30 days and then
              permanently deleted.
            </li>
            <li>
              The Controller can delete individual projects, all associated data,
              or their entire account at any time from within the dashboard. Upon
              account termination, OpenPanel will delete the Controller's data
              within 30 days unless required by law to retain it longer.
            </li>
          </ul>
        </Section>

        <Section number="10" title="Governing law">
          <p className="text-gray-700 text-sm leading-relaxed">
            This DPA is governed by the laws of Sweden and is interpreted in
            accordance with the GDPR.
          </p>
        </Section>

        {/* Exhibit A */}
        <div className="mb-8 border-black border-t-2 pt-8">
          <p className="mb-1 text-gray-500 text-xs uppercase tracking-widest">
            Annex
          </p>
          <h2 className="mb-4 font-bold text-xl">
            Exhibit A: Description of Processing
          </h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <Row
                label="Nature of processing"
                value="Collection and storage of anonymized website analytics events (page views, custom events, session data). Optionally: session replay recording of DOM snapshots and user interactions."
              />
              <Row
                label="Purpose of processing"
                value="To provide the Controller with website and product analytics via the OpenPanel Cloud dashboard. Session replay (if enabled) is used to allow the Controller to review user sessions for UX and debugging purposes."
              />
              <Row
                label="Duration of processing"
                value="Analytics events: retained for the duration of the active account (no current maximum). Session replays: 30 days, then permanently deleted. All data deleted within 30 days of account termination."
              />
              <Row
                label="Categories of data subjects"
                value="Visitors to the Controller's websites and applications"
              />
              <Row
                label="Categories of personal data"
                value="Anonymized session identifiers (non-reversible after 24 hours), page URLs, referrers, browser type and version, operating system, device type, city-level geolocation (country, region, city). No IP addresses, no cookies, no names, no email addresses. If session replay is enabled: DOM snapshots and interaction recordings, which may incidentally contain personal data visible on the Controller's pages. All text content and form inputs are masked by default."
              />
              <Row
                label="Special categories of data"
                value="None intended. The Controller is responsible for ensuring no special category data is captured via session replay."
              />
              <Row
                label="Sub-processors"
                value="Hetzner Online GmbH (Germany) — cloud infrastructure; Cloudflare R2 (EU) — backup storage"
              />
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="border-black border-t-2 pt-8">
          <p className="mb-1 text-gray-500 text-xs uppercase tracking-widest">
            Execution
          </p>
          <h2 className="mb-6 font-bold text-xl">Signatures</h2>

          <div className="grid grid-cols-2 gap-12">
            {/* Processor - pre-signed */}
            <div>
              <div className="col h-32 gap-2">
                <p className="font-semibold text-gray-500 text-xs uppercase tracking-widest">
                  Processor
                </p>
                <p className="font-semibold text-sm">OpenPanel AB</p>
                <p className="text-gray-500 text-xs">
                  Sankt Eriksgatan 100, 113 31 Stockholm, Sweden
                </p>
              </div>
              <SignatureLine
                label="Signature"
                value={
                  <Image
                    alt="Carl-Gerhard Lindesvärd signature"
                    className="relative top-4 h-16 w-auto object-contain object-left"
                    height={64}
                    src="/signature.png"
                    width={200}
                  />
                }
              />
              <SignatureLine label="Name" value="Carl-Gerhard Lindesvärd" />
              <SignatureLine label="Title" value="Founder" />
              <SignatureLine label="Date" value="March 3, 2026" />
            </div>

            {/* Controller - blank */}
            <div>
              <div className="flex flex-col h-32 gap-2">
                <p className="font-semibold text-gray-500 text-xs uppercase tracking-widest">
                  Controller
                </p>
              </div>
              <SignatureLine label="Company" value="" />
              <SignatureLine label="Signature" value="" />
              <SignatureLine label="Name" value="" />
              <SignatureLine label="Title" value="" />
              <SignatureLine label="Date" value="" />
            </div>
          </div>
        </div>

        <div className="mt-12 border-gray-200 border-t pt-6 text-center text-gray-400 text-xs print:mt-4">
          OpenPanel AB &middot; hello@openpanel.dev &middot; openpanel.dev/dpa
        </div>
      </div>
    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 font-bold text-base">
        {number}. {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border border-gray-300">
      <td className="w-48 border border-gray-300 bg-gray-50 px-3 py-2 align-top font-semibold text-xs">
        {label}
      </td>
      <td className="border border-gray-300 px-3 py-2 text-xs leading-relaxed">
        {value}
      </td>
    </tr>
  );
}

function SignatureLine({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <p className="text-gray-500 text-xs">{label}</p>
      <div className="mt-1 flex h-7 items-end border-gray-400 border-b font-mono">
        {value}
      </div>
    </div>
  );
}
