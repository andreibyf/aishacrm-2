#!/usr/bin/env node
/**
 * Test GitHub Issue Auto-Creation
 * Triggers a simulated 500 error to verify GitHub issue creation
 */

import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';

async function testGitHubIssueCreation() {
  console.log('🧪 Testing GitHub Issue Auto-Creation\n');
  console.log(`Backend: ${BACKEND_URL}`);
  console.log('Endpoint: POST /api/testing/trigger-error-500\n');

  try {
    const response = await fetch(`${BACKEND_URL}/api/testing/trigger-error-500`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        create_github_issue: true,
        error_type: 'test-auto-creation',
        component: 'testing-endpoint',
        severity: 'low'
      })
    });

    const result = await response.json();

    console.log('📊 Response Status:', response.status);
    console.log('📄 Response Body:', JSON.stringify(result, null, 2));

    if (result.github_issue) {
      console.log('\n🎯 GitHub Issue Details:');
      
      if (result.github_issue.created) {
        console.log('✅ GitHub issue created successfully!');
        console.log(`   Issue #${result.github_issue.issue_number}`);
        console.log(`   URL: ${result.github_issue.issue_url}`);
      } else if (result.github_issue.suppressed) {
        console.log('⏭️  GitHub issue creation suppressed (duplicate detected)');
        console.log(`   Existing Issue #${result.github_issue.issue_number}`);
        console.log(`   URL: ${result.github_issue.issue_url}`);
        console.log(`   Message: ${result.github_issue.message}`);
      } else if (result.github_issue.error) {
        console.log('❌ GitHub issue creation failed');
        console.log(`   Error: ${result.github_issue.error}`);
        console.log(`   Message: ${result.github_issue.message}`);
      } else if (result.github_issue.skipped) {
        console.log('⏭️  GitHub issue creation skipped (not requested)');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testGitHubIssueCreation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
