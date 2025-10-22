
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  TrendingUp,
  Loader2,
  Lightbulb,
  AlertCircle,
  Target,
  RefreshCw,
  Building2,
  AlertTriangle,
  Shield,
  Zap,
  TrendingDown,
  Globe,
  Newspaper,
  CheckCircle,
  XCircle
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const INDUSTRY_LABELS = {
  accounting_and_finance: "Accounting & Finance",
  aerospace_and_defense: "Aerospace & Defense",
  agriculture_and_farming: "Agriculture & Farming",
  automotive_and_transportation: "Automotive & Transportation",
  banking_and_financial_services: "Banking & Financial Services",
  biotechnology_and_pharmaceuticals: "Biotechnology & Pharmaceuticals",
  chemicals_and_materials: "Chemicals & Materials",
  construction_and_engineering: "Construction & Engineering",
  consulting_and_professional_services: "Consulting & Professional Services",
  consumer_goods_and_retail: "Consumer Goods & Retail",
  cybersecurity: "Cybersecurity",
  data_analytics_and_business_intelligence: "Data Analytics & Business Intelligence",
  education_and_training: "Education & Training",
  energy_oil_and_gas: "Energy, Oil & Gas",
  entertainment_and_media: "Entertainment & Media",
  environmental_services: "Environmental Services",
  event_management: "Event Management",
  fashion_and_apparel: "Fashion & Apparel",
  food_and_beverage: "Food & Beverage",
  franchising: "Franchising",
  gaming_and_esports: "Gaming & Esports",
  government_and_public_sector: "Government & Public Sector",
  green_energy_and_solar: "Green Energy & Solar",
  healthcare_and_medical_services: "Healthcare & Medical Services",
  hospitality_and_tourism: "Hospitality & Tourism",
  human_resources_and_staffing: "Human Resources & Staffing",
  information_technology_and_software: "Information Technology & Software",
  insurance: "Insurance",
  interior_design_and_architecture: "Interior Design & Architecture",
  legal_services: "Legal Services",
  logistics_and_supply_chain: "Logistics & Supply Chain",
  manufacturing_industrial: "Manufacturing (Industrial)",
  marketing_advertising_and_pr: "Marketing, Advertising & PR",
  mining_and_metals: "Mining & Metals",
  nonprofit_and_ngos: "Nonprofit & NGOs",
  packaging_and_printing: "Packaging & Printing",
  pharmaceuticals: "Pharmaceuticals",
  real_estate_and_property_management: "Real Estate & Property Management",
  renewable_energy: "Renewable Energy",
  research_and_development: "Research & Development",
  retail_and_wholesale: "Retail & Wholesale",
  robotics_and_automation: "Robotics & Automation",
  saas_and_cloud_services: "SaaS & Cloud Services",
  security_services: "Security Services",
  social_media_and_influencer: "Social Media & Influencer",
  sports_and_recreation: "Sports & Recreation",
  telecommunications: "Telecommunications",
  textiles_and_apparel: "Textiles & Apparel",
  transportation_and_delivery: "Transportation & Delivery",
  utilities_water_and_waste: "Utilities (Water & Waste)",
  veterinary_services: "Veterinary Services",
  warehousing_and_distribution: "Warehousing & Distribution",
  wealth_management: "Wealth Management",
  other: "Other"
};

const GEOGRAPHIC_LABELS = {
  north_america: "North America",
  europe: "Europe",
  asia: "Asia",
  south_america: "South America",
  africa: "Africa",
  oceania: "Oceania",
  global: "Global"
};

