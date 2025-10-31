import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AccountSelector({
  accounts = [], // Optional preloaded accounts list
  value, // Selected account_id
  onValueChange, // (id) => void
  placeholder = "Select account...",
  className = "",
  required = false,
  disabled = false,
}) {
  // Debug log
  useEffect(() => {
    console.log(
      "[ACCOUNT_SELECTOR_DEBUG] Accounts received:",
      accounts?.length || 0,
    );
  }, [accounts]);

  // Ensure accounts is always an array
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  return (
    <Select
      value={value || ""}
      onValueChange={onValueChange}
      disabled={disabled || safeAccounts.length === 0}
      required={required}
    >
      <SelectTrigger
        className={`${className} ${
          disabled || safeAccounts.length === 0
            ? "opacity-50 cursor-not-allowed"
            : ""
        }`}
      >
        <SelectValue
          placeholder={safeAccounts.length === 0
            ? "No accounts available"
            : placeholder}
        />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700 text-white max-h-[300px]">
        {!required && <SelectItem value={null}>-- No Account --</SelectItem>}
        {safeAccounts.length === 0
          ? (
            <div className="px-2 py-4 text-center text-slate-400 text-sm">
              No accounts found. Create one first.
            </div>
          )
          : (
            safeAccounts.map((account) => (
              <SelectItem
                key={account.id}
                value={account.id}
                className="hover:bg-slate-700"
              >
                {account.name}
              </SelectItem>
            ))
          )}
      </SelectContent>
    </Select>
  );
}
