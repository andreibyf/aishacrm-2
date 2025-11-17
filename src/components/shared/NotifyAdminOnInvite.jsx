
import { SendEmail } from "@/api/integrations";
import { sendSms } from "@/api/functions";
import { User } from "@/api/entities";
import { Tenant } from "@/api/entities";

// Role reference (quick guide shown in the email)
const ROLE_MAP = {
  employee: {
    label: "Employee",
    summary: "Standard employee access - can manage own records only.",
    highlights: [
      "Create/update own Leads, Contacts, and Activities",
      "Limited visibility to assigned data",
      "No tenant-wide access",
    ],
  },
  manager: {
    label: "Manager",
    summary: "Full tenant access - can view and manage all records in their tenant.",
    highlights: [
      "View all tenant data (per RLS)",
      "Full access to all modules",
      "Advanced reporting and analytics",
      "Ideal for operations managers and team leads",
    ],
  },
};

// Renders a small HTML block for the role card
function renderRoleCard(roleKey) {
  const r = ROLE_MAP[roleKey];
  if (!r) return "";
  const li = r.highlights.map((h) => `<li style="margin: 0 0 6px;">${h}</li>`).join("");
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff;margin:6px 0;">
      <div style="font-weight:700;color:#0f172a;margin-bottom:6px;">${r.label}</div>
      <div style="color:#334155;margin-bottom:8px;">${r.summary}</div>
      <ul style="padding-left:18px;margin:0;color:#475569;">${li}</ul>
    </div>
  `;
}

// Renders a compact quick guide with all roles
function renderAllRolesGuide() {
  return `
    <div style="margin-top:10px;">
      ${["employee", "manager"].map(renderRoleCard).join("")}
    </div>
  `;
}

// Send admin notifications (email + SMS) about a new invite.
// Accepts optional employeeRole and tenantId for richer context.
// If adminEmail/Phone overrides are not provided, falls back to current user's data.
export async function notifyAdminOnInvite({
  invitedEmail,
  invitedName,
  role: _role,        // kept for backward compat but unused
  employeeRole,       // optional (employee | manager)
  tenantId,           // optional tenant context for the invite
  adminEmailOverride, // optional override for admin email
  adminPhoneOverride, // optional override for admin phone
  canUseSoftphone,    // requested softphone flag (optional)
  permissions         // granular requested permissions (optional)
}) {
  // Resolve admin contact (current user first)
  let adminEmail = adminEmailOverride || null;
  let adminPhone = adminPhoneOverride || null;
  let currentUserMe = null;
  try {
    currentUserMe = await User.me();
    if (!adminEmail && currentUserMe?.email) adminEmail = currentUserMe.email;
    if (!adminPhone) {
      adminPhone =
        (currentUserMe?.phone_number && String(currentUserMe.phone_number).trim()) ||
        (currentUserMe?.profile?.phone && String(currentUserMe.profile.phone).trim()) ||
        (currentUserMe?.settings?.phone && String(currentUserMe.settings.phone).trim()) ||
        null;
    }
  } catch {
    // ignore
  }

  // Get tenant name (for context only; no selection in UI)
  let tenantName = null;
  if (tenantId) {
    try {
      const t = await Tenant.get(tenantId);
      tenantName = t?.name || null;
    } catch {
      // ignore
    }
  }

  const cleanName = invitedName || invitedEmail || "New User";
  const cleanEmployeeRole = employeeRole || "Not provided";

  const requestedByEmail = currentUserMe?.email || null;
  const requestedByName = currentUserMe?.full_name || currentUserMe?.display_name || requestedByEmail || "Requester";
  const requestedByRole = currentUserMe?.role || "user";
  const requestedByEmployeeRole = currentUserMe?.employee_role || "Unknown";

  // Build requested access details
  const requestedAccessItems = [];
  if (typeof canUseSoftphone === 'boolean') {
    requestedAccessItems.push(`Can use Softphone: <strong>${canUseSoftphone ? 'Yes' : 'No'}</strong>`);
  }
  if (permissions && typeof permissions === 'object') {
    const labelMap = {
      intended_role: 'Intended Role',
      can_manage_users: 'Can manage users',
      can_manage_settings: 'Can manage settings',
      can_view_all_data: 'Can view all data',
      can_export_data: 'Can export data',
      can_manage_modules: 'Can manage modules',
      can_impersonate_tenants: 'Can impersonate tenants',
      can_use_softphone: 'Can use Softphone',
      dashboard_scope: 'Dashboard scope'
    };
    Object.entries(permissions).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      const label = labelMap[key] || key.replace(/_/g, ' ');
      const shown = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
      requestedAccessItems.push(`${label}: <strong>${shown}</strong>`);
    });
  }

  // Structured HTML email (dark/light friendly)
  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0f172a; padding:18px;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #06b6d4, #6366f1); padding:16px 20px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:0.3px;">Ai-SHA CRM — New User Access Request</h1>
      </div>

      <div style="padding:16px 20px;">
        <p style="margin:0 0 12px;color:#0f172a;">
          A new user access request was submitted from the Employees page.
        </p>

        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#f8fafc;">
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#0f172a;">
            <tr>
              <td style="width:180px;color:#475569;padding:6px 8px;">Requested User</td>
              <td style="padding:6px 8px;font-weight:600;">${cleanName} &lt;${invitedEmail}&gt;</td>
            </tr>
            <tr>
              <td style="color:#475569;padding:6px 8px;">CRM Role (requested)</td>
              <td style="padding:6px 8px;">${cleanEmployeeRole}</td>
            </tr>
            ${tenantId ? `
            <tr>
              <td style="color:#475569;padding:6px 8px;">Tenant (origin)</td>
              <td style="padding:6px 8px;">${tenantName ? `${tenantName} (${tenantId})` : tenantId}</td>
            </tr>` : ``}
            <tr>
              <td style="color:#475569;padding:6px 8px;">Requested by</td>
              <td style="padding:6px 8px;">${requestedByName} &lt;${requestedByEmail || 'unknown'}&gt;</td>
            </tr>
            <tr>
              <td style="color:#475569;padding:6px 8px;">Requester authorization</td>
              <td style="padding:6px 8px;">System Role: <strong>${requestedByRole}</strong> • CRM Role: <strong>${requestedByEmployeeRole}</strong></td>
            </tr>
          </table>
        </div>

        ${requestedAccessItems.length ? `
        <div style="margin-top:16px;">
          <h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Requested access details</h3>
          <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#ffffff;">
            <ul style="margin:0;padding-left:18px;color:#334155;">
              ${requestedAccessItems.map(i => `<li style="margin:0 0 6px;">${i}</li>`).join('')}
            </ul>
          </div>
        </div>` : ``}

        <div style="margin-top:16px;">
          <h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">CRM Role quick guide</h3>
          ${ROLE_MAP[cleanEmployeeRole] ? renderRoleCard(cleanEmployeeRole) : renderAllRolesGuide()}
        </div>

        <div style="margin-top:16px;">
          <h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Suggested next steps</h3>
          <ol style="margin:0;padding-left:18px;color:#334155;">
            <li style="margin:0 0 8px;">Confirm the invitee can log in (or send platform invite).</li>
            <li style="margin:0 0 8px;">Set the user's CRM Role and Access Level as requested (adjust if needed).</li>
            <li style="margin:0 0 8px;">Ensure the user is linked to the corresponding Employee record.</li>
          </ol>
        </div>
      </div>

      <div style="background:#f1f5f9;border-top:1px solid #e5e7eb;padding:12px 20px;color:#475569;font-size:12px;">
        This message was generated automatically by Ai-SHA CRM.
      </div>
    </div>
  </div>
  `;

  if (adminEmail) {
    const subject = `User Access Request: ${cleanName} <${invitedEmail}>`;
    try {
      await SendEmail({
        to: adminEmail,
        subject,
        body: html,
        from_name: "Ai-SHA CRM"
      });
       
      console.log("[NotifyAdminOnInvite] Admin email sent to:", adminEmail);
    } catch (e) {
      console.warn("[NotifyAdminOnInvite] Admin email failed:", e?.message || e);
    }
  } else {
    console.warn("[NotifyAdminOnInvite] No admin email available; skipping email.");
  }

  if (adminPhone) {
    const sms = `Ai-SHA CRM: Access request for ${cleanName} <${invitedEmail}> by ${requestedByEmail || 'unknown'} [${requestedByEmployeeRole}]`;
    try {
      await sendSms({ to: adminPhone, message: sms });
       
      console.log("[NotifyAdminOnInvite] Admin SMS sent to:", adminPhone);
    } catch (e) {
      console.warn("[NotifyAdminOnInvite] Admin SMS failed:", e?.message || e);
    }
  } else {
    console.warn("[NotifyAdminOnInvite] No admin phone available; skipping SMS.");
  }
}
