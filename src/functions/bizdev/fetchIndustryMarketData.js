/**
 * fetchIndustryMarketData
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const INDUSTRY_LABELS = {
  aerospace_and_defense: "Aerospace & Defense",
  agriculture_and_farming: "Agriculture & Farming",
  automotive_and_transportation: "Automotive & Transportation",
  banking_and_financial_services: "Banking & Financial Services",
  biotechnology_and_pharmaceuticals: "Biotechnology & Pharmaceuticals",
  chemicals_and_materials: "Chemicals & Materials",
  construction_and_engineering: "Construction & Engineering",
  consumer_goods_and_retail: "Consumer Goods & Retail",
  education_and_training: "Education & Training",
  energy_oil_and_gas: "Energy, Oil & Gas",
  entertainment_and_media: "Entertainment & Media",
  environmental_services: "Environmental Services",
  food_and_beverage: "Food & Beverage",
  government_and_public_sector: "Government & Public Sector",
  green_energy_and_solar: "Green Energy & Solar",
  healthcare_and_medical_services: "Healthcare & Medical Services",
  hospitality_and_tourism: "Hospitality & Tourism",
  information_technology_and_software: "Information Technology & Software",
  insurance: "Insurance",
  legal_services: "Legal Services",
  logistics_and_supply_chain: "Logistics & Supply Chain",
  manufacturing_industrial: "Manufacturing (Industrial)",
  marketing_advertising_and_pr: "Marketing, Advertising & PR",
  mining_and_metals: "Mining & Metals",
  nonprofit_and_ngos: "Nonprofit & NGOs",
  real_estate_and_property_management: "Real Estate & Property Management",
  renewable_energy: "Renewable Energy",
  retail_and_wholesale: "Retail & Wholesale",
  telecommunications: "Telecommunications",
  textiles_and_apparel: "Textiles & Apparel",
  utilities_water_and_waste: "Utilities (Water & Waste)",
  veterinary_services: "Veterinary Services",
  warehousing_and_distribution: "Warehousing & Distribution",
  other: "Other"
};

/**
 * Overnight cron job to fetch and cache industry market data.
 * This runs nightly to collect intelligence for industries that have active clients.
 */
Deno.serve(async (req) => {
  try {
    console.log('[fetchIndustryMarketData] Starting overnight data collection...');

    const base44 = createClientFromRequest(req);

    // 1. Scan all tenants to find active industries
    const tenants = await base44.asServiceRole.entities.Tenant.list();
    const activeIndustries = new Set();
    
    for (const tenant of tenants) {
      if (tenant.industry && tenant.industry !== 'other') {
        activeIndustries.add(tenant.industry);
      }
    }

    console.log(`[fetchIndustryMarketData] Found ${activeIndustries.size} active industries`);

    if (activeIndustries.size === 0) {
      return Response.json({ 
        success: true, 
        message: 'No active industries to process',
        industries_processed: 0
      });
    }

    // 2. For each active industry, fetch comprehensive market data
    const results = [];
    for (const industry of activeIndustries) {
      try {
        console.log(`[fetchIndustryMarketData] Processing ${industry}...`);
        
        const industryLabel = INDUSTRY_LABELS[industry] || industry;
        
        // Use AI to gather comprehensive market intelligence
        const prompt = `You are a market research expert. Provide comprehensive, data-driven market intelligence for the ${industryLabel} industry.

Include detailed information on:
1. Global market size (in USD)
2. Annual growth rate (percentage)
3. Top 5-10 key trends with their impact and timeframe
4. Leading companies/players in this industry
5. Primary customer segments
6. Key challenges and opportunities
7. Regulatory environment summary
8. 3-5 year market forecast

Provide ONLY factual, research-backed information. Format as JSON with this structure:
{
  "market_size_usd": number,
  "growth_rate_percent": number,
  "key_trends": [{"trend": "string", "impact": "string", "timeframe": "string"}],
  "top_players": ["string"],
  "customer_segments": ["string"],
  "challenges": ["string"],
  "opportunities": ["string"],
  "regulatory_environment": {"summary": "string"},
  "market_forecast": {"years": [2025, 2026, 2027, 2028, 2029], "projected_sizes_usd": [number]},
  "data_quality_score": number (0-100)
}`;

        const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              market_size_usd: { type: "number" },
              growth_rate_percent: { type: "number" },
              key_trends: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    trend: { type: "string" },
                    impact: { type: "string" },
                    timeframe: { type: "string" }
                  }
                }
              },
              top_players: { type: "array", items: { type: "string" } },
              customer_segments: { type: "array", items: { type: "string" } },
              challenges: { type: "array", items: { type: "string" } },
              opportunities: { type: "array", items: { type: "string" } },
              regulatory_environment: {
                type: "object",
                properties: {
                  summary: { type: "string" }
                }
              },
              market_forecast: {
                type: "object",
                properties: {
                  years: { type: "array", items: { type: "number" } },
                  projected_sizes_usd: { type: "array", items: { type: "number" } }
                }
              },
              data_quality_score: { type: "number" }
            }
          }
        });

        // Count tenants using this industry
        const tenantCount = tenants.filter(t => t.industry === industry).length;

        // Check if we already have data for this industry
        const existing = await base44.asServiceRole.entities.IndustryMarketData.filter({ industry });
        
        const marketData = {
          industry,
          industry_label: industryLabel,
          market_size_usd: llmResponse.market_size_usd,
          growth_rate_percent: llmResponse.growth_rate_percent,
          key_trends: llmResponse.key_trends,
          top_players: llmResponse.top_players,
          customer_segments: llmResponse.customer_segments,
          challenges: llmResponse.challenges,
          opportunities: llmResponse.opportunities,
          market_forecast: llmResponse.market_forecast,
          regulatory_environment: llmResponse.regulatory_environment,
          tenant_count: tenantCount,
          last_updated: new Date().toISOString(),
          data_quality_score: llmResponse.data_quality_score || 75,
          sources: ["AI Market Research", "Internet Search"]
        };

        if (existing && existing.length > 0) {
          // Update existing record
          await base44.asServiceRole.entities.IndustryMarketData.update(existing[0].id, marketData);
          results.push({ industry, action: 'updated' });
        } else {
          // Create new record
          await base44.asServiceRole.entities.IndustryMarketData.create(marketData);
          results.push({ industry, action: 'created' });
        }

        console.log(`[fetchIndustryMarketData] Successfully processed ${industry}`);
        
        // Rate limiting: wait 2 seconds between API calls to avoid throttling
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`[fetchIndustryMarketData] Error processing ${industry}:`, error);
        results.push({ industry, action: 'error', error: error.message });
      }
    }

    console.log('[fetchIndustryMarketData] Overnight data collection complete');

    return Response.json({
      success: true,
      message: 'Industry data collection completed',
      industries_processed: activeIndustries.size,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[fetchIndustryMarketData] Fatal error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

----------------------------

export default fetchIndustryMarketData;
