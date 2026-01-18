#!/bin/bash
# Generate events and inject them one by one into the sidecar
# This ensures file system events are triggered for the tail watcher
# and provides a nice staggered arrival for visualization testing.

node scripts/maintenance/emit_viz_test_events.js "$@" | while read line; do
  # Escape single quotes if any (though JSON usually uses double quotes)
  clean_line=$(echo "$line" | sed "s/'/'\\\\''/g")
  
  echo "Injecting event..."
  docker exec aisha-telemetry-sidecar sh -c "echo '$clean_line' >> /telemetry/telemetry.ndjson"
  
  # Small delay to let viz animate
  sleep 1
done
