import React, { createContext, useContext, useState, useEffect } from 'react';

const EmployeeScopeContext = createContext(null);

export const EmployeeScopeProvider = ({ children }) => {
  const [selectedEmployeeEmail, setSelectedEmployeeEmail] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('employee_scope_filter');
      if (saved && saved !== 'null' && saved !== 'undefined') {
        setSelectedEmployeeEmail(saved);
      }
    } catch (error) {
      console.warn('Failed to load employee scope filter:', error);
    }
  }, []);

  const setEmployeeScope = (email) => {
    setSelectedEmployeeEmail(email);
    try {
      if (email) {
        localStorage.setItem('employee_scope_filter', email);
      } else {
        localStorage.removeItem('employee_scope_filter');
      }
    } catch (error) {
      console.warn('Failed to save employee scope filter:', error);
    }
  };

  const clearEmployeeScope = () => {
    setSelectedEmployeeEmail(null);
    try {
      localStorage.removeItem('employee_scope_filter');
    } catch (error) {
      console.warn('Failed to clear employee scope filter:', error);
    }
  };

  return (
    <EmployeeScopeContext.Provider value={{
      selectedEmployeeEmail,
      setEmployeeScope,
      clearEmployeeScope
    }}>
      {children}
    </EmployeeScopeContext.Provider>
  );
};

export const useEmployeeScope = () => {
  const context = useContext(EmployeeScopeContext);
  if (!context) {
    return {
      selectedEmployeeEmail: null,
      setEmployeeScope: () => {},
      clearEmployeeScope: () => {}
    };
  }
  return context;
};