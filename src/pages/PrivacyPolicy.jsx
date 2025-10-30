import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PrivacyPolicy() {
  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to={createPageUrl("Dashboard")}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="text-slate-600 mt-1">
            Ai-SHA CRM Platform - 4V Data Consulting LLC
          </p>
        </div>
      </div>

      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
          <p className="text-sm text-slate-500">
            Last updated: January 1, 2025
          </p>
        </CardHeader>
        <CardContent className="prose prose-slate max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              1. Introduction
            </h2>
            <p className="text-slate-700 leading-relaxed">
              4V Data Consulting LLC (&quot;we,&quot; &quot;our,&quot; or
              &quot;us&quot;) operates the Ai-SHA® CRM platform. This Privacy
              Policy explains how we collect, use, disclose, and safeguard your
              information when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              2. Information We Collect
            </h2>
            <h3 className="text-lg font-medium text-slate-800 mb-2">
              Personal Information
            </h3>
            <p className="text-slate-700 leading-relaxed mb-3">
              We collect information you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700">
              <li>
                Account information (name, email address, company details)
              </li>
              <li>Profile information and preferences</li>
              <li>Customer and lead data you input into the CRM</li>
              <li>Communications with our support team</li>
            </ul>

            <h3 className="text-lg font-medium text-slate-800 mb-2 mt-4">
              Usage Information
            </h3>
            <p className="text-slate-700 leading-relaxed mb-3">
              We automatically collect certain information when you use our
              Service:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700">
              <li>Log information (IP address, browser type, access times)</li>
              <li>Usage patterns and feature interaction data</li>
              <li>Device information and operating system details</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              3. How We Use Your Information
            </h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700">
              <li>Provide, maintain, and improve our CRM services</li>
              <li>Process transactions and send related information</li>
              <li>Send technical notices, updates, and support messages</li>
              <li>
                Respond to your comments, questions, and customer service
                requests
              </li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>Detect, investigate, and prevent fraudulent transactions</li>
              <li>Comply with legal obligations and protect our rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              4. Information Sharing and Disclosure
            </h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              We do not sell, trade, or rent your personal information to third
              parties. We may share your information only in the following
              circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations or court orders</li>
              <li>
                To protect our rights, property, or safety, or that of others
              </li>
              <li>
                With service providers who assist in our operations (under
                strict confidentiality agreements)
              </li>
              <li>
                In connection with a merger, acquisition, or sale of assets
                (with prior notice)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              5. Data Security
            </h2>
            <p className="text-slate-700 leading-relaxed">
              We implement appropriate technical and organizational security
              measures to protect your personal information against unauthorized
              access, alteration, disclosure, or destruction. These measures
              include encryption, secure data transmission, regular security
              assessments, and employee training on data protection practices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              6. Data Retention
            </h2>
            <p className="text-slate-700 leading-relaxed">
              We retain your personal information for as long as your account is
              active or as needed to provide you services. We will also retain
              and use your information as necessary to comply with legal
              obligations, resolve disputes, and enforce our agreements. Upon
              account termination, we will delete or anonymize your data within
              a reasonable timeframe, unless retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              7. Your Privacy Rights
            </h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              Depending on your location, you may have the following rights
              regarding your personal information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700">
              <li>
                Access: Request a copy of the personal information we hold about
                you
              </li>
              <li>
                Correction: Request correction of inaccurate or incomplete
                information
              </li>
              <li>Deletion: Request deletion of your personal information</li>
              <li>
                Portability: Request transfer of your data to another service
                provider
              </li>
              <li>
                Objection: Object to certain processing of your personal
                information
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              8. Cookies and Tracking Technologies
            </h2>
            <p className="text-slate-700 leading-relaxed">
              We use cookies and similar technologies to enhance your
              experience, understand usage patterns, and improve our services.
              You can control cookie settings through your browser preferences,
              though disabling cookies may affect some functionality of our
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              9. Third-Party Integrations
            </h2>
            <p className="text-slate-700 leading-relaxed">
              Our Service may integrate with third-party applications and
              services (such as email providers, calendar systems, or analytics
              tools). These integrations are governed by the privacy policies of
              those third parties. We encourage you to review their privacy
              practices before connecting these services to your Ai-SHA account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              10. International Data Transfers
            </h2>
            <p className="text-slate-700 leading-relaxed">
              Your information may be transferred to and processed in countries
              other than your country of residence. We ensure that such
              transfers comply with applicable data protection laws and
              implement appropriate safeguards to protect your personal
              information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              11. Children&apos;s Privacy
            </h2>
            <p className="text-slate-700 leading-relaxed">
              Our Service is not intended for individuals under the age of 18.
              We do not knowingly collect personal information from children
              under 18. If you become aware that a child has provided us with
              personal information, please contact us, and we will take steps to
              delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              12. Changes to This Privacy Policy
            </h2>
            <p className="text-slate-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new Privacy
              Policy on this page and updating the &quot;Last updated&quot;
              date. We encourage you to review this Privacy Policy periodically
              for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              13. Contact Us
            </h2>
            <p className="text-slate-700 leading-relaxed">
              If you have any questions about this Privacy Policy or our privacy
              practices, please contact us at:
            </p>
            <div className="bg-slate-50 p-4 rounded-lg mt-3">
              <p className="text-slate-700">
                <strong>4V Data Consulting LLC</strong>
                <br />
                Email: privacy@4vdataconsulting.com<br />
                Subject: Ai-SHA Privacy Policy Inquiry
              </p>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
