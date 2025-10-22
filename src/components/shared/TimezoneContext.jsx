import React, { createContext, useContext, useState, useEffect } from 'react';

const TimezoneContext = createContext();

export const TimezoneProvider = ({ children }) => {
  const [selectedTimezone, setSelectedTimezone] = useState('America/New_York');

  // Load timezone from localStorage on mount
  useEffect(() => {
    try {
      const savedTimezone = localStorage.getItem('selected_timezone');
      if (savedTimezone) {
        setSelectedTimezone(savedTimezone);
      }
    } catch (error) {
      console.warn('Failed to load saved timezone:', error);
    }
  }, []);

  // Save timezone to localStorage when changed
  const updateTimezone = (timezone) => {
    setSelectedTimezone(timezone);
    try {
      localStorage.setItem('selected_timezone', timezone);
    } catch (error) {
      console.warn('Failed to save timezone:', error);
    }
  };

  return (
    <TimezoneContext.Provider value={{ selectedTimezone, setSelectedTimezone: updateTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
};

export const useTimezone = () => {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }
  return context;
};