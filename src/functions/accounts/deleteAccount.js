/**
 * deleteAccount
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// This function ensures that when an Account is deleted,
// any related Contacts are updated to remove the association,
// preventing orphaned records.
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // 1. Authenticate the request
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { accountId } = await req.json();

    if (!accountId) {
        return new Response(JSON.stringify({ error: 'accountId is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // 2. Find all contacts related to the account
        // Use asServiceRole to ensure we can modify contacts even if not directly assigned to the current user
        const relatedContacts = await base44.asServiceRole.entities.Contact.filter({
            account_id: accountId
        });

        console.log(`Found ${relatedContacts.length} contacts to update for account ${accountId}`);

        // 3. Update each contact to remove the account link
        const updatePromises = relatedContacts.map(contact => {
            console.log(`Updating contact ${contact.id}, setting account_id to null.`);
            // Only update the account_id field
            return base44.asServiceRole.entities.Contact.update(contact.id, { account_id: null });
        });

        await Promise.all(updatePromises);
        console.log(`Successfully updated ${relatedContacts.length} contacts.`);

        // 4. Delete the account itself
        await base44.asServiceRole.entities.Account.delete(accountId);
        console.log(`Successfully deleted account ${accountId}.`);

        return new Response(JSON.stringify({
            status: 'success',
            message: `Account ${accountId} and links from ${relatedContacts.length} contacts were deleted successfully.`
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error(`Error deleting account ${accountId}:`, error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message || 'An unexpected error occurred during account deletion.'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default deleteAccount;
