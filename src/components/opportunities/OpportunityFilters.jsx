import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, X } from 'lucide-react';
import TagFilter from '../shared/TagFilter';

/**
 * OpportunityFilters - Search, tag, and sort filter controls for opportunities
 *
 * Renders the filter bar with search input, tag filter, sort dropdown,
 * and clear filters button. Hidden in kanban view mode.
 */
export default function OpportunityFilters({
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
  employees,
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
          placeholder="Search opportunities by name, account, contact, or description..."
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
          onTagsChange={(newTags) => {
            setSelectedTags(newTags);
            setCurrentPage(1);
          }}
        />

        {/* Assigned To Filter */}
        <Select
          value={assignedToFilter}
          onValueChange={(value) => {
            setAssignedToFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-36 shrink-0 bg-slate-800 border-slate-700 text-slate-200">
            <SelectValue placeholder="All Assignees" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200 hover:bg-slate-700">
              All Assignees
            </SelectItem>
            <SelectItem value="unassigned" className="text-slate-200 hover:bg-slate-700">
              Unassigned
            </SelectItem>
            {employees.map((emp) => (
              <SelectItem key={emp.id} value={emp.id} className="text-slate-200 hover:bg-slate-700">
                {emp.first_name} {emp.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
        )}
      </div>
    </div>
  );
}
