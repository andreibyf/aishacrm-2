/**
 * cleanupTestRecords
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

const entitiesToClean = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity', 'Note'];

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const user = await base44.auth.me();
    if (user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    try {
        const cleanupPromises = entitiesToClean.map(async (entityName) => {
            let recordsToDelete = [];
            
            // Method 1: Find records explicitly marked as test data
            const testFlaggedRecords = await base44.asServiceRole.entities[entityName].filter({
                is_test_data: true
            });
            recordsToDelete = recordsToDelete.concat(testFlaggedRecords);
            
            // Method 2: Find records that look like test data based on content
            if (entityName === 'Contact') {
                const testPatternContacts = await base44.asServiceRole.entities[entityName].filter({
                    $or: [
                        { first_name: { $regex: '^(Test|CRUD|Export)' } },
                        { last_name: { $regex: '^(Contact|Test|Lead)' } },
                        { email: { $regex: '(test|crud|export).*@(test|example)\\.' } }
                    ]
                });
                recordsToDelete = recordsToDelete.concat(testPatternContacts);
            }
            
            if (entityName === 'Account') {
                const testPatternAccounts = await base44.asServiceRole.entities[entityName].filter({
                    name: { $regex: '^(Test|CRUD|Export|.*Test.*Inc|.*Test.*Account)' }
                });
                recordsToDelete = recordsToDelete.concat(testPatternAccounts);
            }
            
            if (entityName === 'Lead') {
                const testPatternLeads = await base44.asServiceRole.entities[entityName].filter({
                    $or: [
                        { first_name: { $regex: '^(Test|CRUD|Export)' } },
                        { last_name: { $regex: '^(Lead|Test|Contact)' } },
                        { email: { $regex: '(test|crud|export).*@(test|example)\\.' } }
                    ]
                });
                recordsToDelete = recordsToDelete.concat(testPatternLeads);
            }
            
            if (entityName === 'Opportunity') {
                const testPatternOpps = await base44.asServiceRole.entities[entityName].filter({
                    name: { $regex: '^(Test|CRUD|Export).*' }
                });
                recordsToDelete = recordsToDelete.concat(testPatternOpps);
            }
            
            if (entityName === 'Activity') {
                const testPatternActivities = await base44.asServiceRole.entities[entityName].filter({
                    subject: { $regex: '^(Test|CRUD|Export).*' }
                });
                recordsToDelete = recordsToDelete.concat(testPatternActivities);
            }
            
            // Remove duplicates by ID
            const uniqueRecords = recordsToDelete.filter((record, index, self) => 
                index === self.findIndex(r => r.id === record.id)
            );
            
            if (uniqueRecords.length > 0) {
                const deletePromises = uniqueRecords.map(record => 
                    base44.asServiceRole.entities[entityName].delete(record.id)
                );
                await Promise.all(deletePromises);
            }
            
            return { entity: entityName, count: uniqueRecords.length };
        });

        const results = await Promise.all(cleanupPromises);
        
        const summary = results.reduce((acc, result) => {
            acc[result.entity] = result.count;
            return acc;
        }, {});

        console.log("Enhanced test data cleanup complete:", summary);

        return new Response(JSON.stringify({
            status: 'success',
            message: 'Enhanced test data cleanup complete.',
            summary: summary,
            details: 'Removed records marked as test data AND records matching test patterns (names starting with Test/CRUD/Export, test emails, etc.)'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Enhanced cleanup failed:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default cleanupTestRecords;
