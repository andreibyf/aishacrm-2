import { useEffect } from "react";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export default function OperationOverlay(
  {
    open,
    title = "Working...",
    subtitle,
    details,
    progressCurrent,
    progressTotal,
  },
) {
  if (!open) return null;

  const hasProgress = typeof progressCurrent === "number" &&
    typeof progressTotal === "number" && progressTotal > 0;
  const percent = hasProgress
    ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100))
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full text-center shadow-2xl">
        <div className="flex items-center justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-slate-700/60 flex items-center justify-center">
            <Loader2
              className={`h-6 w-6 text-blue-400 ${
                hasProgress ? "" : "animate-spin"
              }`}
            />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        {details && <p className="mt-2 text-xs text-slate-500">{details}</p>}

        <div className="mt-5">
          {hasProgress
            ? (
              <div>
                <div className="w-full h-2 bg-slate-700 rounded overflow-hidden">
                  <div
                    className="h-2 bg-blue-500 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {progressCurrent} / {progressTotal} ({percent}%)
                </div>
              </div>
            )
            : (
              <div className="h-1 w-full bg-slate-700 rounded overflow-hidden">
                <div className="h-1 w-full bg-blue-500/60 animate-pulse" />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
