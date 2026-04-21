import { useState, useEffect } from 'react';
import { FieldCustomization } from '@/api/entities';

/**
 * Hook to fetch and manage custom fields for a specific entity type
 * @param {string} entityName - Entity name (e.g., 'Opportunity', 'Activity')
 * @returns {Object} - { customFields, loading, error, refetch }
 */
export function useCustomFields(entityName) {
  const [customFields, setCustomFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCustomFields = async () => {
    if (!entityName) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all field customizations and filter for this entity
      const allCustomizations = await FieldCustomization.list();

      // Filter for the specific entity and only show visible custom fields
      // Exclude default/standard fields by looking for custom_ prefix or checking if they're truly custom
      const entityCustomFields = (allCustomizations || [])
        .filter(
          (field) =>
            field.entity_name === entityName &&
            field.is_visible !== false &&
            // Only include fields that are truly custom (not part of default fields)
            (field.field_name?.startsWith('custom_') || field.metadata?.is_custom === true),
        )
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

      setCustomFields(entityCustomFields);
    } catch (err) {
      console.error(`Error fetching custom fields for ${entityName}:`, err);
      setError(err);
      setCustomFields([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomFields();
  }, [entityName]);

  return {
    customFields,
    loading,
    error,
    refetch: fetchCustomFields,
  };
}
