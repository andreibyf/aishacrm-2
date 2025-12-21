# BizDev Source to Lead Promotion Flow

## Updated Sales Pipeline Flow

**BizDev Source → Lead → Contact → Account**

### Flow Description

1. **BizDev Source** (Prospecting Stage)
   - Initial prospect data from various sources (directories, referrals, etc.)
   - Can be B2B (company-focused) or B2C (person-focused)
   - Status: Active, Promoted, or Archived

2. **Lead** (Qualification Stage)
   - Created by promoting an Active BizDev Source
   - Inherits ALL available data from the source
   - Further qualification and nurturing happens here

3. **Contact** (Engagement Stage)
   - Created from qualified Leads
   - Represents an individual person in the system
   - Can be associated with an Account

4. **Account** (Customer Stage)
   - Final stage when business is won
   - Represents the customer relationship
   - Can have multiple Contacts

---

## Data Carry-Forward

### Fields Automatically Transferred from BizDev Source to Lead

#### Identity Fields
- **B2B Mode:**
  - `company_name` → `company`
  - `contact_person` → `contact_name`
  - `dba_name` → included in `notes`

- **B2C Mode:**
  - `contact_person` → split into `first_name` and `last_name`

#### Contact Information
- `email` → `email`
- `phone_number` → `phone`
- `website` → `website`

#### Address Information
- `address_line_1` → `address_line_1`
- `address_line_2` → `address_line_2`
- `city` → `city`
- `state_province` → `state_province`
- `postal_code` → `postal_code`
- `country` → `country`

#### Business Information
- `industry` → `industry`
- `source_name` → `source`
- `notes` → `notes` (with license info appended if available)

#### License Information (appended to notes)
- `industry_license`
- `license_status`
- `license_expiry_date`

---

## Promotion Process

### From BizDev Source to Lead

1. **Prerequisites:**
   - Source must have status = "Active"
   - Source must NOT already be promoted (no `lead_ids` or `metadata.primary_lead_id`)

2. **Promotion Actions:**
   - Creates new Lead record with all available data
   - Updates BizDev Source:
     - Sets `status` to "Promoted"
     - Adds Lead ID to `lead_ids` array
     - Sets `metadata.primary_lead_id`
     - Sets `metadata.promoted_at` timestamp

3. **UI Updates:**
   - "Promote to Lead" button appears only for Active, non-promoted sources
   - Confirmation dialog explains data will be carried forward
   - After promotion, shows link to view the created Lead

---

## Implementation Files

### Core Files
- `src/components/bizdev/BizDevSourceForm.jsx` - Form with promotion logic
- `src/components/bizdev/BizDevSourceDetailPanel.jsx` - Detail view with promotion button
- `src/utils/bizdev/mapBizDevSourceToLead.js` - Data mapping utility

### Key Functions
- `handlePromote()` - Executes the promotion workflow
- `mapBizDevSourceToLead()` - Maps source data to lead payload

---

## Business Model Support

The system supports three business models (set at tenant level):

1. **B2B (Business-to-Business)**
   - Company-centric data model
   - `company_name` is required
   - Contact person is optional

2. **B2C (Business-to-Consumer)**
   - Person-centric data model
   - `contact_person` and `email` are required
   - Company name is optional

3. **Hybrid**
   - Supports both B2B and B2C
   - All fields available
   - Flexible requirements

---

## Next Steps in Pipeline

After promoting to Lead, the typical flow continues:

1. **Lead Qualification** - Assess fit and interest
2. **Lead to Contact Conversion** - Create Contact record (data carries forward)
3. **Contact to Account Association** - Link Contact to Account when business is won
4. **Opportunity Creation** - Track deals and revenue

