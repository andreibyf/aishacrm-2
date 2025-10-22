import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { phoneCountries } from './phoneCountriesData';

export default function PhonePrefixPicker({ value, onValueChange, darkMode = false }) {
  const selectedCountry = phoneCountries.find(c => c.prefix === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={`w-28 rounded-r-none h-10 ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 focus:ring-slate-500' : 'focus:ring-slate-400'}`}>
        {selectedCountry ? (
          <div className="flex items-center gap-2 text-sm">
            <span>{selectedCountry.flag}</span>
            <span>{selectedCountry.prefix}</span>
          </div>
        ) : (
          <SelectValue placeholder="Prefix" />
        )}
      </SelectTrigger>
      <SelectContent className={darkMode ? "bg-slate-800 border-slate-700" : ""}>
        {phoneCountries.map(country => (
          <SelectItem 
            key={country.code} 
            value={country.prefix}
            className={darkMode ? "text-slate-200 hover:bg-slate-700 focus:bg-slate-700" : ""}
          >
            <div className="flex items-center gap-2">
              <span>{country.flag}</span>
              <span>{country.name} ({country.prefix})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}