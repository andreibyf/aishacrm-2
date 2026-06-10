/**
 * marketInsights/synthesize — shared market-intelligence report synthesis.
 *
 * Extracted from the `POST /api/mcp/market-insights` route so the SAME rich
 * report (executive_summary, market_overview, SWOT, competitive_landscape,
 * industry_trends, major_news, recommendations, economic_indicators) can be
 * produced both by that route AND by the growth insight runner (so one
 * "Generate Insight" run yields the rich report + the scored opportunities).
 *
 * The report is synthesized by Claude via the `aisha-mcp` LiteLLM alias (capable
 * model, full schema). The LLM call is injected as `deps.callLLM` so this module
 * is unit-testable with no live LLM / network, and `deps.fetch` is injectable for
 * the Wikipedia context.
 *
 * Failure modes (mirrors the original route):
 *  - LLM key/not-configured error → return `buildBaseline()` with `fallback:true`.
 *  - LLM ok but content unparseable → return `buildBaseline()` (keep model/usage).
 *  - LLM other error → THROW (the route turns this into a 500; the growth runner
 *    catches it and records `report.market_insights_error`, staying fail-soft).
 */

import _fetch from 'node-fetch';
import { callLiteLLMVirtual } from '../aiEngine/litellmClient.js';
import { logLLMActivity } from '../aiEngine/activityLogger.js';
import logger from '../logger.js';

// User-Agent required by Wikipedia/MediaWiki API policy.
const WIKIPEDIA_USER_AGENT = 'AishaCRM/1.0 (market-insights; contact@aishacrm.com)';

// Human-readable label maps (mirrors frontend AIMarketInsights.jsx).
const INDUSTRY_LABELS = {
  accounting_and_finance: 'Accounting & Finance',
  aerospace_and_defense: 'Aerospace & Defense',
  agriculture_and_farming: 'Agriculture & Farming',
  automotive_and_transportation: 'Automotive & Transportation',
  banking_and_financial_services: 'Banking & Financial Services',
  biotechnology_and_pharmaceuticals: 'Biotechnology & Pharmaceuticals',
  chemicals_and_materials: 'Chemicals & Materials',
  construction_and_engineering: 'Construction & Engineering',
  consulting_and_professional_services: 'Consulting & Professional Services',
  consumer_goods_and_retail: 'Consumer Goods & Retail',
  cybersecurity: 'Cybersecurity',
  data_analytics_and_business_intelligence: 'Data Analytics & Business Intelligence',
  education_and_training: 'Education & Training',
  energy_oil_and_gas: 'Energy, Oil & Gas',
  entertainment_and_media: 'Entertainment & Media',
  environmental_services: 'Environmental Services',
  event_management: 'Event Management',
  fashion_and_apparel: 'Fashion & Apparel',
  food_and_beverage: 'Food & Beverage',
  franchising: 'Franchising',
  gaming_and_esports: 'Gaming & Esports',
  government_and_public_sector: 'Government & Public Sector',
  green_energy_and_solar: 'Green Energy & Solar',
  healthcare_and_medical_services: 'Healthcare & Medical Services',
  hospitality_and_tourism: 'Hospitality & Tourism',
  human_resources_and_staffing: 'Human Resources & Staffing',
  information_technology_and_software: 'Information Technology & Software',
  insurance: 'Insurance',
  interior_design_and_architecture: 'Interior Design & Architecture',
  legal_services: 'Legal Services',
  logistics_and_supply_chain: 'Logistics & Supply Chain',
  manufacturing_industrial: 'Manufacturing (Industrial)',
  marketing_advertising_and_pr: 'Marketing, Advertising & PR',
  mining_and_metals: 'Mining & Metals',
  nonprofit_and_ngos: 'Nonprofit & NGOs',
  packaging_and_printing: 'Packaging & Printing',
  pharmaceuticals: 'Pharmaceuticals',
  real_estate_and_property_management: 'Real Estate & Property Management',
  renewable_energy: 'Renewable Energy',
  research_and_development: 'Research & Development',
  retail_and_wholesale: 'Retail & Wholesale',
  robotics_and_automation: 'Robotics & Automation',
  saas_and_cloud_services: 'SaaS & Cloud Services',
  security_services: 'Security Services',
  social_media_and_influencer: 'Social Media & Influencer',
  sports_and_recreation: 'Sports & Recreation',
  telecommunications: 'Telecommunications',
  textiles_and_apparel: 'Textiles & Apparel',
  transportation_and_delivery: 'Transportation & Delivery',
  utilities_water_and_waste: 'Utilities (Water & Waste)',
  veterinary_services: 'Veterinary Services',
  warehousing_and_distribution: 'Warehousing & Distribution',
  wealth_management: 'Wealth Management',
  other: 'Other',
};
const GEOGRAPHIC_LABELS = {
  north_america: 'North America',
  europe: 'Europe',
  asia: 'Asia',
  south_america: 'South America',
  africa: 'Africa',
  oceania: 'Oceania',
  global: 'Global',
};

