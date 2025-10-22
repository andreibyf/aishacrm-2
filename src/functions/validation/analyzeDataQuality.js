/**
 * analyzeDataQuality
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { tenant_id } = await req.json();

        // Use provided tenant_id or fall back to user's tenant
        const targetTenantId = tenant_id || user.tenant_id;

        if (!targetTenantId && user.role !== 'superadmin') {
            return Response.json({ 
                success: false, 
                error: 'No tenant specified' 
            }, { status: 400 });
        }

        // Helper to validate name characters
        const hasInvalidNameChars = (name) => {
            if (!name || typeof name !== 'string') return false;
            // Allow letters, spaces, hyphens, apostrophes, and common accented characters
            const validNamePattern = /^[a-zA-Z\s\-'àáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ∂ð]+$/;
            return !validNamePattern.test(name);
        };

        // Helper to validate email format
        const isValidEmail = (email) => {
            if (!email || typeof email !== 'string') return false;
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailPattern.test(email);
        };

        // Analyze Contacts
        const analyzeContacts = async () => {
            const contacts = targetTenantId 
                ? await base44.asServiceRole.entities.Contact.filter({ tenant_id: targetTenantId })
                : await base44.asServiceRole.entities.Contact.list();

            const issues = {
                missing_first_name: 0,
                missing_last_name: 0,
                invalid_name_characters: 0,
                invalid_email: 0,
                missing_contact_info: 0
            };

            let recordsWithIssues = 0;

            for (const contact of contacts) {
                let hasIssue = false;

                // Check missing first name
                if (!contact.first_name || contact.first_name.trim() === '') {
                    issues.missing_first_name += 1;
                    hasIssue = true;
                }

                // Check missing last name
                if (!contact.last_name || contact.last_name.trim() === '') {
                    issues.missing_last_name += 1;
                    hasIssue = true;
                }

                // Check invalid characters in names
                if (hasInvalidNameChars(contact.first_name) || hasInvalidNameChars(contact.last_name)) {
                    issues.invalid_name_characters += 1;
                    hasIssue = true;
                }

                // Check invalid email
                if (contact.email && !isValidEmail(contact.email)) {
                    issues.invalid_email += 1;
                    hasIssue = true;
                }

                // Check missing both phone and email
                const hasPhone = contact.phone && contact.phone.trim() !== '';
                const hasEmail = contact.email && contact.email.trim() !== '';
                if (!hasPhone && !hasEmail) {
                    issues.missing_contact_info += 1;
                    hasIssue = true;
                }

                if (hasIssue) recordsWithIssues += 1;
            }

            return {
                total_records: contacts.length,
                records_with_issues: recordsWithIssues,
                issues_percentage: contacts.length > 0 ? (recordsWithIssues / contacts.length) * 100 : 0,
                issues
            };
        };

        // Analyze Accounts
        const analyzeAccounts = async () => {
            const accounts = targetTenantId 
                ? await base44.asServiceRole.entities.Account.filter({ tenant_id: targetTenantId })
                : await base44.asServiceRole.entities.Account.list();

            const issues = {
                missing_first_name: 0, // N/A for accounts
                missing_last_name: 0, // N/A for accounts
                invalid_name_characters: 0,
                invalid_email: 0,
                missing_contact_info: 0
            };

            let recordsWithIssues = 0;

            for (const account of accounts) {
                let hasIssue = false;

                // Check invalid characters in account name
                if (hasInvalidNameChars(account.name)) {
                    issues.invalid_name_characters += 1;
                    hasIssue = true;
                }

                // Check invalid email
                if (account.email && !isValidEmail(account.email)) {
                    issues.invalid_email += 1;
                    hasIssue = true;
                }

                // Check missing both phone and email
                const hasPhone = account.phone && account.phone.trim() !== '';
                const hasEmail = account.email && account.email.trim() !== '';
                if (!hasPhone && !hasEmail) {
                    issues.missing_contact_info += 1;
                    hasIssue = true;
                }

                if (hasIssue) recordsWithIssues += 1;
            }

            return {
                total_records: accounts.length,
                records_with_issues: recordsWithIssues,
                issues_percentage: accounts.length > 0 ? (recordsWithIssues / accounts.length) * 100 : 0,
                issues
            };
        };

        // Analyze Leads
        const analyzeLeads = async () => {
            const leads = targetTenantId 
                ? await base44.asServiceRole.entities.Lead.filter({ tenant_id: targetTenantId })
                : await base44.asServiceRole.entities.Lead.list();

            const issues = {
                missing_first_name: 0,
                missing_last_name: 0,
                invalid_name_characters: 0,
                invalid_email: 0,
                missing_contact_info: 0
            };

            let recordsWithIssues = 0;

            for (const lead of leads) {
                let hasIssue = false;

                // Check missing first name
                if (!lead.first_name || lead.first_name.trim() === '') {
                    issues.missing_first_name += 1;
                    hasIssue = true;
                }

                // Check missing last name
                if (!lead.last_name || lead.last_name.trim() === '') {
                    issues.missing_last_name += 1;
                    hasIssue = true;
                }

                // Check invalid characters in names
                if (hasInvalidNameChars(lead.first_name) || hasInvalidNameChars(lead.last_name)) {
                    issues.invalid_name_characters += 1;
                    hasIssue = true;
                }

                // Check invalid email
                if (lead.email && !isValidEmail(lead.email)) {
                    issues.invalid_email += 1;
                    hasIssue = true;
                }

                // Check missing both phone and email
                const hasPhone = lead.phone && lead.phone.trim() !== '';
                const hasEmail = lead.email && lead.email.trim() !== '';
                if (!hasPhone && !hasEmail) {
                    issues.missing_contact_info += 1;
                    hasIssue = true;
                }

                if (hasIssue) recordsWithIssues += 1;
            }

            return {
                total_records: leads.length,
                records_with_issues: recordsWithIssues,
                issues_percentage: leads.length > 0 ? (recordsWithIssues / leads.length) * 100 : 0,
                issues
            };
        };

        // Run all analyses
        const [contactsReport, accountsReport, leadsReport] = await Promise.all([
            analyzeContacts(),
            analyzeAccounts(),
            analyzeLeads()
        ]);

        // Calculate overall statistics
        const totalRecords = contactsReport.total_records + accountsReport.total_records + leadsReport.total_records;
        const totalWithIssues = contactsReport.records_with_issues + accountsReport.records_with_issues + leadsReport.records_with_issues;
        const overallPercentage = totalRecords > 0 ? (totalWithIssues / totalRecords) * 100 : 0;

        return Response.json({
            success: true,
            report: {
                tenant_id: targetTenantId,
                generated_at: new Date().toISOString(),
                overall: {
                    total_records: totalRecords,
                    records_with_issues: totalWithIssues,
                    issues_percentage: overallPercentage
                },
                contacts: contactsReport,
                accounts: accountsReport,
                leads: leadsReport
            }
        });

    } catch (error) {
        console.error('Error analyzing data quality:', error);
        return Response.json({
            success: false,
            error: error.message || 'Failed to analyze data quality'
        }, { status: 500 });
    }
});

----------------------------

export default analyzeDataQuality;
