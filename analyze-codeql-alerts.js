const { execSync } = require('child_process');

try {
  // Fetch open alerts on main branch
  const cmd =
    'gh api "repos/andreibyf/aishacrm-2/code-scanning/alerts?state=open&ref=refs/heads/main&per_page=100"';
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  const alerts = JSON.parse(output);

  console.log(`\n📊 Total open alerts: ${alerts.length}\n`);

  // Group by severity
  const bySeverity = alerts.reduce((acc, alert) => {
    const severity = alert.rule.severity;
    if (!acc[severity]) acc[severity] = [];
    acc[severity].push(alert);
    return acc;
  }, {});

  // Show ERROR-level alerts
  if (bySeverity.error) {
    console.log(`\n🚨 ERROR-LEVEL ALERTS (${bySeverity.error.length}):\n`);

    // Group by rule
    const byRule = bySeverity.error.reduce((acc, alert) => {
      const ruleId = alert.rule.id;
      if (!acc[ruleId]) {
        acc[ruleId] = {
          description: alert.rule.description,
          alerts: [],
        };
      }
      acc[ruleId].alerts.push(alert);
      return acc;
    }, {});

    // Display each rule with file locations
    Object.entries(byRule).forEach(([ruleId, data]) => {
      console.log(`\n${ruleId} (${data.alerts.length} occurrences)`);
      console.log(`${data.description}`);
      console.log('─'.repeat(80));

      // Show first 10 locations for each rule
      data.alerts.slice(0, 10).forEach((alert) => {
        const loc = alert.most_recent_instance?.location;
        if (loc) {
          console.log(`  #${alert.number}: ${loc.path}:${loc.start_line}`);
        }
      });

      if (data.alerts.length > 10) {
        console.log(`  ... and ${data.alerts.length - 10} more`);
      }
    });
  }

  // Show WARNING-level summary
  if (bySeverity.warning) {
    console.log(`\n\n⚠️  WARNING-LEVEL ALERTS (${bySeverity.warning.length}):\n`);

    const warningByRule = bySeverity.warning.reduce((acc, alert) => {
      const ruleId = alert.rule.id;
      acc[ruleId] = (acc[ruleId] || 0) + 1;
      return acc;
    }, {});

    Object.entries(warningByRule)
      .sort((a, b) => b[1] - a[1])
      .forEach(([ruleId, count]) => {
        console.log(`  ${ruleId}: ${count}`);
      });
  }
} catch (error) {
  console.error('Error:', error.message);
  if (error.stderr) console.error(error.stderr.toString());
  process.exit(1);
}
