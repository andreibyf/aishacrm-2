/**
 * findDuplicates
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        if (!(await base44.auth.isAuthenticated())) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { entity_type, tenant_id } = await req.json();

        if (!entity_type) {
            return Response.json({ error: 'entity_type is required' }, { status: 400 });
        }

        console.log(`Finding duplicates for ${entity_type}, tenant: ${tenant_id || 'all'}`);

        // Determine which entity to query
        const EntityClass = base44.asServiceRole.entities[entity_type];
        if (!EntityClass) {
            return Response.json({ error: `Unknown entity type: ${entity_type}` }, { status: 400 });
        }

        // Build filter
        const filter = tenant_id ? { tenant_id } : {};

        // Fetch all records
        const records = await EntityClass.filter(filter);
        
        console.log(`Fetched ${records.length} ${entity_type} records`);

        if (!Array.isArray(records) || records.length === 0) {
            return Response.json({ 
                success: true, 
                groups: [], 
                message: 'No records found' 
            });
        }

        // Group by potential duplicate criteria
        const duplicateGroups = [];
        const processed = new Set();

        for (let i = 0; i < records.length; i++) {
            if (processed.has(records[i].id)) continue;

            const record = records[i];
            const duplicates = [record]; // Start with the current record
            const reasons = [];

            for (let j = i + 1; j < records.length; j++) {
                if (processed.has(records[j].id)) continue;

                const other = records[j];
                const matchReasons = [];

                // Check for matching criteria based on entity type
                if (entity_type === 'Account') {
                    // Similar company names (case-insensitive, trimmed)
                    const name1 = (record.name || '').toLowerCase().trim();
                    const name2 = (other.name || '').toLowerCase().trim();
                    if (name1 && name2 && name1 === name2) {
                        matchReasons.push('same_name');
                    }

                    // Matching addresses
                    const addr1 = (record.address_1 || '').toLowerCase().trim();
                    const addr2 = (other.address_1 || '').toLowerCase().trim();
                    if (addr1 && addr2 && addr1 === addr2) {
                        matchReasons.push('same_address');
                    }

                    // Same legacy ID
                    if (record.legacy_id && other.legacy_id && record.legacy_id === other.legacy_id) {
                        matchReasons.push('same_legacy_id');
                    }
                } else if (entity_type === 'Contact') {
                    // Same email
                    const email1 = (record.email || '').toLowerCase().trim();
                    const email2 = (other.email || '').toLowerCase().trim();
                    if (email1 && email2 && email1 === email2) {
                        matchReasons.push('same_email');
                    }

                    // Same phone
                    const phone1 = (record.phone || '').replace(/\D/g, '');
                    const phone2 = (other.phone || '').replace(/\D/g, '');
                    if (phone1 && phone2 && phone1.length >= 10 && phone1 === phone2) {
                        matchReasons.push('same_phone');
                    }

                    // Same legacy ID
                    if (record.legacy_id && other.legacy_id && record.legacy_id === other.legacy_id) {
                        matchReasons.push('same_legacy_id');
                    }

                    // Same name + company
                    const fullName1 = `${record.first_name || ''} ${record.last_name || ''}`.toLowerCase().trim();
                    const fullName2 = `${other.first_name || ''} ${other.last_name || ''}`.toLowerCase().trim();
                    const company1 = (record.company || '').toLowerCase().trim();
                    const company2 = (other.company || '').toLowerCase().trim();
                    if (fullName1 && fullName2 && fullName1 === fullName2 && 
                        company1 && company2 && company1 === company2) {
                        matchReasons.push('same_name_and_company');
                    }
                } else if (entity_type === 'Lead') {
                    // Same email
                    const email1 = (record.email || '').toLowerCase().trim();
                    const email2 = (other.email || '').toLowerCase().trim();
                    if (email1 && email2 && email1 === email2) {
                        matchReasons.push('same_email');
                    }

                    // Same phone
                    const phone1 = (record.phone || '').replace(/\D/g, '');
                    const phone2 = (other.phone || '').replace(/\D/g, '');
                    if (phone1 && phone2 && phone1.length >= 10 && phone1 === phone2) {
                        matchReasons.push('same_phone');
                    }

                    // Same name + company
                    const fullName1 = `${record.first_name || ''} ${record.last_name || ''}`.toLowerCase().trim();
                    const fullName2 = `${other.first_name || ''} ${other.last_name || ''}`.toLowerCase().trim();
                    const company1 = (record.company || '').toLowerCase().trim();
                    const company2 = (other.company || '').toLowerCase().trim();
                    if (fullName1 && fullName2 && fullName1 === fullName2 && 
                        company1 && company2 && company1 === company2) {
                        matchReasons.push('same_name_and_company');
                    }
                }

                // If any match reason found, add to duplicates
                if (matchReasons.length > 0) {
                    duplicates.push(other);
                    processed.add(other.id);
                    reasons.push(...matchReasons);
                }
            }

            // Only add groups with actual duplicates (2+ records)
            if (duplicates.length > 1) {
                processed.add(record.id);
                duplicateGroups.push({
                    records: duplicates, // Full record objects with all fields including id
                    reasons: [...new Set(reasons)] // Unique reasons
                });
            }
        }

        console.log(`Found ${duplicateGroups.length} duplicate groups`);
        
        // Log first group for debugging
        if (duplicateGroups.length > 0) {
            console.log('First duplicate group:', {
                recordCount: duplicateGroups[0].records.length,
                firstRecordId: duplicateGroups[0].records[0]?.id,
                firstRecordName: duplicateGroups[0].records[0]?.name || duplicateGroups[0].records[0]?.first_name,
                reasons: duplicateGroups[0].reasons
            });
        }

        return Response.json({
            success: true,
            groups: duplicateGroups,
            total_groups: duplicateGroups.length,
            total_duplicate_records: duplicateGroups.reduce((sum, g) => sum + g.records.length, 0)
        });

    } catch (error) {
        console.error('Error finding duplicates:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});

----------------------------

export default findDuplicates;
