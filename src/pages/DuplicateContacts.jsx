
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Users, Trash2, Eye, AlertTriangle, RefreshCw } from "lucide-react";
import { Contact } from "@/api/entities";
import { User } from "@/api/entities";
import { findDuplicates } from "@/api/functions";
import { useTenant } from "../components/shared/tenantContext";
import { useToast } from "@/components/ui/use-toast";
import ContactDetailPanel from "../components/contacts/ContactDetailPanel";

export default function DuplicateContacts() {
  const [loading, setLoading] = useState(true);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { selectedTenantId } = useTenant();
  const { toast } = useToast();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  };

  const loadDuplicates = useCallback(async () => {
    if (!currentUser) return;
    
    setLoading(true);
    try {
      const response = await findDuplicates({
        entity_type: 'Contact',
        tenant_id: selectedTenantId || currentUser?.tenant_id
      });

      if (response.data?.success) {
        setDuplicateGroups(response.data.groups || []);
      }
    } catch (error) {
      console.error("Failed to load duplicates:", error);
      toast({
        title: "Error",
        description: "Failed to load duplicate contacts",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId, toast]);

  useEffect(() => {
    if (currentUser) {
      loadDuplicates();
    }
  }, [currentUser, loadDuplicates]);

  const handleDelete = async (contactId) => {
    if (!confirm("Are you sure you want to delete this contact? This action cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      await Contact.delete(contactId);
      toast({
        title: "Success",
        description: "Contact deleted successfully"
      });
      await loadDuplicates(); // Refresh the list
    } catch (error) {
      console.error("Failed to delete contact:", error);
      toast({
        title: "Error",
        description: "Failed to delete contact",
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleView = (contact) => {
    setSelectedContact(contact);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-slate-400">Scanning for duplicate contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-orange-900/30 border border-orange-700/50">
              <AlertTriangle className="w-6 h-6 text-orange-400" />
            </div>
            Duplicate Contacts
          </h1>
          <p className="text-slate-400 mt-1">Review and manage potential duplicate contact records</p>
        </div>
        <Button onClick={loadDuplicates} variant="outline" className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Scan
        </Button>
      </div>

      {duplicateGroups.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h3 className="text-xl font-semibold mb-2 text-slate-300">No Duplicates Found</h3>
            <p className="text-slate-400">All your contacts appear to be unique!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert className="bg-orange-900/20 border-orange-700/50 text-orange-300">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Found {duplicateGroups.length} group{duplicateGroups.length !== 1 ? 's' : ''} of potential duplicate contacts. Review each group and delete duplicates as needed.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            {duplicateGroups.map((group, index) => (
              <Card key={index} className="bg-slate-800 border-slate-700">
                <CardHeader className="border-b border-slate-700">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-orange-900/30 text-orange-300 border-orange-700/50">
                        Group {index + 1}
                      </Badge>
                      <span className="text-lg">
                        {group.primary.first_name} {group.primary.last_name}
                      </span>
                      <Badge className="bg-slate-700 text-slate-300">
                        {group.total_count} records
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* Primary Record */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50 border border-slate-600">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-blue-900/50 text-blue-300 border-blue-700/50">Primary</Badge>
                          <span className="font-semibold text-slate-200">
                            {group.primary.first_name} {group.primary.last_name}
                          </span>
                        </div>
                        <div className="text-sm text-slate-400 space-y-1">
                          {group.primary.email && <div>📧 {group.primary.email}</div>}
                          {group.primary.phone && <div>📞 {group.primary.phone}</div>}
                          {group.primary.job_title && <div>💼 {group.primary.job_title}</div>}
                          <div className="text-xs text-slate-500">
                            Created: {new Date(group.primary.created_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(group.primary)}
                        className="bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </div>

                    {/* Duplicate Records */}
                    {group.duplicates.map((duplicate) => (
                      <div key={duplicate.id} className="flex items-center justify-between p-4 rounded-lg bg-red-900/10 border border-red-700/30">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-red-900/30 text-red-300 border-red-700/50">
                              Duplicate
                            </Badge>
                            <span className="font-semibold text-slate-200">
                              {duplicate.first_name} {duplicate.last_name}
                            </span>
                            {duplicate.duplicate_reason && (
                              <span className="text-xs text-orange-400">
                                ({duplicate.duplicate_reason.join(', ')})
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-400 space-y-1">
                            {duplicate.email && <div>📧 {duplicate.email}</div>}
                            {duplicate.phone && <div>📞 {duplicate.phone}</div>}
                            {duplicate.job_title && <div>💼 {duplicate.job_title}</div>}
                            <div className="text-xs text-slate-500">
                              Created: {new Date(duplicate.created_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleView(duplicate)}
                            className="bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(duplicate.id)}
                            disabled={deleting}
                            className="bg-red-900/50 border-red-700/50 text-red-300 hover:bg-red-900/70"
                          >
                            {deleting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {selectedContact && (
        <ContactDetailPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
