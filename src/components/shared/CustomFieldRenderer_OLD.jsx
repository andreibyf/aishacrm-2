import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Renders a single custom field based on its type
 * Supports: text (alphanumeric), number (numeric), date, currency
 *
 * @param {Object} field - Field configuration from field_customization table
 * @param {*} value - Current field value
 * @param {Function} onChange - Handler for value changes
 * @param {string} className - Additional CSS classes
 */
export function CustomFieldRenderer({ field, value, onChange, className = '' }) {
  if (!field) return null;

  const handleChange = (e) => {
    const newValue = e.target.value;

    // For currency and number fields, ensure valid numeric input
    if (field.field_type === 'currency' || field.field_type === 'number') {
      // Allow empty string for clearing
      if (newValue === '') {
        onChange(null);
        return;
      }

      // Validate numeric input
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue)) {
        onChange(numValue);
      }
    } else {
      onChange(newValue);
    }
  };

  // Get the appropriate input type
  const getInputType = () => {
    switch (field.field_type) {
      case 'number':
      case 'currency':
        return 'number';
      case 'date':
        return 'date';
      default:
        return 'text';
    }
  };

  // Get input props based on field type
  const getInputProps = () => {
    const baseProps = {
      id: field.field_name,
      type: getInputType(),
      value: value || '',
      onChange: handleChange,
      placeholder: field.placeholder || field.help_text || '',
      required: field.is_required || false,
    };

    // Add currency-specific props
    if (field.field_type === 'currency') {
      return {
        ...baseProps,
        step: '0.01',
        min: '0',
      };
    }

    // Add number-specific props
    if (field.field_type === 'number') {
      return {
        ...baseProps,
        step: 'any',
      };
    }

    return baseProps;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={field.field_name} className="text-white dark:text-slate-200">
        {field.field_label || field.label}
        {field.is_required && <span className="text-red-400 ml-1">*</span>}
      </Label>

      {field.field_type === 'currency' && (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
          <Input
            {...getInputProps()}
            className="pl-7 bg-white border-slate-300 text-slate-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
      )}

      {field.field_type !== 'currency' && (
        <Input
          {...getInputProps()}
          className="bg-white border-slate-300 text-slate-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
        />
      )}

      {field.help_text && (
        <p className="text-sm text-slate-400 dark:text-slate-500">{field.help_text}</p>
      )}
    </div>
  );
}

/**
 * Renders all custom fields for an entity
 * @param {Array} fields - Array of field configurations
 * @param {Object} values - Object with field values keyed by field_name
 * @param {Function} onChange - Handler for value changes (fieldName, newValue)
 * @param {string} className - Additional CSS classes for container
 */
export function CustomFieldsSection({ fields, values = {}, onChange, className = '' }) {
  if (!fields || fields.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="border-t border-slate-600 dark:border-slate-700 pt-4">
        <h3 className="text-lg font-semibold mb-4 text-white dark:text-slate-200">
          Additional Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => (
            <CustomFieldRenderer
              key={field.field_name}
              field={field}
              value={values[field.field_name]}
              onChange={(newValue) => onChange(field.field_name, newValue)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