// Convert snake_case to Title Case if not in label map.
function humanize(val, labels) {
  if (!val) return null;
  if (labels[val]) return labels[val];
  if (val.includes(' ') || /[A-Z]/.test(val)) return val;
  return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The JSON schema the LLM is asked to produce. PURE.
 * @returns {object}
 */
export function buildInsightsSchema() {
  return {
    type: 'object',
    properties: {
      executive_summary: {
        type: 'string',
        description:
          '3-4 sentence executive summary with critical insights and recommended immediate actions',
      },
      market_overview: {
        type: 'string',
        description:
          'Detailed 2-3 paragraph market overview with size, growth trajectory, and dynamics',
      },
      swot_analysis: {
        type: 'object',
        properties: {
          strengths: { type: 'array', items: { type: 'string' }, minItems: 4 },
          weaknesses: { type: 'array', items: { type: 'string' }, minItems: 4 },
          opportunities: { type: 'array', items: { type: 'string' }, minItems: 4 },
          threats: { type: 'array', items: { type: 'string' }, minItems: 4 },
        },
        required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
      },
      competitive_landscape: {
        type: 'object',
        properties: {
          overview: { type: 'string' },
          major_competitors: { type: 'array', items: { type: 'string' } },
          market_dynamics: { type: 'string' },
          competitive_advantages: {
            type: 'string',
            description: 'How this company can differentiate',
          },
        },
        required: ['overview', 'major_competitors', 'market_dynamics'],
      },
      industry_trends: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            impact: { type: 'string', enum: ['high', 'medium', 'low'] },
            timeframe: { type: 'string' },
          },
          required: ['name', 'description', 'impact'],
        },
      },
      major_news: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            date: { type: 'string' },
            impact: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
          },
          required: ['title', 'description', 'date', 'impact'],
        },
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            action_items: {
              type: 'array',
              items: { type: 'string' },
              description: '2-3 concrete steps to execute this recommendation',
            },
            timeline: {
              type: 'string',
              description:
                'One of: immediate, short-term (1-3 months), medium-term (3-6 months), long-term (6-12 months)',
            },
            expected_impact: {
              type: 'string',
              description: 'Specific expected business outcome with metrics where possible',
            },
          },
          required: [
            'title',
            'description',
            'priority',
            'action_items',
            'timeline',
            'expected_impact',
          ],
        },
      },
      economic_indicators: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            current_value: { type: 'number' },
            trend: { type: 'string', enum: ['up', 'down', 'stable'] },
            unit: { type: 'string' },
          },
          required: ['name', 'current_value', 'trend', 'unit'],
        },
      },
    },
    required: [
      'executive_summary',
      'market_overview',
      'swot_analysis',
      'competitive_landscape',
      'industry_trends',
      'major_news',
      'recommendations',
      'economic_indicators',
    ],
  };
}

/**
 * Deterministic baseline report used when the LLM is unavailable/unparseable. PURE.
 * @param {object} ctx - { INDUSTRY, BUSINESS_MODEL, LOCATION, tenantStats, searchResults }
 * @returns {object}
 */
