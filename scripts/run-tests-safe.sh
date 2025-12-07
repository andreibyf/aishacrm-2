#!/bin/bash
# Run tests file-by-file with per-file timeout
# This prevents hanging tests from blocking the entire suite

TIMEOUT_SECONDS=45
RESULTS_DIR="./test-results"
FAILED_FILE="$RESULTS_DIR/failed-tests.txt"
SKIPPED_FILE="$RESULTS_DIR/skipped-tests.txt"
PASSED_FILE="$RESULTS_DIR/passed-tests.txt"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Clear previous results
> "$FAILED_FILE"
> "$SKIPPED_FILE"
> "$PASSED_FILE"

# Find all test files
TEST_FILES=$(find src -name "*.test.jsx" -o -name "*.test.js" -o -name "*.test.tsx" -o -name "*.test.ts" 2>/dev/null | sort)

TOTAL=$(echo "$TEST_FILES" | wc -l)
CURRENT=0
PASSED=0
FAILED=0
TIMED_OUT=0

echo "=========================================="
echo "Running $TOTAL test files with ${TIMEOUT_SECONDS}s timeout each"
echo "=========================================="
echo ""

for FILE in $TEST_FILES; do
    CURRENT=$((CURRENT + 1))
    BASENAME=$(basename "$FILE")
    
    printf "[%2d/%2d] %-50s " "$CURRENT" "$TOTAL" "$BASENAME"
    
    # Run test with timeout
    START_TIME=$(date +%s)
    timeout "$TIMEOUT_SECONDS" npx vitest run "$FILE" --no-color --reporter=dot 2>&1 > /tmp/test-output.txt
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
        echo "--- Output for $FILE ---" >> "$RESULTS_DIR/failure-details.txt"
        cat /tmp/test-output.txt >> "$RESULTS_DIR/failure-details.txt"
        echo "" >> "$RESULTS_DIR/failure-details.txt"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "=========================================="
echo "SUMMARY"
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
if [ -f "$RESULTS_DIR/failure-details.txt" ]; then
    echo "  - $RESULTS_DIR/failure-details.txt"
fi
