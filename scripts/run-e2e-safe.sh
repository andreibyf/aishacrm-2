#!/bin/bash
# Run Playwright E2E tests file-by-file with per-file timeout
# Playwright has built-in timeouts but this ensures no file hangs forever

TIMEOUT_SECONDS=120  # E2E tests need more time
RESULTS_DIR="./test-results/e2e"
FAILED_FILE="$RESULTS_DIR/failed-tests.txt"
SKIPPED_FILE="$RESULTS_DIR/skipped-tests.txt"
PASSED_FILE="$RESULTS_DIR/passed-tests.txt"
FAILURE_DETAILS="$RESULTS_DIR/failure-details.txt"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Clear previous results
> "$FAILED_FILE"
> "$SKIPPED_FILE"
> "$PASSED_FILE"
> "$FAILURE_DETAILS"

# Find all test files
TEST_FILES=$(find tests/e2e -name "*.spec.ts" -o -name "*.spec.js" 2>/dev/null | sort)

TOTAL=$(echo "$TEST_FILES" | wc -l)
CURRENT=0
PASSED=0
FAILED=0
TIMED_OUT=0

echo "=========================================="
echo "Running $TOTAL E2E test files"
echo "Timeout: ${TIMEOUT_SECONDS}s per file"
echo "=========================================="
echo ""

for FILE in $TEST_FILES; do
    CURRENT=$((CURRENT + 1))
    BASENAME=$(basename "$FILE")
    
    printf "[%2d/%2d] %-45s " "$CURRENT" "$TOTAL" "$BASENAME"
    
    # Run test with timeout
    START_TIME=$(date +%s)
    timeout "$TIMEOUT_SECONDS" npx playwright test "$FILE" --reporter=line 2>&1 > /tmp/test-output.txt
    EXIT_CODE=$?
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    if [ $EXIT_CODE -eq 124 ]; then
        # Timeout
        echo "⏱️  TIMEOUT (${DURATION}s)"
        echo "$FILE" >> "$SKIPPED_FILE"
        TIMED_OUT=$((TIMED_OUT + 1))
    elif [ $EXIT_CODE -eq 0 ]; then
        # Passed
        echo "✅ PASS (${DURATION}s)"
        echo "$FILE" >> "$PASSED_FILE"
        PASSED=$((PASSED + 1))
    else
        # Failed
        echo "❌ FAIL (${DURATION}s)"
        echo "$FILE" >> "$FAILED_FILE"
        echo "=== $FILE ===" >> "$FAILURE_DETAILS"
        cat /tmp/test-output.txt >> "$FAILURE_DETAILS"
        echo "" >> "$FAILURE_DETAILS"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "=========================================="
echo "E2E TEST SUMMARY"
echo "=========================================="
echo "Total:     $TOTAL"
echo "Passed:    $PASSED ✅"
echo "Failed:    $FAILED ❌"
echo "Timed out: $TIMED_OUT ⏱️"
echo ""
echo "Results written to:"
echo "  - $PASSED_FILE"
echo "  - $FAILED_FILE"
echo "  - $SKIPPED_FILE"
if [ -s "$FAILURE_DETAILS" ]; then
    echo "  - $FAILURE_DETAILS"
fi
