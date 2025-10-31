import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export default function SearchableAccountSelector({ value, onChange, accounts, placeholder = "Search accounts...", className = "" }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === value);
  }, [accounts, value]);

  const filteredAccounts = useMemo(() => {
    if (!searchTerm) return accounts;
    const term = searchTerm.toLowerCase();
    return accounts.filter(a => 
      a.name?.toLowerCase().includes(term) ||
      a.industry?.toLowerCase().includes(term)
    );
  }, [accounts, searchTerm]);

  const handleSelect = (accountId) => {
    onChange(accountId === value ? "" : accountId);
    setOpen(false);
    setSearchTerm("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between bg-slate-700 border-slate-600 text-white hover:bg-slate-600",
            className
          )}
        >
          {selectedAccount ? (
            <span className="truncate">{selectedAccount.name}</span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
          <div className="flex items-center gap-1">
            {selectedAccount && (
              <X
                className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[400px] p-0 bg-slate-800 border-slate-600" 
        style={{ zIndex: 2147483647 }}
        align="start"
      >
        <Command className="bg-slate-800">
          <div className="flex items-center border-b border-slate-600 px-3">
            <Input
              placeholder="Type to search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-0 bg-transparent text-white placeholder:text-slate-400 focus-visible:ring-0"
            />
          </div>
          <CommandEmpty className="py-6 text-center text-sm text-slate-400">
            No accounts found.
          </CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-auto">
            {filteredAccounts.map((account) => (
              <CommandItem
                key={account.id}
                value={account.id}
                onSelect={() => handleSelect(account.id)}
                className="text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === account.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span>{account.name}</span>
                  {account.industry && (
                    <span className="text-xs text-slate-400">{account.industry}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}