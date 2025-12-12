/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { User as UserEntity } from "@/api/entities";

const EmployeeScopeContext = createContext(null);

export const EmployeeScopeProvider = ({ children }) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("employee_scope_filter");
      if (saved && saved !== "null" && saved !== "undefined") {
        setSelectedEmployeeId(saved);
      }
    } catch (error) {
      console.warn("Failed to load employee scope filter:", error);
    }
  }, []);

  // Load current user once so helpers can evaluate scope rules
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const u = await UserEntity.me();
        if (!canceled) setCurrentUser(u);
      } catch {
        if (!canceled) setCurrentUser(null);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  const setEmployeeScope = (id) => {
    setSelectedEmployeeId(id);
    try {
      if (id) {
        localStorage.setItem("employee_scope_filter", id);
      } else {
        localStorage.removeItem("employee_scope_filter");
      }
    } catch (error) {
      console.warn("Failed to save employee scope filter:", error);
    }
  };

  const clearEmployeeScope = () => {
    setSelectedEmployeeId(null);
    try {
      localStorage.removeItem("employee_scope_filter");
    } catch (error) {
      console.warn("Failed to clear employee scope filter:", error);
    }
  };

  // Helper: determine if user can view all records
  const canViewAllRecords = () => {
    const u = currentUser;
    if (!u) return false;
    if (u.role === "superadmin" || u.role === "admin") return true;
    if (u.employee_role === "manager") return true;
    if (u.role === "power-user") return true;
    return false;
  };

  // Helper: determine employee-type
  const isEmployee = () => {
    const u = currentUser;
    return !!u && u.employee_role === "employee" && u.role !== "admin" &&
      u.role !== "superadmin";
  };

  // Helper: build a filter applying employee scope
  const getFilter = (baseFilter = {}) => {
    const u = currentUser;
    // If no user yet, return base filter
    if (!u) return { ...baseFilter };

    // If a specific employee ID was selected, scope to that
    if (selectedEmployeeId && selectedEmployeeId !== "unassigned") {
      return {
        ...baseFilter,
        $or: [
          { created_by: selectedEmployeeId },
          { assigned_to: selectedEmployeeId },
        ],
      };
    }

    // Unassigned selection: show items without an assignee
    if (selectedEmployeeId === "unassigned") {
      return { ...baseFilter, assigned_to: null };
    }

    // If user can view all, do not restrict further
    if (canViewAllRecords()) return { ...baseFilter };

    // Default: restrict to current user's created/assigned
    return {
      ...baseFilter,
      $or: [
        { created_by: u.email },
        { assigned_to: u.email },
      ],
    };
  };

  return (
    <EmployeeScopeContext.Provider
      value={{
        // current value
        selectedEmployeeId,
        // backward-compat aliases
        selectedEmail: selectedEmployeeId,
        setSelectedEmployeeId: setEmployeeScope,
        // explicit API
        setEmployeeScope,
        clearEmployeeScope,
        // helpers
        canViewAllRecords,
        isEmployee,
        getFilter,
      }}
    >
      {children}
    </EmployeeScopeContext.Provider>
  );
};

export const useEmployeeScope = () => {
  const context = useContext(EmployeeScopeContext);
  if (!context) {
    return {
      selectedEmployeeId: null,
      selectedEmail: null,
      setSelectedEmployeeId: () => {},
      setEmployeeScope: () => {},
      clearEmployeeScope: () => {},
      canViewAllRecords: () => false,
      isEmployee: () => false,
      getFilter: (f = {}) => ({ ...f }),
    };
  }
  return context;
};
