# eSignature (Document Signing) - User Guide

Send documents for legally-binding electronic signature and track them without leaving AiSHA CRM. Signing lives in the **Document Signatures** section on a Contact, Lead, Account, or Opportunity record.

## Sending a document for signature

1. Open the relevant **Contact**, **Lead**, **Account**, or **Opportunity** record and find the **Document Signatures** section.
2. Open the **Send document for signature** dialog. The recipient's details are pre-filled from the record where possible.
3. Choose a **Template** from the dropdown ("Choose a template…"). If you see "No templates available," an administrator must first create one under **Document Templates**.
4. Enter the **Recipient email** (required) and, optionally, the **Recipient name**.
5. Optionally add a **Message** (up to 2,000 characters) — it's included in the email to the recipient.
6. Click **Send Document**. The recipient receives a tenant-branded email with a private signing link, and a new row appears in the Document Signatures list.

## Tracking documents

Each row in the Document Signatures section shows the document/template name, the recipient (name and email), the **Sent** date, and a **Completed** date once finished, along with a status badge.

- The section header shows a document count and a **Refresh** button; the list also updates on its own.
- Empty state: "No documents sent yet."

### Status meanings

- **pending** — sent but not yet opened.
- **viewed** — the recipient has opened it.
- **signed** — the recipient has signed.
- **completed** — fully finalized.
- **declined** — the recipient declined to sign.
- **expired** — the signing link expired.

## Viewing the signed document

Once a document is **completed**, click **View signed PDF** to open the finished PDF together with its **Certificate of Completion**. The link is short-lived and secure, so reopen it from here whenever you need it.

## Removing a document (admins)

1. Administrators and superadmins can **Delete (archive)** a signing session from its row.
2. A **reason is required** and is visible to anyone reviewing the timeline.
3. Archived rows appear with a line through them and the reason. The legal audit trail is always preserved.

## What the recipient experiences

1. The recipient opens the secure signing link — no login required, and the page shows your company branding.
2. They fill any required fields, type their signer name, and **draw their signature** (a typed signature is also supported).
3. They click **Sign and submit**, then confirm in an "Are you sure?" preview of exactly what will be recorded.
4. After confirming, they reach a success page where they can **download the signed PDF**.
5. Instead of signing, a recipient can **Decline**, optionally giving a reason. A document that's already finished opens as a read-only view.
