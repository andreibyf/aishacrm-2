import { useState, useCallback, useMemo, useEffect } from "react";
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
  newlyCreatedAccount = null, // Newly created account to add to list immediately
  placeholder = "Select account...",
  className = "",
  contentClassName = "",
  itemClassName = "",
  disabled = false,
  tenantFilter = null,
}) {
  // Use onChange if provided, otherwise fall back to onValueChange (memoized to prevent race conditions)
  const handleChange = useMemo(() => onChange || onValueChange, [onChange, onValueChange]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedAccountLabel, setSelectedAccountLabel] = useState("");
  const { cachedRequest } = useApiManager();

  // Only load when dropdown opens
  const { user: contextUser } = useUser();

  // When a newly created account is passed, add it to the list immediately and update label
  useEffect(() => {
    if (newlyCreatedAccount && newlyCreatedAccount.id) {
      setAccounts((prev) => {
        // Don't add duplicate
        if (prev.some((acc) => acc.id === newlyCreatedAccount.id)) return prev;
        return [newlyCreatedAccount, ...prev];
      });
      // Update the label if this is the selected account
      if (value === newlyCreatedAccount.id) {
        setSelectedAccountLabel(newlyCreatedAccount.name || "Unknown Account");
      }
    }
  }, [newlyCreatedAccount, value]);

  const resolvedTenantFilter = useMemo(() => {
    if (tenantFilter && typeof tenantFilter === 'object' && Object.keys(tenantFilter).length > 0) {
      return tenantFilter;
    }
    if (contextUser?.tenant_id) {
      return { tenant_id: contextUser.tenant_id };
    }
    return null;
  }, [tenantFilter, contextUser?.tenant_id]);

  const loadAccounts = useCallback(async () => {
    if (loaded) return; // Already loaded
    
    setLoading(true);
    setError(null);

    try {
      if (!resolvedTenantFilter || !resolvedTenantFilter.tenant_id) {
        setError("No tenant selected");
        setAccounts([]);
        setLoaded(true);
        return;
      }

      // Load only first 50 accounts, sorted by name
      const accountFilter = { ...resolvedTenantFilter, limit: 50, orderBy: 'name' };
      const accData = await cachedRequest(
        'Account',
        'filter',
        { filter: accountFilter },
        () => Account.filter(accountFilter)
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
  }, [loaded, cachedRequest, resolvedTenantFilter]);

  // Ensure we always have the currently selected account hydrated so the trigger shows a label
  useEffect(() => {
    let isMounted = true;

    const ensureSelectedAccountLoaded = async () => {
      if (!value) {
        setSelectedAccountLabel("");
        return;
      }

      const existing = accounts.find((acc) => acc.id === value);
      if (existing) {
        setSelectedAccountLabel(existing.name || "Unknown Account");
        return;
      }

      if (!resolvedTenantFilter || !resolvedTenantFilter.tenant_id) {
        setSelectedAccountLabel("Unknown Account");
        return;
      }

      try {
        const singleFilter = { ...resolvedTenantFilter, id: value, limit: 1 };
        const fetched = await cachedRequest(
          'Account',
          `by-id-${value}`,
          { filter: singleFilter },
          () => Account.filter(singleFilter)
        );

        const record = Array.isArray(fetched) ? fetched[0] : fetched;
        if (!isMounted) return;

        if (record && record.id === value) {
          setAccounts((prev) => {
            if (prev.some((acc) => acc.id === record.id)) return prev;
            return [...prev, record];
          });
          setSelectedAccountLabel(record.name || "Unknown Account");
        } else {
          setSelectedAccountLabel("Unknown Account");
        }
      } catch (err) {
        if (isMounted) {
          console.warn("Failed to load selected account", err);
          setSelectedAccountLabel("Unknown Account");
        }
      }
    };

    ensureSelectedAccountLoaded();

    return () => {
      isMounted = false;
    };
  }, [value, accounts, cachedRequest, resolvedTenantFilter]);

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
    ? (accounts.find(a => a.id === value)?.name || selectedAccountLabel || "Unknown Account")
    : placeholder;

  // Handle value changes - convert "__CLEAR__" sentinel to null
  const handleValueChange = useCallback((newValue) => {
    const actualValue = newValue === "__CLEAR__" ? null : newValue;
    handleChange?.(actualValue);
  }, [handleChange]);

  return (
    <Select
      value={value || "__CLEAR__"}
      onValueChange={handleValueChange}
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
              <SelectItem value="__CLEAR__" className={itemClassName}>
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