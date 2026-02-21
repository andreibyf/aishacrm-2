/**
 * CustomQuery — PEP Natural Language Report Query Component
 *
 * Phase 3: compile + query flow
 * Phase 4: saved reports persisted to DB (pep_saved_reports), shared across tenant
 *
 * Flow:
 *  1. User types a plain English query and clicks Run
 *  2. POST /api/pep/compile → returns IR + confirmation string
 *  3. Show confirmation strip: "Showing X where Y"
 *  4. POST /api/pep/query → returns rows
 *  5. Optional: Save report → POST /api/pep/saved-reports
 *  6. Saved reports panel loads from GET /api/pep/saved-reports (tenant-shared)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Sparkles,
  Play,
  AlertCircle,
  CheckCircle,
  Loader2,
  Save,
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { getBackendUrl } from '@/api/backendUrl';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser';
import { toast } from 'react-hot-toast';

// ─── ResultsTable ─────────────────────────────────────────────────────────────

function ResultsTable({ rows }) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        No results found for this query.
      </div>
    );
  }

  // Infer columns from first row — filter out internal fields
  const HIDDEN_COLS = new Set(['tenant_id', 'metadata', 'activity_metadata', 'tags', '_fieldDef']);
  const allKeys = Object.keys(rows[0]).filter((k) => !HIDDEN_COLS.has(k));
  // Prefer to show human-facing columns first
  const PRIORITY_COLS = [
    'id',
    'first_name',
    'last_name',
    'full_name',
    'name',
    'title',
    'subject',
    'stage',
    'status',
    'type',
    'amount',
    'score',
    'assigned_to',
    'created_date',
    'due_date',
  ];
  const cols = [
    ...PRIORITY_COLS.filter((c) => allKeys.includes(c)),
    ...allKeys.filter((c) => !PRIORITY_COLS.includes(c)),
  ].slice(0, 12); // cap at 12 columns for readability

  const handleSort = (col) => {
    if (sortField === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(col);
      setSortDir('asc');
    }
  };

  const sorted = [...rows].sort((a, b) => {
    if (!sortField) return 0;
    const av = a[sortField];
    const bv = b[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const formatCell = (val) => {
    if (val == null) return <span className="text-slate-500">—</span>;
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(val).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    if (typeof val === 'number') return val.toLocaleString();
    const str = String(val);
    return str.length > 60 ? str.slice(0, 57) + '...' : str;
  };

  const labelCol = (col) => col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-slate-700/60 border-b border-slate-600">
            {cols.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                className="px-3 py-2 text-slate-300 font-medium cursor-pointer hover:text-white select-none whitespace-nowrap"
              >
                <div className="flex items-center gap-1">
                  {labelCol(col)}
                  {sortField === col ? (
                    sortDir === 'asc' ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )
                  ) : null}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              {cols.map((col) => (
                <td
                  key={col}
                  className="px-3 py-2 text-slate-300 whitespace-nowrap max-w-xs truncate"
                >
                  {formatCell(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SavedReportsList ─────────────────────────────────────────────────────────

function SavedReportsList({ tenantId, backendUrl, onLoad, refreshKey }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    fetch(`${backendUrl}/api/pep/saved-reports?tenant_id=${tenantId}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((body) => {
        if (body.status === 'success') {
          setReports(body.data || []);
        } else {
          setError(body.message || 'Failed to load saved reports.');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tenantId, backendUrl, refreshKey]);

  const handleDelete = async (id, name) => {
    try {
      const res = await fetch(`${backendUrl}/api/pep/saved-reports/${id}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await res.json();
      if (body.status === 'success') {
        setReports((prev) => prev.filter((r) => r.id !== id));
        toast.success(`Deleted "${name}".`);
      } else {
        toast.error(body.message || 'Delete failed.');
      }
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading saved reports...
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 text-sm text-center py-4">{error}</p>;
  }

  if (reports.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-4">
        No saved reports yet. Run a query and click &quot;Save Report&quot;.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {reports.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600"
        >
          <div className="min-w-0 flex-1">
            <p className="text-slate-200 text-sm font-medium truncate">{r.report_name}</p>
            <p className="text-slate-400 text-xs truncate">{r.plain_english}</p>
            <p className="text-slate-600 text-xs mt-0.5">
              Saved by {r.created_by} &middot;{' '}
              {new Date(r.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {r.run_count > 0 && ` · ${r.run_count} run${r.run_count === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            <button
              onClick={() => onLoad(r)}
              className="text-violet-400 hover:text-violet-300 text-xs px-2 py-1 rounded border border-violet-700/50 hover:border-violet-600 transition-colors"
            >
              Run
            </button>
            <button
              onClick={() => handleDelete(r.id, r.report_name)}
              className="text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CustomQuery({ tenantFilter }) {
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const BACKEND_URL = getBackendUrl();

  const tenantId = tenantFilter?.tenant_id || selectedTenantId || user?.tenant_id;

  const [source, setSource] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [compiledIr, setCompiledIr] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState(null);
  const [rowCount, setRowCount] = useState(0);
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);
  const inputRef = useRef(null);

  const handleCompile = useCallback(
    async (sourceOverride) => {
      const querySource = sourceOverride || source;
      if (!querySource.trim()) return;
      if (!tenantId) {
        setError('No tenant selected. Please select a tenant to query.');
        return;
      }

      setCompiling(true);
      setCompiledIr(null);
      setConfirmation(null);
      setError(null);
      setRows(null);

      try {
        const res = await fetch(`${BACKEND_URL}/api/pep/compile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ source: querySource, tenant_id: tenantId }),
        });

        const body = await res.json();

        if (body.status === 'clarification_required') {
          setError(body.reason || 'Could not understand your query. Please try rephrasing.');
          setCompiling(false);
          return;
        }

        if (body.status !== 'success') {
          setError(body.message || 'Compile failed.');
          setCompiling(false);
          return;
        }

        setCompiledIr(body.data.ir);
        setConfirmation(body.data.confirmation);
        setCompiling(false);

        // Auto-run the query immediately after successful compile
        await runQuery(body.data.ir, body.data.confirmation);
      } catch (err) {
        setError(`Request failed: ${err.message}`);
        setCompiling(false);
      }
    },
    [source, tenantId, BACKEND_URL],
  );

  const runQuery = useCallback(
    async (ir, confirmationStr) => {
      if (!ir || !tenantId) return;

      setQuerying(true);
      setRows(null);
      setError(null);

      try {
        const res = await fetch(`${BACKEND_URL}/api/pep/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ir, tenant_id: tenantId }),
        });

        const body = await res.json();

        if (body.status !== 'success') {
          setError(body.message || 'Query execution failed.');
          setQuerying(false);
          return;
        }

        setRows(body.data.rows);
        setRowCount(body.data.count);
        if (confirmationStr) setConfirmation(confirmationStr);
      } catch (err) {
        setError(`Query failed: ${err.message}`);
      } finally {
        setQuerying(false);
      }
    },
    [tenantId, BACKEND_URL],
  );

  const handleRerun = () => {
    if (compiledIr) runQuery(compiledIr, confirmation);
  };

  const handleSave = async () => {
    if (!saveName.trim() || !compiledIr || !tenantId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/pep/saved-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          report_name: saveName.trim(),
          plain_english: source,
          compiled_ir: compiledIr,
        }),
      });
      const body = await res.json();
      if (body.status === 'success') {
        setSaveMode(false);
        setSaveName('');
        setSavedRefreshKey((k) => k + 1);
        toast.success(`Report "${saveName.trim()}" saved.`);
      } else {
        toast.error(body.message || 'Save failed.');
      }
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    }
  };

  const handleLoadSaved = async (report) => {
    const ir = report.compiled_ir;
    const querySource = report.plain_english;
    setSource(querySource || '');
    setCompiledIr(ir);
    setConfirmation(null);
    setShowSaved(false);
    await runQuery(ir, null);
    // Record the run fire-and-forget
    fetch(`${BACKEND_URL}/api/pep/saved-reports/${report.id}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tenant_id: tenantId }),
    }).catch((err) => {
      // Non-critical: don't block user flow, but log for debugging / observability
      console.error(
        'Failed to record run for saved report:',
        report.id,
        err
      );
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCompile();
    }
  };

  const isLoading = compiling || querying;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-slate-100">Custom Query</h2>
        </div>
        <button
          onClick={() => setShowSaved((s) => !s)}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-400 transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          Saved Reports
          {showSaved ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Saved reports panel */}
      {showSaved && (
        <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Saved Reports</h3>
          <SavedReportsList
            key={savedRefreshKey}
            tenantId={tenantId}
            backendUrl={BACKEND_URL}
            onLoad={handleLoadSaved}
            refreshKey={savedRefreshKey}
          />
        </div>
      )}

      {/* Query input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question in plain English, e.g. Show me open opportunities over $50k assigned to Sarah"
            rows={2}
            disabled={isLoading}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none disabled:opacity-50"
          />
          <p className="absolute right-2 bottom-2 text-xs text-slate-600">Enter to run</p>
        </div>
        <button
          onClick={() => handleCompile()}
          disabled={isLoading || !source.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors self-start mt-0 h-[72px]"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {compiling ? 'Parsing...' : querying ? 'Running...' : 'Run'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/50 rounded-lg px-3 py-2.5 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Confirmation strip */}
      {confirmation && !error && (
        <div className="flex items-center justify-between bg-violet-900/20 border border-violet-700/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{confirmation}</span>
          </div>
          {rows !== null && (
            <span className="text-xs text-violet-400 flex-shrink-0 ml-3">
              {rowCount} {rowCount === 1 ? 'row' : 'rows'}
            </span>
          )}
        </div>
      )}

      {/* Results + save bar */}
      {rows !== null && !error && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {rowCount} {rowCount === 1 ? 'result' : 'results'}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRerun}
                disabled={querying}
                className="text-xs text-slate-400 hover:text-violet-400 transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
              {!saveMode ? (
                <button
                  onClick={() => setSaveMode(true)}
                  className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 border border-violet-700/50 hover:border-violet-600 px-2 py-1 rounded transition-colors"
                >
                  <Save className="w-3 h-3" />
                  Save Report
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder="Report name..."
                    autoFocus
                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 w-40"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!saveName.trim()}
                    className="text-xs text-violet-400 hover:text-violet-300 border border-violet-600 px-2 py-1 rounded disabled:opacity-50 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setSaveMode(false);
                      setSaveName('');
                    }}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <ResultsTable rows={rows} />
        </div>
      )}

      {/* Empty state */}
      {rows === null && !isLoading && !error && !confirmation && (
        <div className="text-center py-12 text-slate-500 text-sm">
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p>Ask a question in plain English to query your CRM data.</p>
          <p className="mt-1 text-slate-600 text-xs">
            Try: &quot;Open leads assigned to me&quot; or &quot;Opportunities closing this quarter
            over $10k&quot;
          </p>
        </div>
      )}
    </div>
  );
}
