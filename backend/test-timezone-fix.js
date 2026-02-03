/**
 * Test suite for timezone normalization fix
 * Validates that ISO datetime strings are properly converted to UTC
 * and that seconds are truncated from the time output
 */

// Standalone implementation for testing (copied from activities.v2.js)
const ISO_WITH_OFFSET_REGEX = /T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[-+]\d{2}:?\d{2})$/i;
const TIME_WITH_OFFSET_REGEX = /^\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[-+]\d{2}:?\d{2})$/i;

function normalizeOffsetNotation(value) {
  return value.replace(/([-+]\d{2})(\d{2})$/, '$1:$2');
}

function normalizeDueDateTimeFields(rawDueDate, rawDueTime) {
  let dueDate = typeof rawDueDate === 'string' ? rawDueDate.trim() : rawDueDate ?? null;
  let dueTime = typeof rawDueTime === 'string' ? rawDueTime.trim() : rawDueTime ?? null;
  let originalIso = null;

  if (!dueDate) {
    return { due_date: null, due_time: null, originalIso };
  }

  let isoCandidate = null;

  if (typeof dueDate === 'string' && ISO_WITH_OFFSET_REGEX.test(dueDate)) {
    // Input like "2025-11-20T14:45:00-05:00" — save full ISO for conversion, extract parts for fallback
    const fullIsoString = normalizeOffsetNotation(dueDate.replace(/\s+/g, ''));
    
    if (!dueTime) {
      const localTimeMatch = dueDate.match(/T(\d{2}):(\d{2})/);
      if (localTimeMatch) {
        dueTime = `${localTimeMatch[1]}:${localTimeMatch[2]}`;
      }
    }
    const dateMatch = dueDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      dueDate = dateMatch[1];
    }
    isoCandidate = fullIsoString; // Use the full ISO string for UTC conversion
  } else if (typeof dueDate === 'string' && dueDate.includes('T')) {
    // ISO datetime in dueDate - set as candidate for UTC conversion below
    isoCandidate = dueDate;
  }

  if (!isoCandidate && typeof dueTime === 'string' && dueTime) {
    const collapsed = normalizeOffsetNotation(dueTime.replace(/\s+/g, ''));
    if (TIME_WITH_OFFSET_REGEX.test(collapsed)) {
      let timePortion = collapsed;
      if (!/^\d{2}:\d{2}:\d{2}/.test(timePortion)) {
        timePortion = timePortion.replace(/^(\d{2}:\d{2})/, '$1:00');
      }
      if (/([-+]\d{2})(\d{2})$/.test(timePortion)) {
        timePortion = timePortion.replace(/([-+]\d{2})(\d{2})$/, '$1:$2');
      }
      if (timePortion.endsWith('Z') && !/:\d{2}Z$/i.test(timePortion)) {
        timePortion = timePortion.replace(/Z$/i, ':00Z');
      }
      isoCandidate = `${dueDate}T${timePortion}`;
    }
  }

  if (isoCandidate) {
    originalIso = isoCandidate;
    // Always convert timezone-aware ISO string to UTC for consistent storage
    const parsed = new Date(isoCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      const isoUtc = parsed.toISOString();
      const [isoDatePart, isoTimePart] = isoUtc.split('T');
      const timeMatch = isoTimePart.match(/^(\d{2}):(\d{2})/);
      if (timeMatch) {
        // Truncate seconds - return HH:MM only
        return { due_date: isoDatePart, due_time: `${timeMatch[1]}:${timeMatch[2]}`, originalIso };
      }
    }
    console.warn('[Test] Unable to parse datetime payload', { rawDueDate, rawDueTime });
  }

  if (typeof dueTime === 'string' && dueTime) {
    const match = dueTime.match(/^(\d{2}):(\d{2})/);
    if (match) {
      // Truncate seconds if present
      dueTime = `${match[1]}:${match[2]}`;
    }
  }

  return { due_date: dueDate || null, due_time: dueTime || null, originalIso };
}

// Test cases
const tests = [
  {
    name: 'EST morning time (8:00 AM EST → 13:00 UTC)',
    input: { dueDate: '2026-02-10T08:00:00-05:00', dueTime: null },
    expected: { due_date: '2026-02-10', due_time: '13:00' }
  },
  {
    name: 'EST evening time (7:00 PM EST → 00:00 UTC next day)',
    input: { dueDate: '2026-02-10T19:00:00-05:00', dueTime: null },
    expected: { due_date: '2026-02-11', due_time: '00:00' }
  },
  {
    name: 'PST time (10:00 AM PST → 18:00 UTC)',
    input: { dueDate: '2026-02-10T10:00:00-08:00', dueTime: null },
    expected: { due_date: '2026-02-10', due_time: '18:00' }
  },
  {
    name: 'UTC time (noon UTC → 12:00 UTC)',
    input: { dueDate: '2026-02-10T12:00:00Z', dueTime: null },
    expected: { due_date: '2026-02-10', due_time: '12:00' }
  },
  {
    name: 'Midnight EST (00:00 EST → 05:00 UTC)',
    input: { dueDate: '2026-02-10T00:00:00-05:00', dueTime: null },
    expected: { due_date: '2026-02-10', due_time: '05:00' }
  },
  {
    name: 'Time with seconds (should truncate)',
    input: { dueDate: '2026-02-10T14:30:45-05:00', dueTime: null },
    expected: { due_date: '2026-02-10', due_time: '19:30' } // Truncated from 19:30:45
  },
  {
    name: 'Separate date and time strings',
    input: { dueDate: '2026-02-10', dueTime: '14:30:00' },
    expected: { due_date: '2026-02-10', due_time: '14:30' } // Should truncate seconds
  },
  {
    name: 'Date only (no time)',
    input: { dueDate: '2026-02-10', dueTime: null },
    expected: { due_date: '2026-02-10', due_time: null }
  }
];

// Run tests
console.log('🧪 Testing timezone normalization fix...\n');

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  try {
    const result = normalizeDueDateTimeFields(test.input.dueDate, test.input.dueTime);
    
    // Compare results (ignore originalIso for this test)
    const matchesDate = result.due_date === test.expected.due_date;
    const matchesTime = result.due_time === test.expected.due_time;
    
    if (matchesDate && matchesTime) {
      console.log(`✅ Test ${index + 1}: ${test.name}`);
      console.log(`   Input:    ${test.input.dueDate}`);
      console.log(`   Expected: due_date="${test.expected.due_date}", due_time="${test.expected.due_time}"`);
      console.log(`   Got:      due_date="${result.due_date}", due_time="${result.due_time}"`);
      console.log('');
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: ${test.name}`);
      console.log(`   Input:    ${test.input.dueDate}`);
      console.log(`   Expected: due_date="${test.expected.due_date}", due_time="${test.expected.due_time}"`);
      console.log(`   Got:      due_date="${result.due_date}", due_time="${result.due_time}"`);
      console.log('');
      failed++;
    }
  } catch (error) {
    console.log(`❌ Test ${index + 1}: ${test.name} - ERROR`);
    console.log(`   ${error.message}`);
    console.log('');
    failed++;
  }
});

// Summary
console.log('═'.repeat(60));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.log('\n⚠️  Some tests failed. Review the timezone conversion logic.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed! Timezone fix is working correctly.');
  console.log('\n📝 Key validations:');
  console.log('   ✓ ISO datetime strings are converted to UTC');
  console.log('   ✓ Timezone offsets are properly handled');
  console.log('   ✓ Seconds are truncated (HH:MM format)');
  console.log('   ✓ Date rollovers work correctly');
  process.exit(0);
}
