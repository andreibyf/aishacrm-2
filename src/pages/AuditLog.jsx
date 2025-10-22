
import React, { useState, useEffect } from 'react';
import { AuditLog } from '@/api/entities';
import { User } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Calendar, Filter, Download, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function AuditLogPage() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Filter logs logic moved directly into useEffect
    let filtered = auditLogs;

    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entity_type?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (actionFilter && actionFilter !== 'all') {
      filtered = filtered.filter(log => log.action_type === actionFilter);
    }

    if (entityFilter && entityFilter !== 'all') {
      filtered = filtered.filter(log => log.entity_type === entityFilter);
    }

    setFilteredLogs(filtered);
  }, [auditLogs, searchTerm, actionFilter, entityFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [user, logs] = await Promise.all([
        User.me(),
        AuditLog.list('-created_date', 100) // Get last 100 entries
      ]);
      
      setCurrentUser(user);
      setAuditLogs(logs);
    } catch (error) {
      console.error('Error loading audit logs:', error);
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeColor = (action) => {
    switch (action) {
      case 'create': return 'bg-green-700 text-green-100'; // Dark theme colors
      case 'update': return 'bg-blue-700 text-blue-100';
      case 'delete': return 'bg-red-700 text-red-100';
      case 'login': return 'bg-purple-700 text-purple-100';
      case 'logout': return 'bg-gray-700 text-gray-100';
      default: return 'bg-slate-700 text-slate-100';
    }
  };

  const getRoleDisplay = (log) => {
    // Use display role if available, otherwise fall back to the base role
    return log.user_display_role || log.user_role;
  };

  if (loading) {
    return (
      <div className="p-6 bg-slate-900 min-h-screen">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-64"></div>
          <div className="h-64 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-400" />
            Audit Log
          </h1>
          <p className="text-slate-400 mt-1">
            Track all system changes and user activities
          </p>
        </div>
        <Button variant="outline" onClick={loadData} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
          <Calendar className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-200">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search descriptions, users, entities..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-200">Action Type</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-slate-200 hover:bg-slate-700">All Actions</SelectItem>
                  <SelectItem value="create" className="text-slate-200 hover:bg-slate-700">Create</SelectItem>
                  <SelectItem value="update" className="text-slate-200 hover:bg-slate-700">Update</SelectItem>
                  <SelectItem value="delete" className="text-slate-200 hover:bg-slate-700">Delete</SelectItem>
                  <SelectItem value="login" className="text-slate-200 hover:bg-slate-700">Login</SelectItem>
                  <SelectItem value="logout" className="text-slate-200 hover:bg-slate-700">Logout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-200">Entity Type</label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-slate-200 hover:bg-slate-700">All Entities</SelectItem>
                  <SelectItem value="Lead" className="text-slate-200 hover:bg-slate-700">Leads</SelectItem>
                  <SelectItem value="Contact" className="text-slate-200 hover:bg-slate-700">Contacts</SelectItem>
                  <SelectItem value="Account" className="text-slate-200 hover:bg-slate-700">Accounts</SelectItem>
                  <SelectItem value="Opportunity" className="text-slate-200 hover:bg-slate-700">Opportunities</SelectItem>
                  <SelectItem value="Activity" className="text-slate-200 hover:bg-slate-700">Activities</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Activity Log ({filteredLogs.length} entries)</CardTitle>
          <CardDescription className="text-slate-400">
            Recent system activities and changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 mx-auto text-slate-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">No Audit Logs Found</h3>
              <p className="text-slate-400">No activities match your current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-700">
                    <TableHead className="text-slate-300">Date & Time</TableHead>
                    <TableHead className="text-slate-300">User</TableHead>
                    <TableHead className="text-slate-300">Action</TableHead>
                    <TableHead className="text-slate-300">Entity</TableHead>
                    <TableHead className="text-slate-300">Description</TableHead>
                    <TableHead className="text-slate-300">Changes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id} className="border-b border-slate-800 hover:bg-slate-700/50">
                      <TableCell className="font-mono text-sm text-slate-200">
                        {format(new Date(log.created_date), 'MMM d, yyyy HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-slate-200">{log.user_email}</div>
                          <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                            {getRoleDisplay(log)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getActionBadgeColor(log.action_type)} border-slate-600`}>
                          {log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-slate-200">{log.entity_type || 'System'}</div>
                          {log.entity_id && (
                            <div className="text-xs text-slate-400 font-mono">
                              ID: {log.entity_id.substring(0, 8)}...
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate text-slate-300" title={log.description}>
                          {log.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(log.old_values || log.new_values) && (
                          <details className="cursor-pointer">
                            <summary className="text-blue-400 hover:text-blue-300 text-sm">
                              View Changes
                            </summary>
                            <div className="mt-2 p-2 bg-slate-700 rounded text-xs space-y-1 border border-slate-600">
                              {log.old_values && (
                                <div>
                                  <strong className="text-slate-200">Before:</strong>
                                  <pre className="whitespace-pre-wrap text-slate-300">
                                    {JSON.stringify(log.old_values, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.new_values && (
                                <div>
                                  <strong className="text-slate-200">After:</strong>
                                  <pre className="whitespace-pre-wrap text-slate-300">
                                    {JSON.stringify(log.new_values, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
