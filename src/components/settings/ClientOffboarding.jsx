import { useState, useEffect } from 'react';
import { Tenant } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { deleteTenantWithData } from '@/api/functions';
import { toast } from 'sonner';

export default function ClientOffboarding() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      const tenantList = await Tenant.list();
      setTenants(tenantList);
    } catch (error) {
      console.error("Failed to load tenants:", error);
      toast.error("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = async () => {
    if (!selectedTenantId) {
      alert("Please select a tenant first");
      return;
    }

    const tenant = tenants.find(t => t.id === selectedTenantId);
    if (!tenant) {
      alert("Tenant not found");
      return;
    }

    const confirmation1 = confirm(
      `⚠️ DELETE ALL DATA FOR "${tenant.name}"?\n\n` +
      `This will permanently delete:\n` +
      `• All Contacts\n` +
      `• All Accounts\n` +
      `• All Leads\n` +
      `• All Opportunities\n` +
      `• All Activities\n` +
      `• All Notes\n` +
      `• All Settings\n` +
      `• The Tenant itself\n\n` +
      `Users will be unassigned (not deleted).\n\n` +
      `This action CANNOT BE UNDONE.`
    );

    if (!confirmation1) return;

    const confirmation2 = prompt(
      `Type the tenant name "${tenant.name}" to confirm deletion:`
    );

    if (confirmation2 !== tenant.name) {
      alert("Tenant name did not match. Deletion cancelled.");
      return;
    }

    setDeleting(true);
    setResult(null);

    try {
      const response = await deleteTenantWithData({ tenantId: selectedTenantId });
      
      if (response.data.status === 'success') {
        setResult({
          type: 'success',
          message: response.data.message
        });
        setSelectedTenantId("");
        toast.success('Client offboarded successfully');
        
        // Reload tenant list
        loadTenants();
      } else {
        setResult({
          type: 'error',
          message: response.data.message || 'Deletion failed'
        });
        toast.error('Failed to offboard client');
      }
    } catch (error) {
      console.error("Deletion error:", error);
      setResult({
        type: 'error',
        message: error.message || 'An error occurred during deletion'
      });
      toast.error('An error occurred during offboarding');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Client Offboarding</h3>
        <p className="text-sm text-slate-400 mt-1">
          Permanently delete all data for clients who are offboarding. This action cannot be undone.
        </p>
      </div>

      {result && (
        <Alert variant={result.type === 'success' ? 'default' : 'destructive'}>
          <AlertTitle>{result.type === 'success' ? 'Success' : 'Error'}</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            Delete Client Data
          </CardTitle>
          <CardDescription className="text-slate-400">
            Permanently delete all data for a client who is offboarding.
            This removes all contacts, accounts, leads, opportunities, activities, and settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300 mb-2 block">Select Client to Delete</Label>
            <Select value={selectedTenantId} onValueChange={setSelectedTenantId} disabled={deleting}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Choose a client..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {tenants.map(tenant => (
                  <SelectItem key={tenant.id} value={tenant.id} className="text-slate-200">
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Alert variant="destructive" className="bg-red-900/20 border-red-700">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              This will permanently delete ALL data for the selected client. This action cannot be undone.
              Users will be unassigned but not deleted.
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleDeleteTenant}
            disabled={!selectedTenantId || deleting}
            variant="destructive"
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting Client Data...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Client & All Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}