export function buildBaseline({ INDUSTRY, BUSINESS_MODEL, LOCATION, tenantStats, searchResults }) {
  const strip = (s) => {
    let result = String(s || '');
    let prev;
    do {
      prev = result;
      result = result.replace(/<[^>]+>/g, '');
    } while (result !== prev);
    return result.trim();
  };
  return {
    executive_summary: `The ${INDUSTRY} market in ${LOCATION} presents significant opportunities for ${BUSINESS_MODEL} companies. Current analysis of ${tenantStats.accounts} accounts and ${tenantStats.opportunities} active pipeline opportunities suggests immediate priorities should include pipeline development, conversion optimization, and targeted market expansion within ${INDUSTRY} segments.`,
    market_overview: `The ${INDUSTRY} market in ${LOCATION} continues to evolve with changing economic conditions and technological advancements. Key drivers include infrastructure investment, digital transformation, and workforce development initiatives. ${BUSINESS_MODEL} companies in this sector are navigating supply chain dynamics, regulatory requirements, and competitive pressures while capitalizing on regional growth opportunities. Market maturity varies across sub-segments, with emerging niches offering the strongest growth potential for agile operators.`,
    swot_analysis: {
      strengths: [
        `Established presence in ${INDUSTRY} market in ${LOCATION}`,
        `${BUSINESS_MODEL} model enables scalable customer acquisition and retention`,
        `Growing digital adoption creating new engagement channels`,
        `Regional market knowledge and existing relationship networks`,
      ],
      weaknesses: [
        `Operational costs volatility in current ${INDUSTRY} market conditions`,
        `Talent acquisition and retention challenges in ${LOCATION}`,
        `Pipeline diversity needs improvement (${tenantStats.opportunities} active opportunities)`,
        `Potential over-reliance on existing customer base of ${tenantStats.accounts} accounts`,
      ],
      opportunities: [
        `Niche positioning within underserved ${INDUSTRY} segments in ${LOCATION}`,
        `AI and automation-driven efficiency gains in sales and operations`,
        `Strategic partnerships with complementary ${INDUSTRY} service providers`,
        `Expansion into adjacent markets leveraging existing ${INDUSTRY} expertise`,
      ],
      threats: [
        `Competitive pressure from both incumbents and well-funded startups in ${INDUSTRY}`,
        `Regulatory changes affecting ${INDUSTRY} operations in ${LOCATION}`,
        `Economic headwinds impacting customer spending patterns`,
        `Technology disruption reshaping ${INDUSTRY} value chains and buyer expectations`,
      ],
    },
    competitive_landscape: {
      overview: `The ${INDUSTRY} competitive environment in ${LOCATION} features both established players and emerging challengers. Market consolidation trends are creating opportunities for differentiated ${BUSINESS_MODEL} providers that emphasize speed-to-value and specialized expertise.`,
      major_competitors: (searchResults || [])
        .slice(0, 3)
        .map((r) => r?.title || 'Key competitor')
        .filter(Boolean),
      market_dynamics: `Key dynamics include pricing pressure from digital-first competitors, increasing customer expectations for integrated solutions, and growing importance of data-driven decision making. ${BUSINESS_MODEL} providers that emphasize measurable ROI are gaining market share.`,
      competitive_advantages: `Differentiate through deep ${INDUSTRY} expertise, personalized customer engagement, and agile delivery in the ${LOCATION} market.`,
    },
    industry_trends: [
      {
        name: 'Digital Transformation Acceleration',
        description: `${INDUSTRY} companies in ${LOCATION} are increasingly adopting cloud, AI, and automation technologies to improve operational efficiency and customer experience.`,
        impact: 'high',
        timeframe: 'Ongoing, accelerating over next 2-3 years',
      },
      {
        name: 'Customer Experience as Differentiator',
        description: `Shift toward personalized, omnichannel engagement is reshaping how ${INDUSTRY} companies compete and retain clients in ${LOCATION}.`,
        impact: 'high',
        timeframe: 'Immediate and ongoing',
      },
      {
        name: 'Data-Driven Decision Making',
        description: `Growing emphasis on analytics, KPIs, and real-time dashboards for strategic planning across ${INDUSTRY}.`,
        impact: 'medium',
        timeframe: 'Next 1-2 years',
      },
      {
        name: 'Sustainability & ESG Integration',
        description: `Increasing regulatory and market pressure for sustainable practices and ESG reporting in ${INDUSTRY} operations.`,
        impact: 'medium',
        timeframe: 'Next 2-5 years',
      },
    ],
    major_news: (searchResults || []).slice(0, 5).map((r) => ({
      title: r?.title || 'Industry update',
      description: strip(r?.snippet || ''),
      date: new Date().toISOString().slice(0, 10),
      impact: 'neutral',
    })),
    recommendations: [
      {
        title: `Tighten ICP and ${INDUSTRY}-Specific Messaging`,
        description: `Refine ideal customer profile targeting for ${INDUSTRY} segments in ${LOCATION}. Align outreach messaging with industry-specific pain points and buying triggers.`,
        priority: 'high',
        action_items: [
          `Analyze top closed-won deals to identify common ${INDUSTRY} buyer characteristics`,
          `Develop 3 industry-specific email sequences and value propositions`,
          `Create ${INDUSTRY} case studies and ROI calculators for outbound campaigns`,
        ],
        timeline: 'short-term (1-3 months)',
        expected_impact: `Improved response rates and 15-25% increase in qualified opportunity creation within 60 days.`,
      },
      {
        title: 'Pipeline Hygiene and Conversion Optimization',
        description: `Implement systematic deal review process to improve conversion rates across the sales funnel.`,
        priority: 'medium',
        action_items: [
          'Establish weekly pipeline review cadence with standardized scoring criteria',
          'Implement stage-gate qualification criteria for opportunity progression',
          'Set up automated stale-deal alerts for opportunities inactive >14 days',
        ],
        timeline: 'immediate',
        expected_impact: `10-20% increase in win rates and improved forecast accuracy through better deal qualification.`,
      },
      ...(tenantStats.activities < 10
        ? [
            {
              title: 'Launch Targeted Outreach Sprint',
              description: `Low recent activity detected (${tenantStats.activities} activities). Execute a focused 2-week outreach campaign targeting high-fit ${INDUSTRY} prospects in ${LOCATION}.`,
              priority: 'high',
              action_items: [
                'Build a list of 50 target accounts matching ICP criteria',
                'Execute multi-channel outreach (email + LinkedIn + phone) with 5-touch sequences',
                `Schedule ${Math.max(10, tenantStats.accounts * 2)} outbound activities per week`,
              ],
              timeline: 'immediate',
              expected_impact: `Generate 10-20 new qualified leads and 3-5 discovery meetings within 2 weeks.`,
            },
          ]
        : []),
      ...(tenantStats.opportunities === 0
        ? [
            {
              title: 'Kickstart Pipeline from Existing Database',
              description: `No active pipeline found. Leverage existing ${tenantStats.contacts} contacts and ${tenantStats.accounts} accounts to seed new opportunities.`,
              priority: 'high',
              action_items: [
                'Run re-engagement campaign to dormant contacts with new value proposition',
                'Identify 5 expansion opportunities within existing accounts',
                'Launch referral program with current customers for warm introductions',
              ],
              timeline: 'immediate',
              expected_impact: `Create 5-10 new pipeline opportunities within 30 days from existing database.`,
            },
          ]
        : []),
      {
        title: `${LOCATION} Market Expansion Strategy`,
        description: `Develop focused go-to-market plan for underserved ${INDUSTRY} segments in ${LOCATION}.`,
        priority: 'medium',
        action_items: [
          `Research 3 adjacent ${INDUSTRY} sub-segments with growth potential in ${LOCATION}`,
          'Develop market entry plan with pricing, positioning, and channel strategy',
          'Identify potential strategic partners or referral relationships in target segments',
        ],
        timeline: 'medium-term (3-6 months)',
        expected_impact: `15-30% addressable market expansion and new revenue stream within 6 months.`,
      },
    ],
    economic_indicators: [
      { name: 'GDP Growth', current_value: 2.2, trend: 'up', unit: 'percent' },
      { name: 'Inflation', current_value: 3.1, trend: 'down', unit: 'percent' },
      { name: 'Unemployment', current_value: 4.0, trend: 'stable', unit: 'percent' },
      { name: 'Venture Funding', current_value: 12.5, trend: 'up', unit: 'USD (B)' },
      { name: `${INDUSTRY} Index`, current_value: 108, trend: 'up', unit: 'index' },
    ],
  };
}

