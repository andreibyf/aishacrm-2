import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import TagFilter from '../shared/TagFilter';

/**
 * ContactFilters - Search, tag, assigned-to, sort, and clear filter controls for contacts
 */
export default function ContactFilters({
  searchTerm,
  setSearchTerm,
  selectedTags,
  setSelectedTags,
  employees,
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
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search contacts by name, email, phone, company, or job title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <TagFilter
          entityName="Contact"
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
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
