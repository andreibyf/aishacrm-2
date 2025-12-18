import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'status_card_preferences';

// Default status cards for each entity
const DEFAULT_STATUS_CARDS = {
  contacts: [
    { id: 'contact_active', label: 'Active', visible: true, entity: 'Contacts' },
    { id: 'contact_prospect', label: 'Prospects', visible: true, entity: 'Contacts' },
    { id: 'contact_customer', label: 'Customers', visible: true, entity: 'Contacts' },
    { id: 'contact_inactive', label: 'Inactive', visible: true, entity: 'Contacts' },
  ],
  accounts: [
    { id: 'account_prospect', label: 'Prospects', visible: true, entity: 'Accounts' },
    { id: 'account_customer', label: 'Customers', visible: true, entity: 'Accounts' },
    { id: 'account_partner', label: 'Partners', visible: true, entity: 'Accounts' },
    { id: 'account_competitor', label: 'Competitors', visible: true, entity: 'Accounts' },
    { id: 'account_inactive', label: 'Inactive', visible: true, entity: 'Accounts' },
  ],
  leads: [
    { id: 'lead_new', label: 'New', visible: true, entity: 'Leads' },
    { id: 'lead_contacted', label: 'Contacted', visible: true, entity: 'Leads' },
    { id: 'lead_qualified', label: 'Qualified', visible: true, entity: 'Leads' },
    { id: 'lead_converted', label: 'Converted', visible: true, entity: 'Leads' },
    { id: 'lead_rejected', label: 'Rejected', visible: true, entity: 'Leads' },
  ],
  opportunities: [
    { id: 'opportunity_prospecting', label: 'Prospecting', visible: true, entity: 'Opportunities' },
    { id: 'opportunity_qualification', label: 'Qualification', visible: true, entity: 'Opportunities' },
    { id: 'opportunity_proposal', label: 'Proposal', visible: true, entity: 'Opportunities' },
    { id: 'opportunity_negotiation', label: 'Negotiation', visible: true, entity: 'Opportunities' },
    { id: 'opportunity_won', label: 'Won', visible: true, entity: 'Opportunities' },
    { id: 'opportunity_lost', label: 'Lost', visible: true, entity: 'Opportunities' },
  ],
  activities: [
    { id: 'activity_scheduled', label: 'Scheduled', visible: true, entity: 'Activities' },
    { id: 'activity_in_progress', label: 'In Progress', visible: true, entity: 'Activities' },
    { id: 'activity_overdue', label: 'Overdue', visible: true, entity: 'Activities' },
    { id: 'activity_completed', label: 'Completed', visible: true, entity: 'Activities' },
    { id: 'activity_cancelled', label: 'Cancelled', visible: true, entity: 'Activities' },
  ],
};

export function useStatusCardPreferences() {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPreferences(JSON.parse(stored));
      } else {
        // Initialize with defaults
        const defaults = {};
        Object.entries(DEFAULT_STATUS_CARDS).forEach(([entity, cards]) => {
          defaults[entity] = cards.reduce((acc, card) => {
            acc[card.id] = { label: card.label, visible: card.visible };
            return acc;
          }, {});
        });
        setPreferences(defaults);
      }
    } catch (error) {
      console.error('Error loading status card preferences:', error);
      setPreferences({});
    } finally {
      setLoading(false);
    }
  }, []);

  const savePreferences = useCallback((newPrefs) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
      setPreferences(newPrefs);
      return true;
    } catch (error) {
      console.error('Error saving status card preferences:', error);
      throw error;
    }
  }, []);

  const updateCardLabel = useCallback((cardId, newLabel) => {
    setPreferences(prev => {
      const updated = { ...prev };
      for (const entity of Object.keys(updated)) {
        if (updated[entity][cardId]) {
          updated[entity][cardId] = { ...updated[entity][cardId], label: newLabel };
          break;
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Error persisting label update:', error);
      }
      return updated;
    });
  }, []);

  const updateCardVisibility = useCallback((cardId, visible) => {
    setPreferences(prev => {
      const updated = { ...prev };
      for (const entity of Object.keys(updated)) {
        if (updated[entity][cardId]) {
          updated[entity][cardId] = { ...updated[entity][cardId], visible };
          break;
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Error persisting visibility update:', error);
      }
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const defaults = {};
    Object.entries(DEFAULT_STATUS_CARDS).forEach(([entity, cards]) => {
      defaults[entity] = cards.reduce((acc, card) => {
        acc[card.id] = { label: card.label, visible: card.visible };
        return acc;
      }, {});
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      setPreferences(defaults);
    } catch (error) {
      console.error('Error resetting status card preferences:', error);
    }
  }, []);

  const getCardLabel = useCallback((cardId) => {
    if (!preferences) return '';
    for (const entity of Object.keys(preferences)) {
      if (preferences[entity][cardId]) {
        return preferences[entity][cardId].label;
      }
    }
    return '';
  }, [preferences]);

  const isCardVisible = useCallback((cardId) => {
    if (!preferences) return true;
    for (const entity of Object.keys(preferences)) {
      if (preferences[entity][cardId]) {
        return preferences[entity][cardId].visible !== false;
      }
    }
    return true;
  }, [preferences]);

  // Get visible cards for an entity (for chart filtering)
  // Returns array of { id, label, statusKey } in default order
  const getVisibleCardsForEntity = useCallback((entityKey) => {
    const defaults = DEFAULT_STATUS_CARDS[entityKey] || [];
    
    // Map entity key to the prefix used in card IDs
    // e.g., 'activities' -> 'activity_', 'opportunities' -> 'opportunity_'
    const prefixMap = {
      'contacts': 'contact_',
      'accounts': 'account_',
      'leads': 'lead_',
      'opportunities': 'opportunity_',
      'activities': 'activity_',
    };
    const prefix = prefixMap[entityKey] || `${entityKey.slice(0, -1)}_`;
    
    if (!preferences || !preferences[entityKey]) {
      return defaults.map(card => ({
        id: card.id,
        label: card.label,
        statusKey: card.id.replace(prefix, ''), // e.g. 'activity_scheduled' -> 'scheduled'
      }));
    }
    
    return defaults
      .filter(card => preferences[entityKey][card.id]?.visible !== false)
      .map(card => ({
        id: card.id,
        label: preferences[entityKey][card.id]?.label || card.label,
        statusKey: card.id.replace(prefix, ''),
      }));
  }, [preferences]);

  return {
    preferences,
    loading,
    savePreferences,
    updateCardLabel,
    updateCardVisibility,
    resetToDefaults,
    getCardLabel,
    isCardVisible,
    getVisibleCardsForEntity,
    DEFAULT_STATUS_CARDS,
  };
}
