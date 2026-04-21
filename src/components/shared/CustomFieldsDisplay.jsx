import { useMemo } from 'react';
import { format } from 'date-fns';
import { useCustomFields } from '@/hooks/useCustomFields';

/**
 * Read-only display of a record's custom field values for detail panels.
 *
 * Custom field values are stored at `entity.metadata.custom.<field_name>` by
 * design. This component resolves them against the active field_customization
 * definitions (via useCustomFields) so labels, types, and select-option
 * display-labels stay in sync with settings.
 *
 * Returns null when there are no custom field definitions OR no stored values
 * — panels stay clean for tenants that don't use custom fields at all.
 *
 * @param {Object} props
 * @param {'Opportunity'|'Activity'|'Contact'|'Lead'|'Account'} props.entityType
 * @param {Object} props.metadata  The record's full metadata object
 * @param {boolean} [props.showHeader=false]  Render a self-contained section header
 * @param {string} [props.headerTitle='Additional Information']
 * @param {string} [props.className]
 */
export function CustomFieldsDisplay({
  entityType,
  metadata,
  showHeader = false,
  headerTitle = 'Additional Information',
  className = '',
}) {
  const { customFields, loading } = useCustomFields(entityType);

  const values = useMemo(() => metadata?.custom || {}, [metadata]);

  // Filter to fields that have a value stored. Empty arrays and empty strings
  // are treated as absent. false / 0 are kept (valid checkbox/number values).
  const fieldsWithValues = useMemo(
    () =>
      (customFields || []).filter((field) => {
        const v = values[field.field_name];
        if (v === undefined || v === null || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        return true;
      }),
    [customFields, values],
  );

  if (loading) return null;
  if (fieldsWithValues.length === 0) return null;

  const list = (
    <div className="space-y-4" data-testid="custom-fields-display">
      {fieldsWithValues.map((field) => (
        <div key={field.field_name} className="grid grid-cols-2 gap-4 items-center">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {field.label || field.field_name}
          </div>
          <div className="text-lg text-slate-900 dark:text-slate-100 font-medium">
            {formatValue(values[field.field_name], field)}
          </div>
        </div>
      ))}
    </div>
  );

  if (!showHeader) return <div className={className}>{list}</div>;

  return (
    <div className={className}>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 uppercase mb-5">
        {headerTitle}
      </h3>
      {list}
    </div>
  );
}

/**
 * Parse a date value safely for display.
 *
 * HTML <input type="date"> produces a date-only string "YYYY-MM-DD" with no
 * timezone. new Date("2026-06-01") parses that as UTC midnight — when rendered
 * in a non-UTC local timezone (e.g. EDT, UTC-4), it shifts back a day to
 * "May 31, 2026". Fix: detect the date-only shape and construct from local
 * year/month/day parts so the displayed date matches the date the user picked.
 *
 * Full ISO timestamps (with 'T' and time) are parsed normally — those carry
 * timezone semantics and the user's clock is the right reference.
 */
function parseDateValueForDisplay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

/**
 * Type-aware formatter. Exported for unit tests.
 */
export function formatValue(value, field) {
  const type = field?.field_type || 'text';

  // Safety check: If value is an object (but not Date or Array), serialize it
  // This prevents React "Objects are not valid as a React child" errors when
  // email metadata or other structured data is stored in activity.metadata
  if (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  ) {
    return JSON.stringify(value, null, 2);
  }

  try {
    switch (type) {
      case 'currency': {
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (Number.isFinite(num)) {
          return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return String(value);
      }
      case 'number': {
        const num = typeof value === 'number' ? value : parseFloat(value);
        return Number.isFinite(num) ? num.toLocaleString() : String(value);
      }
      case 'date': {
        const d = parseDateValueForDisplay(value);
        return Number.isNaN(d.getTime()) ? String(value) : format(d, 'MMM d, yyyy');
      }
      case 'datetime': {
        // Full ISO timestamps carry timezone; parse normally.
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? String(value) : format(d, 'MMM d, yyyy h:mm a');
      }
      case 'checkbox':
        return value === true || value === 'true' || value === 1 ? 'Yes' : 'No';
      case 'select': {
        const opt = (field.options || []).find((o) => o.value === value);
        return opt?.label || String(value);
      }
      case 'multiselect': {
        const arr = Array.isArray(value) ? value : [];
        const labels = arr.map((v) => {
          const opt = (field.options || []).find((o) => o.value === v);
          return opt?.label || v;
        });
        return labels.join(', ');
      }
      default:
        // Ensure we never return objects
        if (value !== null && typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
    }
  } catch {
    // Fallback: safely convert any value to string
    if (value !== null && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Complex Object]';
      }
    }
    return String(value);
  }
}

export default CustomFieldsDisplay;
