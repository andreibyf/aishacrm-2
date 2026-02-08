import { defineConfig } from "@playwright/test"
import path from "path"

export default defineConfig({
  testDir: "../tests",
  resolveSnapshotPath: (testPath, snapshotExtension) =>
    path.join(path.dirname(testPath), "__snapshots__", path.basename(testPath) + snapshotExtension),
  use: {
    baseURL: "http://localhost:4000"
  }
})
