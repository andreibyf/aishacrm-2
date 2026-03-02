import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import TagFilter from '../shared/TagFilter';

/**
 * ContactFilters - Search, tag, and sort filter controls for contacts
 */
export default function ContactFilters({
  searchTerm,
  setSearchTerm,
  selectedTags,
  setSelectedTags,
  sortField,
  sortDirection,
  setSortField,
  setSortDirection,
  sortOptions,
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
      <TagFilter
        entityName="Contact"
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
    </div>
  );
}
