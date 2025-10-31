import { useState } from 'react'
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Filter, Search, Hash } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function TagFilter({
  allTags = [],
  selectedTags = [],
  onTagsChange,
  placeholder = "Filter by tags...",
  disabled = false,
  className = "",
  compact = false
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredTags = allTags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleTag = (tagName) => {
    const updatedTags = selectedTags.includes(tagName)
      ? selectedTags.filter(tag => tag !== tagName)
      : [...selectedTags, tagName];
    onTagsChange(updatedTags);
  };

  const clearAllTags = () => {
    onTagsChange([]);
  };

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-2 ${className}`}>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={disabled}
                  className={`bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600 ${compact ? 'h-7 text-xs px-3' : 'px-4'}`}
                >
                  <Filter className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} mr-2`} />
                  Tags
                  {selectedTags.length > 0 && (
                    <Badge variant="secondary" className={`ml-2 bg-blue-600 text-white ${compact ? 'text-[10px] px-1 py-0' : ''}`}>
                      {selectedTags.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Filter by tags</p>
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-80 bg-slate-800 border-slate-700 text-slate-200" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-slate-100 flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Filter by Tags
                </h4>
                {selectedTags.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllTags}
                    className="h-6 px-2 text-slate-400 hover:text-slate-200 rounded-full"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search tags..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 rounded-full"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredTags.length > 0 ? (
                  filteredTags.map((tag) => (
                    <div
                      key={tag.name}
                      className={`flex items-center justify-between p-2 rounded-full cursor-pointer transition-colors ${
                        selectedTags.includes(tag.name)
                          ? 'bg-blue-600/20 border border-blue-500/50'
                          : 'hover:bg-slate-700'
                      }`}
                      onClick={() => toggleTag(tag.name)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full border ${
                            selectedTags.includes(tag.name)
                              ? 'bg-blue-600 border-blue-500'
                              : 'border-slate-500'
                          }`}
                        />
                        <span className="text-sm text-slate-200">{tag.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs bg-slate-700 text-slate-300 border-slate-600 rounded-full">
                        {tag.count}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-slate-400">
                    <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {allTags.length === 0 ? 'No tags available' : 'No tags match your search'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {selectedTags.length > 0 && !compact && (
          <div className="flex items-center gap-2 flex-wrap">
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="bg-blue-600 text-white hover:bg-blue-700 cursor-pointer rounded-full"
                onClick={() => toggleTag(tag)}
              >
                {tag}
                <X className="w-3 h-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}