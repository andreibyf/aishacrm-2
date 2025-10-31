import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  // CardDescription, // Reserved for future use
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, CheckCircle, FileDigit, Loader2 } from "lucide-react";
import { Account, Contact, Lead } from "@/api/entities";

export default function BackfillUniqueIdsClient({ tenantId }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const updateWithRetry = async (
    EntityClass,
    recordId,
    data,
    maxRetries = 3,
  ) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await EntityClass.update(recordId, data);
        return { success: true };
      } catch (error) {
        const isRateLimit = error?.response?.status === 429 ||
          error?.status === 429;

        if (isRateLimit && attempt < maxRetries - 1) {
          // Exponential backoff: 5s, 10s, 20s
          const waitTime = 5000 * Math.pow(2, attempt);
          console.log(
            `Rate limited. Waiting ${waitTime / 1000}s before retry ${
              attempt + 1
            }...`,
          );
          await sleep(waitTime);
          continue;
        }

        return { success: false, error: error.message };
      }
    }
    return { success: false, error: "Max retries exceeded" };
  };

  const backfillEntity = async (EntityClass, entityType, prefix) => {
    try {
      setProgress({ current: 0, total: 0 });

      // Get all records for tenant
      const allRecords = await EntityClass.filter({ tenant_id: tenantId });
      const recordsWithoutId = allRecords.filter((r) => !r.unique_id);

      if (recordsWithoutId.length === 0) {
        return {
          success: true,
          message: `All ${entityType} records already have unique_ids`,
          updated: 0,
        };
      }

      setProgress({ current: 0, total: recordsWithoutId.length });

      // Find highest existing number
      const existingIds = allRecords
        .filter((r) => r.unique_id && r.unique_id.startsWith(`${prefix}-`))
        .map((r) => {
          const parts = r.unique_id.split("-");
          const num = parseInt(parts[parts.length - 1]);
          return isNaN(num) ? 0 : num;
        });

      let nextNumber = existingIds.length > 0
        ? Math.max(...existingIds) + 1
        : 1;
      let updated = 0;
      let failed = 0;

      // Process ONE record at a time with LONG delays
      for (const record of recordsWithoutId) {
        const unique_id = `${prefix}-${String(nextNumber).padStart(6, "0")}`;

        const updateResult = await updateWithRetry(EntityClass, record.id, {
          unique_id,
        });

        if (updateResult.success) {
          updated++;
          nextNumber++;
        } else {
          failed++;
          console.error(
            `Failed to update ${entityType} ${record.id}:`,
            updateResult.error,
          );
        }

        setProgress({
          current: updated + failed,
          total: recordsWithoutId.length,
        });

        // CRITICAL: 3 second delay between EVERY update to avoid rate limits
        await sleep(3000);
      }

      return {
        success: true,
        message: `Successfully backfilled ${updated} ${entityType} records${
          failed > 0 ? ` (${failed} failed)` : ""
        }`,
        updated,
        failed,
        next_id: `${prefix}-${String(nextNumber).padStart(6, "0")}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  };

  const handleBackfill = async (entityType) => {
    setLoading(true);
    setResult(null);
    setProgress({ current: 0, total: 0 });

    try {
      let res;
      switch (entityType) {
        case "Account":
          res = await backfillEntity(Account, "Account", "ACCT");
          break;
        case "Contact":
          res = await backfillEntity(Contact, "Contact", "CONT");
          break;
        case "Lead":
          res = await backfillEntity(Lead, "Lead", "LEAD");
          break;
      }

      setResult(res);
    } catch (error) {
      setResult({
        success: false,
        message: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <FileDigit className="w-5 h-5 text-blue-400" />
          Backfill Unique IDs
        </CardTitle>
        <p className="text-slate-400 text-sm">
          Generate unique IDs (CONT-000001, ACCT-000001, LEAD-000001) for
          records that are missing them
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => handleBackfill("Account")}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading
              ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              )
              : (
                "Backfill Accounts"
              )}
          </Button>

          <Button
            onClick={() => handleBackfill("Contact")}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading
              ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              )
              : (
                "Backfill Contacts"
              )}
          </Button>

          <Button
            onClick={() => handleBackfill("Lead")}
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {loading
              ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              )
              : (
                "Backfill Leads"
              )}
          </Button>
        </div>

        {loading && progress.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Progress: {progress.current} / {progress.total}</span>
              <span>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500 italic">
              Processing slowly to avoid rate limits (3 seconds per record)...
            </p>
          </div>
        )}

        {result && (
          <div
            className={`rounded-lg p-4 ${
              result.success
                ? "bg-green-900/20 border border-green-700/50"
                : "bg-red-900/20 border border-red-700/50"
            }`}
          >
            <div className="flex items-start gap-3">
              {result.success
                ? (
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                )
                : (
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                )}
              <div className="flex-1">
                <p
                  className={result.success ? "text-green-100" : "text-red-100"}
                >
                  {result.message}
                </p>
                {result.updated > 0 && (
                  <p className="text-slate-400 text-sm mt-1">
                    Updated {result.updated} records. Next ID:{" "}
                    <code className="bg-slate-700 px-2 py-0.5 rounded">
                      {result.next_id}
                    </code>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
