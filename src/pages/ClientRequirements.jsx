
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, Building2, User, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ClientRequirements() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequirement, setSelectedRequirement] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");

  useEffect(() => {
    loadRequirements();
  }, []);

  const loadRequirements = async () => {
    setLoading(true);
    try {
      const reqs = await base44.entities.ClientRequirement.list('-created_date');
      setRequirements(reqs || []);
    } catch (error) {
      console.error('Failed to load requirements:', error);
      toast.error('Failed to load requirements');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequirement) return;
    
    setIsApproving(true);
    try {
      // USE BASE44 SDK INSTEAD OF RAW FETCH
      const result = await base44.functions.invoke('approveClientRequirement', {
        requirement_id: selectedRequirement.id,
        admin_notes: adminNotes
      });

      if (result.data.success) {
        toast.success('Client requirement approved and tenant created!');
        
        // Show the signup link
        if (result.data.signup_url) {
          toast.info(`Signup link: ${result.data.signup_url}`, { duration: 10000 });
        }
        
        setIsDetailOpen(false);
        setSelectedRequirement(null);
        setAdminNotes("");
        loadRequirements();
      } else {
        // base44.functions.invoke will throw an error for non-2xx responses or if the function's own return
        // indicates an error, so `result.data.error` will be the error message from the backend.
        toast.error(result.data.error || 'Approval failed');
      }
    } catch (error) {
      console.error('Approval error:', error);
      // The error object from base44.functions.invoke will contain the error details
      // It might be error.response.data.error or just error.message
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error during approval';
      toast.error(`Failed to approve requirement: ${errorMessage}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequirement) return;
    
    try {
      await base44.entities.ClientRequirement.update(selectedRequirement.id, {
        status: 'rejected',
        admin_notes: adminNotes
      });

      toast.success('Requirement rejected');
      setIsDetailOpen(false);
      setSelectedRequirement(null);
      setAdminNotes("");
      loadRequirements();
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('Failed to reject requirement');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-900/20 text-yellow-300 border-yellow-800',
      approved: 'bg-green-900/20 text-green-300 border-green-800',
      rejected: 'bg-red-900/20 text-red-300 border-red-800'
    };

    const icons = {
      pending: <Clock className="w-3 h-3 mr-1" />,
      approved: <CheckCircle2 className="w-3 h-3 mr-1" />,
      rejected: <XCircle className="w-3 h-3 mr-1" />
    };

    return (
      <Badge className={`${styles[status]} flex items-center`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Client Onboarding Requests</h1>
          <p className="text-slate-400">Review and approve new client requirements</p>
        </div>

        <div className="grid gap-4">
          {requirements.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No client requirements submitted yet</p>
              </CardContent>
            </Card>
          ) : (
            requirements.map((req) => (
              <Card 
                key={req.id} 
                className="bg-slate-800 border-slate-700 hover:border-slate-600 cursor-pointer transition-colors"
                onClick={() => {
                  setSelectedRequirement(req);
                  setAdminNotes(req.admin_notes || "");
                  setIsDetailOpen(true);
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-slate-100 flex items-center gap-3">
                        <Building2 className="w-5 h-5" />
                        {req.company_name}
                      </CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {req.initial_employee?.first_name} {req.initial_employee?.last_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(req.created_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div>{getStatusBadge(req.status)}</div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Industry</p>
                      <p className="text-slate-200">{req.industry?.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Business Model</p>
                      <p className="text-slate-200">{req.business_model?.toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Test Date</p>
                      <p className="text-slate-200">{req.target_test_date || 'Not specified'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Implementation</p>
                      <p className="text-slate-200">{req.target_implementation_date || 'Not specified'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-100 text-2xl">
              {selectedRequirement?.company_name}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Review details and approve or reject this client requirement
            </DialogDescription>
          </DialogHeader>

          {selectedRequirement && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-1">Status</h3>
                  {getStatusBadge(selectedRequirement.status)}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-1">Industry</h3>
                  <p className="text-slate-200">{selectedRequirement.industry?.replace(/_/g, ' ')}</p>
                </div>
              </div>

              {selectedRequirement.project_description && (
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-2">Project Description</h3>
                  <p className="text-slate-200 bg-slate-700/50 p-3 rounded-lg">
                    {selectedRequirement.project_description}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">Selected Modules</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedRequirement.selected_modules || {})
                    .filter(([_, value]) => value === true)
                    .map(([key]) => (
                      <Badge key={key} className="bg-blue-900/20 text-blue-300">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Badge>
                    ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">Initial User</h3>
                <div className="bg-slate-700/50 p-4 rounded-lg space-y-2">
                  <p className="text-slate-200">
                    <span className="text-slate-400">Name:</span> {selectedRequirement.initial_employee?.first_name} {selectedRequirement.initial_employee?.last_name}
                  </p>
                  <p className="text-slate-200">
                    <span className="text-slate-400">Email:</span> {selectedRequirement.initial_employee?.email}
                  </p>
                  <p className="text-slate-200">
                    <span className="text-slate-400">Phone:</span> {selectedRequirement.initial_employee?.phone || 'Not provided'}
                  </p>
                  <p className="text-slate-200">
                    <span className="text-slate-400">Role:</span> {selectedRequirement.initial_employee?.employee_role}
                  </p>
                  <p className="text-slate-200">
                    <span className="text-slate-400">Access:</span> {selectedRequirement.initial_employee?.access_level}
                  </p>
                </div>
              </div>

              {selectedRequirement.status === 'pending' && (
                <div>
                  <Label htmlFor="admin_notes" className="text-slate-200">Admin Notes</Label>
                  <Textarea
                    id="admin_notes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-slate-100 mt-2"
                    rows={4}
                    placeholder="Add any notes about this approval/rejection..."
                  />
                </div>
              )}

              {selectedRequirement.admin_notes && (
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-2">Admin Notes</h3>
                  <p className="text-slate-200 bg-slate-700/50 p-3 rounded-lg">
                    {selectedRequirement.admin_notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedRequirement?.status === 'pending' && (
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={handleReject}
                className="bg-slate-700 border-slate-600 hover:bg-red-900/20 hover:border-red-800 text-slate-200"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isApproving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isApproving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve & Create Tenant
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
