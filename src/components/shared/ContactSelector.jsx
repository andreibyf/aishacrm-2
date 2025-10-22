import React, { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, User, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ContactSelector({ 
  contacts = [], 
  value, 
  onValueChange, 
  placeholder = "Select contact...", 
  disabled = false, 
  className = "", 
  contentClassName = "", 
  itemClassName = "",
  required = false
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const selectedContact = contacts.find((contact) => contact.id === value);

  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact => {
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const email = contact.email || '';
    const searchLower = searchValue.toLowerCase();
    return fullName.toLowerCase().includes(searchLower) || 
           email.toLowerCase().includes(searchLower);
  });

  const getDisplayName = (contact) => {
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    return fullName || contact.email || 'Unnamed Contact';
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
        >
          {selectedContact ? (
            <div className="flex items-center gap-2 truncate">
              <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span className="truncate">{getDisplayName(selectedContact)}</span>
            </div>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[--radix-popover-trigger-width] p-0", contentClassName)}>
        <Command>
          <CommandInput 
            placeholder="Search contacts..." 
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>
              <div className="py-6 text-center text-sm">
                <p>No contacts found matching "{searchValue}"</p>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {!required && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onValueChange(null);
                    setOpen(false);
                  }}
                  className={cn("cursor-pointer", itemClassName)}
                >
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">No contact</span>
                </CommandItem>
              )}
              {filteredContacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={getDisplayName(contact)}
                  onSelect={() => {
                    onValueChange(contact.id === value ? null : contact.id);
                    setOpen(false);
                  }}
                  className={cn("cursor-pointer", itemClassName)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === contact.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <div className="flex flex-col">
                      <span className="font-medium">{getDisplayName(contact)}</span>
                      {contact.email && (
                        <span className="text-xs text-muted-foreground">
                          {contact.email}
                        </span>
                      )}
                      {contact.company && (
                        <span className="text-xs text-muted-foreground">
                          {contact.company}
                        </span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}