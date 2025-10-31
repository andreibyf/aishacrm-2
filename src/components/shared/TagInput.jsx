import { useState, useRef } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Plus, Hash, Tag } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function TagInput({ 
  selectedTags = [], 
  onTagsChange, 
  allTags = [], 
  placeholder = "Add or search for tags...",
  darkMode = false 
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const addTag = (tagName) => {
    const trimmedTag = tagName.trim();
    if (trimmedTag && !selectedTags.includes(trimmedTag)) {
      onTagsChange([...selectedTags, trimmedTag]);
    }
    setInputValue("");
    setOpen(false);
  };

  const removeTag = (tagToRemove) => {
    onTagsChange(selectedTags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    }
  };

  const availableTags = allTags.filter(tag => 
    !selectedTags.includes(tag.name) && 
    tag.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const triggerClasses = cn(
    "flex flex-wrap items-center gap-2 w-full min-h-10 px-3 py-2 text-sm text-left rounded-md border",
    darkMode ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-input",
    "hover:bg-accent hover:text-accent-foreground"
  );
  
  const popoverContentClasses = cn(
    "w-80 p-0",
    darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-popover text-popover-foreground"
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClasses}>
          {selectedTags.length > 0 ? (
            selectedTags.map((tag) => (
              <Badge 
                key={tag} 
                variant="secondary" 
                className={cn(
                  "flex items-center gap-1",
                  darkMode ? "bg-slate-600 text-slate-100 hover:bg-slate-500" : "bg-secondary text-secondary-foreground"
                )}
              >
                {tag}
                <X 
                  className="w-3 h-3 cursor-pointer" 
                  onClick={(e) => {
                    e.stopPropagation(); // prevent popover from opening
                    removeTag(tag);
                  }}
                />
              </Badge>
            ))
          ) : (
            <span className={cn("text-sm", darkMode ? "text-slate-400" : "text-muted-foreground")}>
              {placeholder}
            </span>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent className={popoverContentClasses} align="start" side="bottom">
        <Command onKeyDown={handleKeyDown} className={darkMode ? "bg-slate-800" : ""}>
          <CommandInput 
            placeholder="Search or create a tag..." 
            value={inputValue}
            onValueChange={setInputValue}
            className={darkMode ? "text-slate-200" : ""}
          />
          <CommandList>
            <CommandEmpty className={cn("py-6 text-center text-sm", darkMode ? "text-slate-400" : "text-muted-foreground")}>
              {inputValue ? (
                <div className="space-y-2">
                  <Tag className="w-6 h-6 mx-auto opacity-50" />
                  <p>No existing tags found</p>
                  <Button
                    size="sm"
                    onClick={() => addTag(inputValue)}
                    className={cn(darkMode ? "bg-blue-600 hover:bg-blue-700" : "bg-primary text-primary-foreground")}
                  >
                    Create "{inputValue}"
                  </Button>
                </div>
              ) : (
                <p>Start typing to see existing tags</p>
              )}
            </CommandEmpty>
            
            {availableTags.length > 0 && (
              <CommandGroup heading="Existing Tags">
                {availableTags.slice(0, 10).map((tag) => (
                  <CommandItem
                    key={tag.name}
                    value={tag.name}
                    onSelect={() => addTag(tag.name)}
                    className={cn("cursor-pointer", darkMode ? "text-slate-200 aria-selected:bg-slate-700" : "")}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="flex items-center gap-2">
                        <Hash className="w-4 h-4 opacity-50" />
                        {tag.name}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {tag.count}
                      </Badge>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            {inputValue && !availableTags.some(tag => tag.name.toLowerCase() === inputValue.toLowerCase()) && (
              <CommandGroup heading="Create New">
                <CommandItem
                  value={inputValue}
                  onSelect={() => addTag(inputValue)}
                  className={cn("cursor-pointer", darkMode ? "text-slate-200 aria-selected:bg-slate-700" : "")}
                >
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 opacity-50" />
                    Create "{inputValue}"
                  </div>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}