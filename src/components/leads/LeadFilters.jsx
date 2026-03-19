import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TagFilter from '../shared/TagFilter';
import AssignedToSelect from '../shared/AssignedToSelect';
import { Search, X } from 'lucide-react';

/**
 * LeadFilters - Search and filter controls for leads list
 *
 * Displays:
 * - Search input (name, email, phone, company, job title)
 * - Age filter dropdown (with colored age buckets)
 * - Tag filter (multi-select tags)
 * - Sort dropdown (with field + direction options)
 * - Clear filters button (when filters are active)
 */
export default function LeadFilters({
  searchTerm,
  setSearchTerm,
  ageFilter,
  setAgeFilter,
  ageBuckets,
  updatedFilter,
  setUpdatedFilter,
  allTags,
  selectedTags,
  setSelectedTags,
  employees: _employees,
  assignedToFilter,
  setAssignedToFilter,
  sortField,
  sortDirection,
  setSortField,
  setSortDirection,
  sortOptions,
  hasActiveFilters,
  handleClearFilters,
  setCurrentPage,
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
        <Input
          placeholder="Search leads by name, email, phone, company, or job title..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Age Filter */}
        <Select
          value={ageFilter}
          onValueChange={(value) => {
            setAgeFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-slate-200">
            <SelectValue placeholder="Age filter" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {ageBuckets.map((bucket) => (
              <SelectItem
                key={bucket.value}
                value={bucket.value}
                className="text-slate-200 hover:bg-slate-700"
              >
                <span className={bucket.color}>{bucket.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <TagFilter
          allTags={allTags}
          selectedTags={selectedTags}
          onTagsChange={(newTags) => {
            setSelectedTags(newTags);
            setCurrentPage(1);
          }}
        />

        {/* Updated In Filter */}
        <Select
          value={updatedFilter ?? 'all'}
          onValueChange={(value) => {
            setUpdatedFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-slate-200">
            <SelectValue placeholder="Updated in..." />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200 hover:bg-slate-700">All time</SelectItem>
            <SelectItem value="today" className="text-slate-200 hover:bg-slate-700">Updated today</SelectItem>
            <SelectItem value="week" className="text-slate-200 hover:bg-slate-700">Last 7 days</SelectItem>
            <SelectItem value="month" className="text-slate-200 hover:bg-slate-700">Last 30 days</SelectItem>
            <SelectItem value="stale" className="text-slate-200 hover:bg-slate-700">30+ days ago</SelectItem>
          </SelectContent>
        </Select>

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
            if (import.meta?.env?.DEV) {
              console.log('[Leads] Sort dropdown changed to:', value, '| option:', option);
            }
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
