import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PhonePrefixPicker from './PhonePrefixPicker';

export default function PhoneInput({ id, label, value, onChange, placeholder, className, labelClassName, darkMode = false, showPrefixPicker = false }) {
  const [prefix, setPrefix] = useState('+1');
  const [number, setNumber] = useState('');

  useEffect(() => {
    if (value) {
      const parts = value.split(' ');
      if (parts.length > 1 && parts[0].startsWith('+')) {
        setPrefix(parts[0]);
        setNumber(parts.slice(1).join(' '));
      } else {
        setNumber(value);
      }
    } else {
      setNumber('');
    }
  }, [value]);

  const handleInputChange = (e) => {
    const newNumber = e.target.value;
    setNumber(newNumber);
    onChange(showPrefixPicker ? `${prefix} ${newNumber}` : newNumber);
  };

  const handlePrefixChange = (newPrefix) => {
    setPrefix(newPrefix);
    onChange(`${newPrefix} ${number}`);
  };

  return (
    <div>
      <Label htmlFor={id} className={labelClassName}>{label}</Label>
      <div className="flex items-center mt-1">
        {showPrefixPicker && (
          <PhonePrefixPicker
            value={prefix}
            onValueChange={handlePrefixChange}
            darkMode={darkMode}
          />
        )}
        <Input
          id={id}
          value={number}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={`${className} ${showPrefixPicker ? 'rounded-l-none border-l-0 focus:ring-0 focus:ring-offset-0' : ''}`}
        />
      </div>
    </div>
  );
}