import React from "react";
import { Link } from "react-router-dom";

export default function Support() {
  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary hover:underline">Art Flow Creative</Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Support</h1>
          <p className="mt-2 text-sm text-muted-foreground">Help with your Art Flow Creative account and business records.</p>
        </div>

        <div className="space-y-7 text-sm leading-7">
          <section>
            <h2 className="text-xl font-semibold mb-2">Getting help</h2>
            <p>
              If you have trouble signing in, syncing marketplace sales, importing business expenses, managing inventory, or viewing reports, use the support contact listed for Art Flow Creative in the App Store or contact the app owner through your account support channel.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Sales and order syncing</h2>
            <p>
              Marketplace imports can take time to appear. If an order is missing, first refresh the Orders page. If the problem continues, include the marketplace name, approximate sale date, and order or transaction ID in your support request. Do not include passwords or payment-card information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Expenses</h2>
            <p>
              Art Flow Creative can organize business expenses and imported receipts. Review imported amounts and categories before relying on reports or tax estimates. Tax calculations in the app are organizational estimates and are not tax or accounting advice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Account and data deletion</h2>
            <p>
              Signed-in users can request account deletion from the Account screen. If you cannot access your account, use the App Store support contact and include the email address associated with the account so the request can be verified.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Privacy</h2>
            <p>
              For information about account data, Gmail-based importing, retention, and deletion, review the Privacy Policy below.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-border pt-6 flex flex-wrap gap-4 text-sm">
          <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/terms-of-service" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/login" className="text-primary hover:underline">Return to login</Link>
        </div>
      </div>
    </main>
  );
}
