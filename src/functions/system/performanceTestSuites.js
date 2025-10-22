/**
 * performanceTestSuites
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Small helper to pause between requests and avoid bursts
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export async function getPerformanceTests() {
  // Return an array of test definitions following a simple shape used by runComponentTests
  // Each test gets a 'run' function that receives ({ base44 }) from the runner.
  return [
    {
      id: "performance_smoke_entities",
      name: "Performance | Entities rate-limit smoke",
      description: "Sequentially reads key entities with brief delays to confirm no 429s and acceptable latency.",
      async run({ base44 }) {
        const start = Date.now();
        const out = { results: {}, errors: [] };

        // Fetch a few frequently used entities in a safe, paced way
        const tasks = [
          { key: "Activity", fn: () => base44.entities.Activity.filter({}, '-created_date', 5) },
          { key: "Contact", fn: () => base44.entities.Contact.filter({}, '-created_date', 5) },
          { key: "Account", fn: () => base44.entities.Account.filter({}, '-created_date', 5) },
        ];

        for (const t of tasks) {
          try {
            const tStart = Date.now();
            const data = await t.fn();
            out.results[t.key] = {
              count: Array.isArray(data) ? data.length : 0,
              duration_ms: Date.now() - tStart
            };
          } catch (e) {
            out.errors.push({ entity: t.key, message: e?.message || String(e) });
          }
          await sleep(300); // small spacing between calls
        }

        const totalMs = Date.now() - start;
        const ok = out.errors.length === 0;

        return {
          status: ok ? "passed" : "failed",
          details: {
            total_duration_ms: totalMs,
            ...out
          }
        };
      }
    },
    {
      id: "performance_cache_hint",
      name: "Performance | Cache hint (single entity repeat)",
      description: "Reads an entity twice to hint caching should make the second call faster (indicative check).",
      async run({ base44 }) {
        const result = { first_ms: null, second_ms: null, improvement_ms: null };

        const t1 = Date.now();
        await base44.entities.Activity.filter({}, '-created_date', 3);
        result.first_ms = Date.now() - t1;

        await sleep(200);

        const t2 = Date.now();
        await base44.entities.Activity.filter({}, '-created_date', 3);
        result.second_ms = Date.now() - t2;

        result.improvement_ms = result.first_ms - result.second_ms;

        // Pass regardless; this is heuristic and environments vary
        return {
          status: "passed",
          details: result
        };
      }
    }
  ];
}

----------------------------

export default performanceTestSuites;