export default function AIMarketInsights({ tenant }) {
  const [generating, setGenerating] = useState(false);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);

  // Helper function to format large numbers with B/M/K suffixes
  const formatLargeNumber = (num) => {
    if (num === null || num === undefined || typeof num !== 'number' || isNaN(num)) return num;

    if (Math.abs(num) >= 1e9) {
      return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    } else if (Math.abs(num) >= 1e6) {
      return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    } else if (Math.abs(num) >= 1e3) {
      return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toFixed(1);
  };

  // Helper to format display value with unit
  const formatDisplayValue = (value, unit) => {
    if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) return value;

    if (unit && typeof unit === 'string') {
      const lowerUnit = unit.toLowerCase();
      if (lowerUnit.includes('usd') || lowerUnit.includes('dollar')) {
        return '$' + formatLargeNumber(value);
      } else if (lowerUnit.includes('percent') || lowerUnit === '%') {
        return value.toFixed(1) + ' %';
      } else if (lowerUnit.includes('job')) {
        return value.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' jobs';
      } else if (lowerUnit.includes('index')) {
        return Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' index';
      } else if (lowerUnit.includes('unit')) {
        return value.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' units';
      }
    }
    // Default formatting if no specific unit match
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (unit ? ' ' + unit : '');
  };

  const handleGenerateInsights = async () => {
    if (!tenant?.industry) {
      setError("No industry configured for the selected organization. Please update tenant settings.");
      return;
    }

    setGenerating(true);
    setError(null);
    setInsights(null);

    try {
      const industryLabel = INDUSTRY_LABELS[tenant.industry] || tenant.industry;
      const businessModel = tenant.business_model || "B2B";
      const geographicFocus = GEOGRAPHIC_LABELS[tenant.geographic_focus] || "North America";

      // Build location string with increasing specificity
      let locationContext = geographicFocus;
      if (tenant.country) {
        locationContext = tenant.country;
        if (tenant.major_city) {
          locationContext = `${tenant.major_city}, ${tenant.country}`;
        }
      }

      console.log('Generating insights for:', { industryLabel, businessModel, locationContext });

      const prompt = `You are an expert market research analyst. Provide a comprehensive, data-driven market analysis for a company operating in the ${industryLabel} industry.

**Company Context:**
- Industry: ${industryLabel}
- Business Model: ${businessModel}
- Location: ${locationContext}
- Company: ${tenant.name || "A company"}

**Generate a detailed analysis with the following sections:**

1. **Market Overview**: A brief summary of the current state and size of the ${industryLabel} market in ${locationContext}.
2. **SWOT Analysis**:
   - Strengths: 3-5 key strengths for companies in this industry/location
   - Weaknesses: 3-5 common weaknesses or vulnerabilities
   - Opportunities: 3-5 emerging growth opportunities
   - Threats: 3-5 external threats or challenges
3. **Competitive Landscape**: Analysis of major competitors, market share distribution, and competitive advantages in ${locationContext}.
4. **Major News & Events**: 3-5 recent significant news items or events affecting the ${industryLabel} industry in ${locationContext} (last 6 months).
5. **Strategic Recommendations**: 3-5 actionable recommendations based on current market conditions and data for a company in this space.
6. **Economic Indicators**: Key economic data points relevant to this industry (provide 5 data points with values for trending charts).

Ensure the output is specific to ${locationContext} and the ${industryLabel} industry. Format perfectly as JSON according to the schema.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            market_overview: { type: "string" },
            swot_analysis: {
              type: "object",
              properties: {
                strengths: { type: "array", items: { type: "string" } },
                weaknesses: { type: "array", items: { type: "string" } },
                opportunities: { type: "array", items: { type: "string" } },
                threats: { type: "array", items: { type: "string" } }
              },
              required: ["strengths", "weaknesses", "opportunities", "threats"]
            },
            competitive_landscape: {
              type: "object",
              properties: {
                overview: { type: "string" },
                major_competitors: { type: "array", items: { type: "string" } },
                market_dynamics: { type: "string" }
              },
              required: ["overview", "major_competitors"]
            },
            major_news: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  date: { type: "string" },
                  impact: { type: "string", enum: ["positive", "negative", "neutral"] }
                },
                required: ["title", "description", "date", "impact"]
              }
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "string", enum: ["high", "medium", "low"] }
                },
                required: ["title", "description", "priority"]
              }
            },
            economic_indicators: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  current_value: { type: "number" },
                  trend: { type: "string", enum: ["up", "down", "stable"] },
                  unit: { type: "string" }
                },
                required: ["name", "current_value", "trend", "unit"]
              }
            }
          },
          required: ["market_overview", "swot_analysis", "competitive_landscape", "major_news", "recommendations", "economic_indicators"]
        }
      });

      console.log('LLM Response:', response);

      // InvokeLLM returns data directly when response_json_schema is provided
      if (response && typeof response === 'object') {
        setInsights(response);
      } else {
        setError("Failed to generate insights. Please try again.");
      }
    } catch (error) {
      console.error("Error generating AI insights:", error);
      setError(error.message || "An error occurred while generating insights.");
    } finally {
      setGenerating(false);
    }
  };

  if (!tenant) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">No Tenant Selected</h3>
          <p className="text-slate-400">Please select a tenant to view AI market insights.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
            AI Market Insights for {tenant.name}
          </span>
          <Button
            onClick={handleGenerateInsights}
            disabled={generating || !tenant?.industry}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate Insights
              </>
            )}
          </Button>
        </CardTitle>
        <p className="text-slate-400 mt-2">
          AI-powered market analysis for <span className="font-semibold text-slate-200">{tenant.name}</span>
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {tenant.industry && (
            <Badge className="bg-blue-900/30 text-blue-300 border border-blue-700/50">
              {INDUSTRY_LABELS[tenant.industry] || tenant.industry}
            </Badge>
          )}
          {tenant.business_model && (
            <Badge className="bg-purple-900/30 text-purple-300 border border-purple-700/50">
              {tenant.business_model.toUpperCase()}
            </Badge>
          )}
          {tenant.geographic_focus && (
            <Badge className="bg-green-900/30 text-green-300 border border-green-700/50">
              <Globe className="w-3 h-3 mr-1" />
              {GEOGRAPHIC_LABELS[tenant.geographic_focus] || tenant.geographic_focus}
            </Badge>
          )}
          {tenant.country && (
            <Badge className="bg-orange-900/30 text-orange-300 border border-orange-700/50">
              <Globe className="w-3 h-3 mr-1" />
              {tenant.country}
            </Badge>
          )}
          {tenant.major_city && (
            <Badge className="bg-teal-900/30 text-teal-300 border border-teal-700/50">
              <Building2 className="w-3 h-3 mr-1" />
              {tenant.major_city}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6" data-ai-insights={insights ? JSON.stringify(insights) : null}>
        {error && (
          <Alert className="bg-red-900/20 border-red-700/50">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">{error}</AlertDescription>
          </Alert>
        )}

        {!tenant?.industry && !generating && (
          <Alert className="bg-yellow-900/20 border-yellow-700/50">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-300">
              Please configure an industry for this organization in tenant settings to generate AI insights.
            </AlertDescription>
          </Alert>
        )}

        {!insights && !generating && tenant?.industry && (
          <div className="text-center py-12 text-slate-400">
            <Lightbulb className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Click "Generate Insights" to analyze current market conditions</p>
            {tenant.major_city && tenant.country && (
              <p className="text-sm mt-2">
                Analysis will be focused on: {tenant.major_city}, {tenant.country}
              </p>
            )}
            {!tenant.major_city && tenant.country && (
              <p className="text-sm mt-2">
                Analysis will be focused on: {tenant.country}
              </p>
            )}
            {!tenant.country && tenant.geographic_focus && (
              <p className="text-sm mt-2">
                Analysis will be focused on: {GEOGRAPHIC_LABELS[tenant.geographic_focus] || tenant.geographic_focus}
              </p>
            )}
          </div>
        )}

        {insights && (
          <div className="space-y-6">
            {/* Market Overview */}
            {insights.market_overview && (
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-300 mb-2 flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Market Overview
                </h3>
                <p className="text-slate-300 leading-relaxed">{insights.market_overview}</p>
              </div>
            )}

            {/* SWOT Analysis */}
            {insights.swot_analysis && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                {insights.swot_analysis.strengths && insights.swot_analysis.strengths.length > 0 && (
                  <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-lg p-4">
                    <h4 className="font-semibold text-green-300 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Strengths
                    </h4>
                    <ul className="space-y-2">
                      {insights.swot_analysis.strengths.map((item, idx) => (
                        <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                          <span className="text-green-400 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Weaknesses */}
                {insights.swot_analysis.weaknesses && insights.swot_analysis.weaknesses.length > 0 && (
                  <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 border border-red-700/50 rounded-lg p-4">
                    <h4 className="font-semibold text-red-300 mb-3 flex items-center gap-2">
                      <XCircle className="w-5 h-5" />
                      Weaknesses
                    </h4>
                    <ul className="space-y-2">
                      {insights.swot_analysis.weaknesses.map((item, idx) => (
                        <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Opportunities */}
                {insights.swot_analysis.opportunities && insights.swot_analysis.opportunities.length > 0 && (
                  <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 border border-cyan-700/50 rounded-lg p-4">
                    <h4 className="font-semibold text-cyan-300 mb-3 flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Opportunities
                    </h4>
                    <ul className="space-y-2">
                      {insights.swot_analysis.opportunities.map((item, idx) => (
                        <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                          <span className="text-cyan-400 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Threats */}
                {insights.swot_analysis.threats && insights.swot_analysis.threats.length > 0 && (
                  <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-700/50 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-300 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Threats
                    </h4>
                    <ul className="space-y-2">
                      {insights.swot_analysis.threats.map((item, idx) => (
                        <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                          <span className="text-orange-400 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Competitive Landscape */}
            {insights.competitive_landscape && (
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-purple-300 mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Competitive Landscape
                </h3>
                {insights.competitive_landscape.overview && (
                  <p className="text-slate-300 mb-3">{insights.competitive_landscape.overview}</p>
                )}
                {insights.competitive_landscape.major_competitors && insights.competitive_landscape.major_competitors.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-purple-200 mb-2">Major Competitors:</h4>
                    <div className="flex flex-wrap gap-2">
                      {insights.competitive_landscape.major_competitors.map((comp, idx) => (
                        <Badge key={idx} className="bg-purple-800/50 text-purple-200 border-purple-600">
                          {comp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {insights.competitive_landscape.market_dynamics && (
                  <p className="text-slate-300 text-sm mt-3">{insights.competitive_landscape.market_dynamics}</p>
                )}
              </div>
            )}

            {/* Major News & Events */}
            {insights.major_news && insights.major_news.length > 0 && (
              <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 border border-indigo-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-indigo-300 mb-3 flex items-center gap-2">
                  <Newspaper className="w-5 h-5" />
                  Major News & Events
                </h3>
                <div className="space-y-3">
                  {insights.major_news.map((news, idx) => (
                    <div key={idx} className="bg-slate-800/50 rounded p-3 border border-slate-700">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-medium text-slate-200">{news.title}</h4>
                        {news.impact && (
                          <Badge
                            className={
                              news.impact === 'positive' ? 'bg-green-800/50 text-green-200 border-green-600' :
                              news.impact === 'negative' ? 'bg-red-800/50 text-red-200 border-red-600' :
                              'bg-slate-700 text-slate-300 border-slate-600'
                            }
                          >
                            {news.impact}
                          </Badge>
                        )}
                      </div>
                      {news.date && <p className="text-sm text-slate-400 mb-1">{news.date}</p>}
                      {news.description && <p className="text-sm text-slate-300">{news.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Economic Indicators Chart - UPDATED */}
            {insights.economic_indicators && insights.economic_indicators.length > 0 && (
              <div className="bg-gradient-to-br from-teal-900/30 to-teal-800/20 border border-teal-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-teal-300 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Key Economic Indicators
                </h3>

                {/* Chart removed - replaced with indicator cards only */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {insights.economic_indicators.map((indicator, idx) => {
                    const displayValue = formatDisplayValue(indicator.current_value, indicator.unit);

                    return (
                      <div key={idx} className="bg-slate-800/50 rounded p-3 border border-slate-700">
                        <div className="flex items-start justify-between mb-1">
                          <span className="text-sm font-medium text-slate-300">{indicator.name}</span>
                          {indicator.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-400" />}
                          {indicator.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
                          {indicator.trend === 'stable' && <span className="text-xs text-slate-500">→</span>}
                        </div>
                        <p className="text-lg font-semibold text-teal-300">
                          {displayValue}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strategic Recommendations */}
            {insights.recommendations && insights.recommendations.length > 0 && (
              <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border border-amber-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-amber-300 mb-3 flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Strategic Recommendations
                </h3>
                <div className="space-y-3">
                  {insights.recommendations.map((rec, idx) => (
                    <div key={idx} className="bg-slate-800/50 rounded p-3 border border-slate-700">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-medium text-slate-200">{rec.title}</h4>
                        {rec.priority && (
                          <Badge
                            className={
                              rec.priority === 'high' ? 'bg-red-800/50 text-red-200 border-red-600' :
                              rec.priority === 'medium' ? 'bg-yellow-800/50 text-yellow-200 border-yellow-600' :
                              'bg-blue-800/50 text-blue-200 border-blue-600'
                            }
                          >
                            {rec.priority}
                          </Badge>
                        )}
                      </div>
                      {rec.description && <p className="text-sm text-slate-300">{rec.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
