import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import TagFilter from '../shared/TagFilter';

/**
 * AccountFilters - Search, tag, sort, and clear filter controls for accounts
 */
export default function AccountFilters({
  searchTerm,
  setSearchTerm,
  selectedTags,
  setSelectedTags,
  allTags,
  sortField,
  sortDirection,
  setSortField,
  setSortDirection,
  sortOptions,
  setCurrentPage,
  hasActiveFilters,
  onClearFilters,
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
        <Input
          placeholder="Search accounts by name, website, email, phone, city or industry..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <TagFilter
          allTags={allTags}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
        />

        <Select
          value={`${sortField}:${sortDirection}`}
          onValueChange={(value) => {
            const option = sortOptions.find((o) => `${o.field}:${o.direction}` === value);
            if (option) {
              setSortField(option.field);
              setSortDirection(option.direction);
              setCurrentPage(1);
            }
          }}
        >
          <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-slate-200">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {sortOptions.map((option) => (
              <SelectItem
                key={`${option.field}:${option.direction}`}
                value={`${option.field}:${option.direction}`}
                className="text-slate-200 hover:bg-slate-700"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onClearFilters}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Clear all filters</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
