
import React, { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserIcon, AlertCircle } from "lucide-react";

export default function UserSelector({ value, onValueChange, placeholder = "Assign to user..." }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        // First get current user
        const current = await User.me();
        setCurrentUser(current);
        
        // Try to get users list, but handle permission errors gracefully
        try {
          const usersData = await User.list();
          setUsers(usersData);
          setError(null);
        } catch (userListError) {
          console.log("Cannot access full user list (permissions), showing current user only:", userListError);
          // If can't access full list, just show current user
          setUsers([current]);
          setError("Limited user access");
        }
      } catch (error) {
        console.error("Error loading users:", error);
        setError("Failed to load users");
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading users..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (error && users.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="text-red-500">
          <AlertCircle className="w-4 h-4 mr-2" />
          <SelectValue placeholder="Error loading users" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
        {users.map(user => (
          <SelectItem key={user.email} value={user.email} className="text-slate-200 hover:bg-slate-700">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-slate-400" />
              <span>{user.full_name || user.email}</span>
              {user.email === currentUser?.email && (
                <span className="text-xs text-blue-400">(You)</span>
              )}
            </div>
          </SelectItem>
        ))}
        {error && (
          <SelectItem disabled value="error" className="text-slate-400">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">Limited access - showing available users only</span>
            </div>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
