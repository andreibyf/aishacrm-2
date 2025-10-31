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

export default function SearchableContactSelector({ value, onChange, contacts, placeholder = "Search contacts...", className = "" }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const selectedContact = useMemo(() => {
    return contacts.find(c => c.id === value);
  }, [contacts, value]);

  const filteredContacts = useMemo(() => {
    if (!searchTerm) return contacts;
    const term = searchTerm.toLowerCase();
    return contacts.filter(c => 
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.job_title?.toLowerCase().includes(term)
    );
  }, [contacts, searchTerm]);

  const handleSelect = (contactId) => {
    onChange(contactId === value ? "" : contactId);
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
          {selectedContact ? (
            <span className="truncate">
              {selectedContact.first_name} {selectedContact.last_name}
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
          <div className="flex items-center gap-1">
            {selectedContact && (
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
            No contacts found.
          </CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-auto">
            {filteredContacts.map((contact) => (
              <CommandItem
                key={contact.id}
                value={contact.id}
                onSelect={() => handleSelect(contact.id)}
                className="text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === contact.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span>{contact.first_name} {contact.last_name}</span>
                  {contact.job_title && (
                    <span className="text-xs text-slate-400">{contact.job_title}</span>
                  )}
                  {contact.email && (
                    <span className="text-xs text-slate-400">{contact.email}</span>
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