/**
 * Default LLM caller → Claude via the `aisha-mcp` LiteLLM alias. Honors optional
 * body.provider/body.model overrides (LiteLLM wildcard route). Injectable as
 * `deps.callLLM` for tests.
 *
 * @returns {Promise<{ok:boolean, content?:string, model?:string, provider?:string, usage?:object, error?:string}>}
 */
export async function defaultCallLLM({ messages, temperature = 0.3, tenantId, body = {} }) {
  const virtualModel =
    body.provider && body.model ? `${body.provider}/${body.model}` : body.model || 'aisha-mcp';

  const startMs = Date.now();
  const result = await callLiteLLMVirtual({ model: virtualModel, messages, temperature, tenantId });

  logLLMActivity({
    tenantId,
    capability: 'brain_read_only',
    provider: body.provider || 'aisha-mcp',
    model: result.raw?.model || body.model || 'aisha-mcp',
    nodeId: 'marketInsights:synthesize',
    status: result.status,
    durationMs: Date.now() - startMs,
    usage: result.raw?.usage || null,
    attempt: 1,
    totalAttempts: 1,
    ...(result.status === 'error' ? { error: result.error } : {}),
  });

  return result.status === 'success'
    ? {
        ok: true,
        content: result.content,
        provider: body.provider || 'aisha-mcp',
        model: result.raw?.model || body.model || 'aisha-mcp',
        usage: result.raw?.usage || null,
      }
    : { ok: false, error: result.error };
}

