import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

import AuthResetPage from './AuthReset.jsx';
import Layout from './Layout.jsx';

const PAGES = {
    Dashboard: lazy(() => import('./Dashboard')),
    Contacts: lazy(() => import('./Contacts')),
    Accounts: lazy(() => import('./Accounts')),
    Opportunities: lazy(() => import('./Opportunities')),
    Activities: lazy(() => import('./Activities')),
    Settings: lazy(() => import('./Settings')),
    Reports: lazy(() => import('./Reports')),
    Documentation: lazy(() => import('./Documentation')),
    TermsConditions: lazy(() => import('./TermsConditions')),
    PrivacyPolicy: lazy(() => import('./PrivacyPolicy')),
    Tenants: lazy(() => import('./Tenants')),
    Employees: lazy(() => import('./Employees')),
    TenantDataDebug: lazy(() => import('./TenantDataDebug')),
    Integrations: lazy(() => import('./Integrations')),
    AuditLog: lazy(() => import('./AuditLog')),
    Leads: lazy(() => import('./Leads')),
    AICampaigns: lazy(() => import('./AICampaigns')),
    DocumentProcessing: lazy(() => import('./DocumentProcessing')),
    CashFlow: lazy(() => import('./CashFlow')),
    PaymentPortal: lazy(() => import('./PaymentPortal')),
    DocumentManagement: lazy(() => import('./DocumentManagement')),
    Agent: lazy(() => import('./Agent')),
    Calendar: lazy(() => import('./Calendar')),
    DuplicateContacts: lazy(() => import('./DuplicateContacts')),
    Utilities: lazy(() => import('./Utilities')),
    DuplicateAccounts: lazy(() => import('./DuplicateAccounts')),
    DataQualityReport: lazy(() => import('./DataQualityReport')),
    DataDiagnostics: lazy(() => import('./DataDiagnostics')),
    UnitTests: lazy(() => import('./UnitTests')),
    BizDevSources: lazy(() => import('./BizDevSources')),
    ClientOnboarding: lazy(() => import('./ClientOnboarding')),
    ClientRequirements: lazy(() => import('./ClientRequirements')),
    SystemLogs: lazy(() => import('./SystemLogs')),
};

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }
    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    // Public routes that don't require Layout/authentication
    return (
        <Suspense fallback={<div style={{padding:'2rem',textAlign:'center'}}>Loading...</div>}>
            <Routes>
                {/* Public route - password reset (no Layout wrapper) */}
                <Route path="/auth/reset" element={<AuthResetPage />} />

                {/* All other routes wrapped in Layout (requires authentication) */}
                <Route path="/*" element={
                    <Layout currentPageName={currentPage}>
                        <Routes>
                            <Route path="/" element={<PAGES.Dashboard />} />
                            <Route path="/Dashboard" element={<PAGES.Dashboard />} />
                            <Route path="/Contacts" element={<PAGES.Contacts />} />
                            <Route path="/Accounts" element={<PAGES.Accounts />} />
                            <Route path="/Opportunities" element={<PAGES.Opportunities />} />
                            <Route path="/Activities" element={<PAGES.Activities />} />
                            <Route path="/Settings" element={<PAGES.Settings />} />
                            <Route path="/Reports" element={<PAGES.Reports />} />
                            <Route path="/Documentation" element={<PAGES.Documentation />} />
                            <Route path="/TermsConditions" element={<PAGES.TermsConditions />} />
                            <Route path="/PrivacyPolicy" element={<PAGES.PrivacyPolicy />} />
                            <Route path="/Tenants" element={<PAGES.Tenants />} />
                            <Route path="/Employees" element={<PAGES.Employees />} />
                            <Route path="/TenantDataDebug" element={<PAGES.TenantDataDebug />} />
                            <Route path="/Integrations" element={<PAGES.Integrations />} />
                            <Route path="/AuditLog" element={<PAGES.AuditLog />} />
                            <Route path="/Leads" element={<PAGES.Leads />} />
                            <Route path="/AICampaigns" element={<PAGES.AICampaigns />} />
                            <Route path="/DocumentProcessing" element={<PAGES.DocumentProcessing />} />
                            <Route path="/CashFlow" element={<PAGES.CashFlow />} />
                            <Route path="/PaymentPortal" element={<PAGES.PaymentPortal />} />
                            <Route path="/DocumentManagement" element={<PAGES.DocumentManagement />} />
                            <Route path="/Agent" element={<PAGES.Agent />} />
                            <Route path="/Calendar" element={<PAGES.Calendar />} />
                            <Route path="/DuplicateContacts" element={<PAGES.DuplicateContacts />} />
                            <Route path="/Utilities" element={<PAGES.Utilities />} />
                            <Route path="/DuplicateAccounts" element={<PAGES.DuplicateAccounts />} />
                            <Route path="/DataQualityReport" element={<PAGES.DataQualityReport />} />
                            <Route path="/DataDiagnostics" element={<PAGES.DataDiagnostics />} />
                            <Route path="/UnitTests" element={<PAGES.UnitTests />} />
                            <Route path="/BizDevSources" element={<PAGES.BizDevSources />} />
                            <Route path="/ClientOnboarding" element={<PAGES.ClientOnboarding />} />
                            <Route path="/ClientRequirements" element={<PAGES.ClientRequirements />} />
                            <Route path="/SystemLogs" element={<PAGES.SystemLogs />} />
                        </Routes>
                    </Layout>
                } />
            </Routes>
        </Suspense>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}