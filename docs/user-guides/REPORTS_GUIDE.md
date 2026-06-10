# Reports & Analytics - User Guide

The Reports & Analytics page gives you a range of reports to visualize your CRM data and understand business performance. This guide covers accessing reports, the available report types, filtering, and exporting.

## Accessing the page

1. Make sure you're logged into AiSHA CRM.
2. Open **Reports & Analytics** from the navigation.
3. **Select a tenant first.** Before any reports will load, use the **Select a Tenant** dropdown and choose the tenant whose data you want to analyze. (You'll be prompted to log in / select a tenant if you haven't.)

## Report types

The page is organized into tabs, each a different type of report:

- **Overview** — a high-level summary of key metrics across your CRM.
- **Sales Analytics** — sales performance, including revenue and opportunities.
- **Lead Analytics** — lead generation and conversion.
- **Productivity** — user activity and performance within the CRM.
- **Forecasting** — predictive analytics based on historical data.
- **Data Quality** — issues and inconsistencies found in your data.
- **AI Insights (Market Intelligence)** — a full market-intelligence report for the selected tenant: executive summary, market overview, SWOT, competitive landscape, industry trends, major news, strategic recommendations, and key economic indicators. Click **Generate Insight** to start a single background run that produces **both** this report **and** the scored growth opportunities (shown on the Opportunities tab). While it runs you'll see an approximate time, and the report appears **automatically** when it's ready — no need to refresh or leave the page (you also get a notification). Recommendations are always framed around your own CRM's capabilities, never "switch to a competitor tool". Demand phrasing is directional ("interest appears to be rising") — never raw search counts. Limited to once every 7 days (administrators can run on demand). Use **Edit market scope** to set the services, regions, and competitors the report and opportunities focus on — you'll get a "Market scope saved" confirmation.
- **Opportunities** — scored, directional growth opportunities (geographic, service, content, reputation) produced by the latest insight run, each with a recommended action you can take or dismiss. **Each new Generate replaces this list with a fresh set**, so it always reflects your most recent run. Opportunities are generated from the **AI Insights** tab (there's no separate button here).
- **Custom Query** — build and run your own tailored report.

## Viewing and filtering a report

1. Select the report type you want from the tabs.
2. The report loads automatically for the selected tenant.
3. To include or exclude **test data**, use the filter option on the report.

## Exporting a report

1. Open the report you want to export and click **Export**.
2. While it runs, you'll see "Exporting…".
3. Choose your format: **CSV** or **PDF**.
4. If the export fails you may see "Failed to generate PDF" or "Unknown export error" — try again or contact your AiSHA CRM administrator.

**Market Intelligence PDF:** exporting from **either** the AI Insights or the Opportunities tab produces the same unified PDF — the full market-intelligence report **plus** a Growth Opportunities section. Generate an insight first; if nothing has been generated yet you'll be prompted to do so.

## Tips

- The **AI Insights** report surfaces analysis automatically — a quick way to spot trends without building a query.
- Review the **Data Quality** report regularly to catch missing or inconsistent records and keep your other reports accurate.