/**
 * Synthesize the rich market-intelligence report for a tenant.
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {string} args.tenantId - tenant UUID or slug (matched against tenant.id / tenant.tenant_id)
 * @param {object} [args.body] - optional overrides (industry, business_model, geographic_focus, temperature, model, provider)
 * @param {object} [args.profile] - optional business_profile (its settings enrich industry/model/geo)
 * @param {object} [args.deps] - { callLLM, fetch } injection for tests
 * @returns {Promise<{insights:object, model:?string, provider:?string, usage:?object, fallback:boolean}>}
 */
export async function synthesizeMarketInsights({
  supabase,
  tenantId,
  body = {},
  profile = null,
  deps = {},
}) {
  if (!tenantId) throw new Error('synthesizeMarketInsights requires tenantId');
  const callLLM = deps.callLLM || defaultCallLLM;
  const fetchImpl = deps.fetch || _fetch;

  // Load tenant profile for context.
  const { data: tenantRows, error: tErr } = await supabase
    .from('tenant')
    .select('id, tenant_id, name, industry, business_model, geographic_focus, country, major_city')
    .or(`tenant_id.eq.${tenantId},id.eq.${tenantId}`)
    .limit(1);
  if (tErr) throw tErr;
  const tenant = tenantRows?.[0] || { tenant_id: tenantId, name: tenantId };

  const settings = (profile && profile.settings) || {};
  const rawIndustry =
    tenant.industry || settings.industry || body.industry || 'saas_and_cloud_services';
  const rawGeo =
    tenant.geographic_focus ||
    settings.geographic_focus ||
    body.geographic_focus ||
    'north_america';
  const INDUSTRY = humanize(rawIndustry, INDUSTRY_LABELS) || 'SaaS & Cloud Services';
  const BUSINESS_MODEL = (
    tenant.business_model ||
    settings.business_model ||
    body.business_model ||
    'B2B'
  ).toUpperCase();
  const GEO = humanize(rawGeo, GEOGRAPHIC_LABELS) || 'North America';
  const LOCATION =
    tenant.major_city && tenant.country
      ? `${tenant.major_city}, ${tenant.country}`
      : tenant.country || GEO;

  // CRM stats. Data tables store the tenant UUID in their tenant_id column.
  const tenantUuid = tenant.id || tenantId;
  const [accounts, contacts, leads, opps, activities] = await Promise.all([
    supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantUuid),
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantUuid),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantUuid),
    supabase
      .from('opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantUuid),
    supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantUuid),
  ]);
  const tenantStats = {
    accounts: accounts.count || 0,
    contacts: contacts.count || 0,
    leads: leads.count || 0,
    opportunities: opps.count || 0,
    activities: activities.count || 0,
  };

  // Wikipedia context (best-effort; never aborts synthesis).
  const searchQ = `${INDUSTRY} market ${LOCATION}`;
  let searchResults = [];
  let overview = '';
  try {
    const searchResp = await fetchImpl(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(searchQ)}`,
      { headers: { 'User-Agent': WIKIPEDIA_USER_AGENT, Accept: 'application/json' } },
    );
    if (searchResp.ok) {
      const searchJson = await searchResp.json();
      searchResults = searchJson?.query?.search || [];
    }
  } catch (wikiErr) {
    logger.warn('[market-insights] Wikipedia search failed:', wikiErr?.message);
  }
  if (searchResults.length) {
    const pageid = String(searchResults[0].pageid);
    try {
      const pageResp = await fetchImpl(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&pageids=${encodeURIComponent(pageid)}`,
        { headers: { 'User-Agent': WIKIPEDIA_USER_AGENT, Accept: 'application/json' } },
      );
      if (pageResp.ok) {
        const pageJson = await pageResp.json();
        overview = pageJson?.query?.pages?.[pageid]?.extract || '';
      }
    } catch {
      overview = '';
    }
  }

  const schema = buildInsightsSchema();

  const prompt = `Generate a comprehensive, data-driven market intelligence report in JSON format for a company operating in ${INDUSTRY} (${BUSINESS_MODEL} model) in ${LOCATION}.

Requirements:
1. EXECUTIVE SUMMARY: Write a 3-4 sentence executive summary highlighting the most critical market insights and recommended immediate actions specific to ${INDUSTRY}.
2. MARKET OVERVIEW: Provide a detailed 2-3 paragraph overview of current market conditions, estimated market size, growth trajectory, and key dynamics specific to ${INDUSTRY} in ${LOCATION}. Include approximate market size figures where possible.
3. SWOT ANALYSIS: Provide 4-5 specific, actionable items per quadrant. Reference actual market conditions, real competitors, and concrete trends. Avoid generic business platitudes.
4. COMPETITIVE LANDSCAPE: Name real companies operating in ${INDUSTRY} in ${LOCATION}. Describe specific competitive positioning and differentiation strategies.
5. INDUSTRY TRENDS: Identify 4-5 major trends reshaping ${INDUSTRY} with specific implications and timeframes.
6. MAJOR NEWS: Reference realistic recent industry events with specific impact assessments.
7. ECONOMIC INDICATORS: Provide realistic economic indicators specifically relevant to ${INDUSTRY} and ${LOCATION}.
8. STRATEGIC RECOMMENDATIONS: Provide 4-6 highly specific, actionable recommendations tailored to this company. Each MUST include concrete action_items (2-3 specific steps), a timeline, and expected_impact with quantified outcomes where possible.

CRM data: The company has ${tenantStats.accounts} accounts, ${tenantStats.contacts} contacts, ${tenantStats.leads} leads, ${tenantStats.opportunities} opportunities, and ${tenantStats.activities} activities. Use this to tailor recommendations — if pipeline is thin, focus on lead gen; if leads are high but opps low, focus on conversion; if activity is low, recommend outreach campaigns.

Be SPECIFIC to ${INDUSTRY} in ${LOCATION}. Do NOT provide generic advice like "improve communication" or "invest in technology". Every insight must be actionable within the context of a ${BUSINESS_MODEL} ${INDUSTRY} company.`;

  const context = [
    `Tenant: ${tenant.name || tenant.tenant_id}`,
    `Industry: ${INDUSTRY}`,
    `Business Model: ${BUSINESS_MODEL}`,
    `Location: ${LOCATION}`,
    `CRM Stats: ${JSON.stringify(tenantStats)}`,
    `Market Overview Seed: ${overview?.slice(0, 1200) || ''}`,
    `News: ${(searchResults || [])
      .map((r) => `${r.title}: ${r.snippet || ''}`)
      .join(' | ')
      .slice(0, 1500)}`,
  ];

  const SYSTEM = `You are an expert market intelligence analyst that outputs ONLY valid JSON matching the provided schema. No commentary, no markdown, no explanations — only the JSON object. Be specific, data-driven, and avoid generic business platitudes. Every insight must be tailored to the specific industry, location, and company data provided.`;
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${prompt}\n\nSchema:\n${JSON.stringify(schema)}\n\nContext:\n${context.join('\n')}`,
    },
  ];
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.3;

  const baselineCtx = { INDUSTRY, BUSINESS_MODEL, LOCATION, tenantStats, searchResults };

  const llm = await callLLM({ messages, temperature, tenantId, body });

  if (!llm || !llm.ok) {
    const isKeyError = /api key|not configured/i.test(llm?.error || '');
    if (isKeyError) {
      return {
        insights: buildBaseline(baselineCtx),
        model: null,
        provider: null,
        usage: null,
        fallback: true,
      };
    }
    throw new Error(llm?.error || 'LLM synthesis failed');
  }

  let insights = null;
  try {
    insights = JSON.parse(llm.content || 'null');
  } catch {
    insights = null;
  }
  const fallback = !insights;
  if (!insights) insights = buildBaseline(baselineCtx);

  return {
    insights,
    model: llm.model ?? null,
    provider: llm.provider ?? null,
    usage: llm.usage ?? null,
    fallback,
  };
}

export default { synthesizeMarketInsights, buildInsightsSchema, buildBaseline, defaultCallLLM };
