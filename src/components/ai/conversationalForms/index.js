import { conversationalSchemas } from './schemas';

const DEFAULT_SCHEMA_ORDER = ['bizdevsource', 'lead', 'account', 'contact', 'opportunity', 'activity'];

export const getSchemaById = (id) => conversationalSchemas[id] || null;

export const listConversationalSchemas = () => {
  const ordered = DEFAULT_SCHEMA_ORDER.map((key) => conversationalSchemas[key]).filter(Boolean);
  const extras = Object.keys(conversationalSchemas)
    .filter((key) => !DEFAULT_SCHEMA_ORDER.includes(key))
    .map((key) => conversationalSchemas[key]);
  return [...ordered, ...extras];
};

export { conversationalSchemas };
