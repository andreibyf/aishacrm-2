import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function TermsConditions() {
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
        <FileText className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Terms & Conditions</h1>
          <p className="text-slate-600 mt-1">Ai-SHA CRM Platform - 4V Data Consulting LLC</p>
        </div>
      </div>

      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle>Terms of Service Agreement</CardTitle>
          <p className="text-sm text-slate-500">Last updated: January 1, 2025</p>
        </CardHeader>
        <CardContent className="prose prose-slate max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-slate-700 leading-relaxed">
              By accessing and using the Ai-SHA® CRM platform ("Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Description of Service</h2>
            <p className="text-slate-700 leading-relaxed">
              Ai-SHA® (Ai-Super Hi-performing Assistant) is a comprehensive Customer Relationship Management (CRM) platform provided by 4V Data Consulting LLC. The Service includes contact management, lead tracking, opportunity management, reporting tools, and AI-powered business intelligence features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. User Accounts and Security</h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              Users are responsible for maintaining the confidentiality of their account credentials and for all activities that occur under their account. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700">
              <li>Provide accurate and complete information when creating your account</li>
              <li>Maintain the security of your login credentials</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
              <li>Be responsible for all activities under your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Data Privacy and Security</h2>
            <p className="text-slate-700 leading-relaxed">
              We take data privacy seriously and implement industry-standard security measures to protect your data. Your customer data remains your property, and we will not access, use, or share it except as necessary to provide the Service or as required by law. For detailed information about our data practices, please refer to our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Acceptable Use Policy</h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700">
              <li>Upload, store, or transmit any unlawful, harmful, or objectionable content</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Use the Service for any commercial purpose other than your intended business use</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Intellectual Property Rights</h2>
            <p className="text-slate-700 leading-relaxed">
              Ai-SHA® is a registered trademark of 4V Data Consulting LLC. All content, features, and functionality of the Service are owned by 4V Data Consulting LLC and are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Payment Terms</h2>
            <p className="text-slate-700 leading-relaxed">
              Subscription fees are billed in advance and are non-refundable. We reserve the right to change our pricing with 30 days written notice. Failure to pay may result in suspension or termination of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Service Availability</h2>
            <p className="text-slate-700 leading-relaxed">
              While we strive to maintain high availability, we do not guarantee that the Service will be available 100% of the time. We may perform maintenance that temporarily interrupts service, and we will provide advance notice when possible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Limitation of Liability</h2>
            <p className="text-slate-700 leading-relaxed">
              In no event shall 4V Data Consulting LLC be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Termination</h2>
            <p className="text-slate-700 leading-relaxed">
              Either party may terminate this agreement at any time. Upon termination, your access to the Service will be discontinued, and you may request an export of your data within 30 days of termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Changes to Terms</h2>
            <p className="text-slate-700 leading-relaxed">
              We reserve the right to modify these terms at any time. We will provide notice of significant changes and continued use of the Service constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">12. Contact Information</h2>
            <p className="text-slate-700 leading-relaxed">
              For questions about these Terms & Conditions, please contact 4V Data Consulting LLC at support@4vdataconsulting.com.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}