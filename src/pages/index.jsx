import Layout from "./Layout.jsx";
import { useEffect } from 'react';

import Dashboard from "./Dashboard";

import Contacts from "./Contacts";

import Accounts from "./Accounts";

import Opportunities from "./Opportunities";

import Activities from "./Activities";

import Settings from "./Settings";

import Reports from "./Reports";

import Documentation from "./Documentation";

import TermsConditions from "./TermsConditions";

import PrivacyPolicy from "./PrivacyPolicy";

import Tenants from "./Tenants";

import Employees from "./Employees";

import TenantDataDebug from "./TenantDataDebug";

import Integrations from "./Integrations";

import AuditLog from "./AuditLog";

import Leads from "./Leads";

import AICampaigns from "./AICampaigns";

import DocumentProcessing from "./DocumentProcessing";

import CashFlow from "./CashFlow";

import PaymentPortal from "./PaymentPortal";

import DocumentManagement from "./DocumentManagement";

import Agent from "./Agent";

import Calendar from "./Calendar";

import DuplicateContacts from "./DuplicateContacts";

import Utilities from "./Utilities";

import DuplicateAccounts from "./DuplicateAccounts";

import DataQualityReport from "./DataQualityReport";

import DataDiagnostics from "./DataDiagnostics";

import UnitTests from "./UnitTests";

import BizDevSources from "./BizDevSources";

import WorkflowGuide from "./WorkflowGuide";

import ClientOnboarding from "./ClientOnboarding";

import ClientRequirements from "./ClientRequirements";

import SystemLogs from "./SystemLogs";

import Workflows from "./Workflows";

import ResetPassword from "./ResetPassword";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    Contacts: Contacts,
    
    Accounts: Accounts,
    
    Opportunities: Opportunities,
    
    Activities: Activities,
    
    Settings: Settings,
    
    Reports: Reports,
    
    Documentation: Documentation,
    
    TermsConditions: TermsConditions,
    
    PrivacyPolicy: PrivacyPolicy,
    
    Tenants: Tenants,
    
    Employees: Employees,
    
    TenantDataDebug: TenantDataDebug,
    
    Integrations: Integrations,
    
    AuditLog: AuditLog,
    
    Leads: Leads,
    
    AICampaigns: AICampaigns,
    
    DocumentProcessing: DocumentProcessing,
    
    CashFlow: CashFlow,
    
    PaymentPortal: PaymentPortal,
    
    DocumentManagement: DocumentManagement,
    
    Agent: Agent,
    
    Calendar: Calendar,
    
    DuplicateContacts: DuplicateContacts,
    
    Utilities: Utilities,
    
    DuplicateAccounts: DuplicateAccounts,
    
    DataQualityReport: DataQualityReport,
    
    DataDiagnostics: DataDiagnostics,
    
    UnitTests: UnitTests,
    
    BizDevSources: BizDevSources,
    
    WorkflowGuide: WorkflowGuide,
    
    ClientOnboarding: ClientOnboarding,
    
    ClientRequirements: ClientRequirements,
    
    SystemLogs: SystemLogs,
    
    Workflows: Workflows,
    
}

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

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    // Force re-render when location changes
    useEffect(() => {
        console.log('[PagesContent] Route changed to:', location.pathname);
    }, [location.pathname]);
    
    // Check if this is the reset password route (no Layout needed)
    if (location.pathname === '/reset-password') {
        return <ResetPassword />;
    }
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes location={location}>            
                
                    <Route path="/" element={<Dashboard />} />
                
                
                <Route path="/reset-password" element={<ResetPassword />} />
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Contacts" element={<Contacts />} />
                
                <Route path="/Accounts" element={<Accounts />} />
                
                <Route path="/Opportunities" element={<Opportunities />} />
                
                <Route path="/Activities" element={<Activities />} />
                
                <Route path="/Settings" element={<Settings />} />
                
                <Route path="/Reports" element={<Reports />} />
                
                <Route path="/Documentation" element={<Documentation />} />
                
                <Route path="/TermsConditions" element={<TermsConditions />} />
                
                <Route path="/PrivacyPolicy" element={<PrivacyPolicy />} />
                
                <Route path="/Tenants" element={<Tenants />} />
                
                <Route path="/Employees" element={<Employees />} />
                
                <Route path="/TenantDataDebug" element={<TenantDataDebug />} />
                
                <Route path="/Integrations" element={<Integrations />} />
                
                <Route path="/AuditLog" element={<AuditLog />} />
                
                <Route path="/Leads" element={<Leads />} />
                
                <Route path="/AICampaigns" element={<AICampaigns />} />
                
                <Route path="/DocumentProcessing" element={<DocumentProcessing />} />
                
                <Route path="/CashFlow" element={<CashFlow />} />
                
                <Route path="/PaymentPortal" element={<PaymentPortal />} />
                
                <Route path="/DocumentManagement" element={<DocumentManagement />} />
                
                <Route path="/Agent" element={<Agent />} />
                
                <Route path="/Calendar" element={<Calendar />} />
                
                <Route path="/DuplicateContacts" element={<DuplicateContacts />} />
                
                <Route path="/Utilities" element={<Utilities />} />
                
                <Route path="/DuplicateAccounts" element={<DuplicateAccounts />} />
                
                <Route path="/DataQualityReport" element={<DataQualityReport />} />
                
                <Route path="/DataDiagnostics" element={<DataDiagnostics />} />
                
                <Route path="/UnitTests" element={<UnitTests />} />
                
                <Route path="/BizDevSources" element={<BizDevSources />} />
                
                <Route path="/WorkflowGuide" element={<WorkflowGuide />} />
                
                <Route path="/ClientOnboarding" element={<ClientOnboarding />} />
                
                <Route path="/ClientRequirements" element={<ClientRequirements />} />
                
                <Route path="/SystemLogs" element={<SystemLogs />} />
                
                <Route path="/Workflows" element={<Workflows />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}