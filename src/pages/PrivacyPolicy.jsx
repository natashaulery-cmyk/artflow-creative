import React from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary hover:underline">Art Flow Creative</Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: August 30, 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-7">
          <section>
            <p>
              Art Flow Creative is a business-management application for artists and creative sellers. This Privacy Policy explains what information may be collected or processed when you use the application, including when you choose to connect Gmail for email-based importing or FLUF Connect for marketplace sales importing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Information we process</h2>
            <p>
              Depending on the features you use, Art Flow Creative may process account information such as your name and email address, business records you enter into the app, sales and order information, inventory, expenses, mileage, schedule information, and other business data you choose to store.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Google account data</h2>
            <p>
              If you enable Gmail-based importing, Art Flow Creative may request limited Gmail access needed to read relevant marketplace sale emails and expense emails you intentionally mark for importing. Google access is optional and is only used to provide the features you choose to enable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">FLUF Connect data</h2>
            <p>
              If you connect FLUF, Art Flow Creative uses the FLUF API token you provide to read order information from marketplaces linked to your FLUF account. The token is encrypted before storage and is not displayed again after connection. Art Flow imports only the order information needed for business tracking and does not intentionally store marketplace passwords or unnecessary shipping-address details from FLUF.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">How information is used</h2>
            <p>
              Information is used to provide and operate Art Flow Creative, synchronize connected services, calculate business totals, display reports, maintain inventory and expense records, improve reliability, and support the features you request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Sharing and sale of personal information</h2>
            <p>
              Art Flow Creative does not sell your personal information. Information may be processed by service providers that are necessary to operate the application, host data, authenticate users, or provide connected-service functionality. Your business records are not intentionally shared with other Art Flow Creative users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Data security and account separation</h2>
            <p>
              Art Flow Creative is designed so each signed-in user accesses their own account records. Reasonable technical safeguards are used to protect stored information, but no internet service can guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Disconnecting connected services</h2>
            <p>
              You may stop using a connected Google service by disconnecting it in the app when that option is available, or by removing Art Flow Creative access from your Google Account permissions. You may disconnect FLUF from the Art Flow Account page, and you may also revoke the FLUF API token from FLUF Developers. Disconnecting a service stops future access through that connection but may not automatically delete information already imported into your Art Flow Creative account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Data retention and deletion</h2>
            <p>
              Business records may be retained while your account remains active or as needed to provide the service. You may request deletion of your account or associated data by contacting the app owner through the support contact provided for Art Flow Creative.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Children</h2>
            <p>
              Art Flow Creative is intended for business use and is not directed to children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Changes to this policy</h2>
            <p>
              This policy may be updated as Art Flow Creative changes. The effective date above will be revised when material updates are made.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contact</h2>
            <p>
              For privacy questions or data requests, contact the Art Flow Creative app owner using the support contact associated with the application.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-border pt-6 flex flex-wrap gap-4 text-sm">
          <Link to="/support" className="text-primary hover:underline">Support</Link>
          <Link to="/terms-of-service" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/login" className="text-primary hover:underline">Return to login</Link>
        </div>
      </div>
    </main>
  );
}
