import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tenant } from "@/api/entities"; // Internal entity, remains Tenant
import { User } from "@/api/entities"; // Internal entity, remains User
import { Loader2, Copy, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TenantIdViewer() { // Component name remains TenantIdViewer, as per existing file
  const [tenants, setTenants] = useState([]); // Internal state variable, remains tenants
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const user = await User.me();
        setCurrentUser(user);

        if (user.role === 'admin' || user.role === 'superadmin') {
          // Admins can see all tenants (internal logic)
          const tenantsData = await Tenant.list(); // Internal entity method, remains Tenant.list
          setTenants(tenantsData);
        } else if (user.tenant_id) { // Internal ID, remains tenant_id
          // Non-admins should only see their own client ID
          try {
            const myTenant = await Tenant.get(user.tenant_id); // Internal entity method, remains Tenant.get
            setTenants(myTenant ? [myTenant] : [{ id: user.tenant_id, name: 'Your Client' }]); // User-facing text changed
          } catch {
            setTenants([{ id: user.tenant_id, name: "Your Client" }]); // User-facing text changed
          }
        }
      } catch (error) {
        console.error("Error loading client information:", error); // User-facing text changed
        toast.error("Failed to load client information."); // User-facing text changed
        setTenants([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Client ID copied to clipboard!"); // User-facing text changed
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          <span>Loading Client Information...</span> {/* User-facing text changed */}
        </CardContent>
      </Card>
    );
  }

  const isSuperOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  return (
    <>
      <div className="mb-8"> {/* Added for the new heading as per outline */}
        <h2 className="text-2xl font-bold text-slate-100">Client Management</h2>
        <p className="text-slate-400 mt-1">View and manage client information.</p>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Building2 className="w-6 h-6 text-blue-600" />
            Client IDs {/* User-facing text changed */}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {isSuperOrAdmin
              ? "List of all client IDs in the system for administrative purposes." // User-facing text changed
              : "Your organization's Client ID for integrations and support."} {/* User-facing text changed */}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-slate-700/50">
                <TableHead className="text-slate-300">Client Name</TableHead> {/* User-facing text changed */}
                <TableHead className="text-slate-300">Client ID</TableHead> {/* User-facing text changed */}
                <TableHead className="text-slate-300">Industry</TableHead> {/* New column from outline */}
                <TableHead className="text-slate-300">Created Date</TableHead> {/* New column from outline */}
                <TableHead className="text-slate-300">Actions</TableHead> {/* New column from outline */}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map(tenant => (
                <TableRow key={tenant.id} className="border-slate-700 hover:bg-slate-700/30">
                  <TableCell className="font-medium text-slate-200">{tenant.name || 'N/A'}</TableCell>
                  <TableCell className="font-mono text-sm text-slate-300">{tenant.id}</TableCell>
                  <TableCell className="text-slate-400">N/A</TableCell> {/* Placeholder for Industry, as tenant entity doesn't provide this */}
                  <TableCell className="text-slate-400">N/A</TableCell> {/* Placeholder for Created Date, as tenant entity doesn't provide this */}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(tenant.id)}
                      className="text-slate-300 hover:text-slate-100 hover:bg-slate-600"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {tenants.length === 0 && ( // Conditional rendering for empty state
            <div className="text-center py-8 text-slate-400"> {/* Replaced existing empty state row with new div from outline */}
              <Building2 className="w-12 h-12 mx-auto mb-4 text-slate-500" />
              <p>No clients found</p> {/* User-facing text changed */}
              <p className="text-sm">Clients will appear here once they are created</p> {/* User-facing text changed */}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
