import { useState, useCallback, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Account } from "@/api/entities";
import { useUser } from "@/components/shared/useUser.js";
import { Loader2, Plus } from "lucide-react";
import { useApiManager } from "./ApiManager";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LazyAccountSelector({
  value,
  onChange,
  onValueChange, // Support both prop names for backward compatibility
  onCreateNew,
  placeholder = "Select account...",
  className = "",
  contentClassName = "",
  itemClassName = "",
  disabled = false
}) {
  // Use onChange if provided, otherwise fall back to onValueChange (memoized to prevent race conditions)
  const handleChange = useMemo(() => onChange || onValueChange, [onChange, onValueChange]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const { cachedRequest } = useApiManager();

  // Only load when dropdown opens
  const { user: contextUser } = useUser();

  const loadAccounts = useCallback(async () => {
    if (loaded) return; // Already loaded
    
    setLoading(true);
    setError(null);

    try {
      const tenantId = contextUser?.tenant_id;

      if (!tenantId) {
        setError("No tenant assigned");
        setAccounts([]);
        setLoaded(true);
        return;
      }

      // Load only first 50 accounts, sorted by name
      const accData = await cachedRequest(
        'Account',
        'filter',
        { filter: { tenant_id: tenantId }, sort: 'name', limit: 50 },
        () => Account.filter({ tenant_id: tenantId }, 'name', 50)
      );

      setAccounts(accData || []);
      setLoaded(true);
    } catch (err) {
      console.warn("Failed to load accounts:", err);
      setError(err.message || "Failed to load");
      setAccounts([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [loaded, cachedRequest, contextUser?.tenant_id]);

  const handleOpenChange = (isOpen) => {
    setOpen(isOpen);
    if (isOpen && !loaded) {
      loadAccounts();
    }
  };

  const filteredAccounts = searchTerm
    ? accounts.filter(acc => 
        acc.name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : accounts;

  const displayValue = value 
    ? accounts.find(a => a.id === value)?.name || "Unknown Account"
    : placeholder;

  return (
    <Select
      value={value || ''}
      onValueChange={handleChange}
      disabled={disabled}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {displayValue}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName} position="popper" sideOffset={4}>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="px-2 py-6 text-center text-sm text-red-400">
            {error}
          </div>
        ) : (
          <>
            {/* Search Box */}
            <div className="p-2 border-b border-slate-700">
              <Input
                placeholder="Search accounts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 bg-slate-700 border-slate-600 text-slate-200"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Create New Option */}
            {onCreateNew && searchTerm && (
              <div className="p-2 border-b border-slate-700">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateNew(searchTerm);
                    setOpen(false);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create &quot;{searchTerm}&quot;
                </Button>
              </div>
            )}

            {/* Accounts List */}
            <div className="max-h-[300px] overflow-y-auto">
              <SelectItem value={null} className={itemClassName}>
                <span className="italic text-slate-500">No account</span>
              </SelectItem>
              
              {filteredAccounts.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-slate-500">
                  {searchTerm ? "No accounts found" : "No accounts available"}
                </div>
              ) : (
                filteredAccounts.map((acc) => (
                  <SelectItem
                    key={acc.id}
                    value={acc.id}
                    className={itemClassName}
                  >
                    <div className="flex flex-col">
                      <span>{acc.name}</span>
                      {acc.industry && (
                        <span className="text-xs text-slate-500">
                          {acc.industry.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </div>

            {accounts.length >= 50 && (
              <div className="p-2 text-xs text-center text-slate-500 border-t border-slate-700">
                Showing first 50 accounts. Use search to find more.
              </div>
            )}
          </>
        )}
      </SelectContent>
    </Select>
  );
}