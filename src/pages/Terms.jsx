import React from "react";
import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-10 sm:py-14">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary hover:underline">
            Back to Art Flow Creative
          </Link>
        </div>

        <article className="bg-card border border-border rounded-3xl p-6 sm:p-10 shadow-sm space-y-7">
          <header>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-sm text-muted-foreground mt-2">Effective August 29, 2026</p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Agreement to these terms</h2>
            <p className="text-muted-foreground leading-7">
              These Terms of Service govern your use of Art Flow Creative, including its website,
              mobile or web application, features, integrations, and related services. By creating
              an account or using Art Flow Creative, you agree to these terms. If you do not agree,
              do not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. What Art Flow Creative provides</h2>
            <p className="text-muted-foreground leading-7">
              Art Flow Creative provides tools intended to help users organize and manage business
              information such as sales, orders, expenses, inventory, reports, schedules, mileage,
              and related records. Features may change, be added, or be removed over time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Your account</h2>
            <p className="text-muted-foreground leading-7">
              You are responsible for providing accurate account information, protecting your login
              credentials, and all activity that occurs through your account. You must notify us if
              you believe your account has been accessed without authorization.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Your data</h2>
            <p className="text-muted-foreground leading-7">
              You retain ownership of the business information, content, and records you submit to
              Art Flow Creative. You give Art Flow Creative permission to process that information
              only as reasonably necessary to provide, maintain, secure, and improve the service.
              You are responsible for making sure you have the right to upload and use the data you
              provide.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Third-party services</h2>
            <p className="text-muted-foreground leading-7">
              Art Flow Creative may connect with third-party services such as Google Sheets, Gmail,
              Google Calendar, and other platforms you choose to authorize. Those services are
              governed by their own terms and privacy practices. You may disconnect supported
              integrations when the app provides that option.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Acceptable use</h2>
            <p className="text-muted-foreground leading-7">
              You may not use Art Flow Creative to violate applicable law, infringe the rights of
              others, distribute malicious software, attempt unauthorized access, interfere with
              the service, or misuse another person's account or data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Financial and tax information</h2>
            <p className="text-muted-foreground leading-7">
              Calculations, summaries, estimates, reports, and business insights provided by Art
              Flow Creative are organizational tools and are not legal, tax, accounting, or
              financial advice. You are responsible for reviewing your records and consulting a
              qualified professional when appropriate.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Availability and changes</h2>
            <p className="text-muted-foreground leading-7">
              We work to keep Art Flow Creative available and reliable, but uninterrupted or
              error-free service is not guaranteed. We may update, suspend, or discontinue features
              when reasonably necessary for maintenance, security, legal compliance, or product
              changes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Disclaimer</h2>
            <p className="text-muted-foreground leading-7">
              To the extent permitted by law, Art Flow Creative is provided on an “as is” and “as
              available” basis without warranties of any kind, whether express or implied.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Limitation of liability</h2>
            <p className="text-muted-foreground leading-7">
              To the extent permitted by law, Art Flow Creative and its operators will not be liable
              for indirect, incidental, special, consequential, or punitive damages, or for loss of
              profits, revenue, data, or business opportunities arising from use of the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Termination</h2>
            <p className="text-muted-foreground leading-7">
              You may stop using Art Flow Creative at any time. We may restrict or terminate access
              when reasonably necessary because of a serious or repeated violation of these terms,
              unlawful activity, security risk, or misuse of the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Changes to these terms</h2>
            <p className="text-muted-foreground leading-7">
              These terms may be updated from time to time. When material changes are made, the
              effective date above will be updated and additional notice may be provided when
              appropriate. Continued use after the updated terms take effect means you accept the
              revised terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">13. Contact</h2>
            <p className="text-muted-foreground leading-7">
              Questions about these Terms of Service can be submitted through the contact or support
              method provided within Art Flow Creative.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
