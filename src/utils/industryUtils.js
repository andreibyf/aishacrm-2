/**
 * Industry value → display label mapping
 * Matches the options defined in AccountForm.jsx
 */
export const INDUSTRY_LABELS = {
  aerospace_and_defense: "Aerospace & Defense",
  agriculture: "Agriculture",
  automotive: "Automotive",
  banking_and_financial_services: "Banking & Financial Services",
  construction: "Construction",
  consumer_goods: "Consumer Goods",
  education: "Education",
  energy_and_utilities: "Energy & Utilities",
  entertainment_and_media: "Entertainment & Media",
  government_and_public_sector: "Government & Public Sector",
  green_energy_and_solar: "Green Energy & Solar",
  healthcare_and_life_sciences: "Healthcare & Life Sciences",
  hospitality_and_travel: "Hospitality & Travel",
  information_technology: "Information Technology",
  insurance: "Insurance",
  legal_services: "Legal Services",
  logistics_and_transportation: "Logistics & Transportation",
  manufacturing: "Manufacturing",
  marketing_advertising_pr: "Marketing, Advertising & PR",
  media_and_publishing: "Media & Publishing",
  mining_and_metals: "Mining & Metals",
  nonprofit_and_ngos: "Nonprofit & NGOs",
  pharmaceuticals_and_biotechnology: "Pharmaceuticals & Biotechnology",
  professional_services: "Professional Services",
  real_estate: "Real Estate",
  retail_and_wholesale: "Retail & Wholesale",
  telecommunications: "Telecommunications",
  textiles_and_apparel: "Textiles & Apparel",
  other: "Other",
};

/**
 * Format an industry value to its display label
 * @param {string} value - The raw industry value (e.g., "energy_and_utilities")
 * @returns {string|null} - The display label (e.g., "Energy & Utilities") or null if not found
 */
export function formatIndustry(value) {
  if (!value) return null;
  return INDUSTRY_LABELS[value] || value.replace(/_/g, " ");
}
