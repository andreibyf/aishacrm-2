import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, X } from 'lucide-react';
import TagFilter from '../shared/TagFilter';
import AssignedToSelect from '../shared/AssignedToSelect';

/**
 * ActivityFilters - Search, tag, and sort filter controls for activities
 */
export default function ActivityFilters({
  searchTerm,
  setSearchTerm,
  allTags,
  selectedTags,
  setSelectedTags,
  sortField,
  sortDirection,
  setSortField,
  setSortDirection,
  sortOptions,
  employees: _employees,
  assignedToFilter,
  setAssignedToFilter,
  hasActiveFilters,
  handleClearFilters,
  setCurrentPage,
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
        <Input
          placeholder="Search activities by subject, description, or related entity..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <TagFilter
          allTags={allTags}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
          className="w-48 bg-slate-800 border-slate-700 text-slate-200"
          contentClassName="bg-slate-800 border-slate-700"
          itemClassName="text-slate-200 hover:bg-slate-700"
        />

        {/* Assigned To Filter */}
        <AssignedToSelect
          value={assignedToFilter}
          onChange={(value) => {
            setAssignedToFilter(value);
            setCurrentPage(1);
          }}
        />

        {/* Sort Dropdown */}
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear all filters</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
