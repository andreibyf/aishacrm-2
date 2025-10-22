
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { inviteUser } from '@/api/functions';

export default function InviteUserDialog({ open, onOpenChange, onSuccess, tenants, currentUser }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'user',
    employee_role: '', // NEW: Add employee role
    tenant_id: '',
    can_use_softphone: false,
    access_level: 'read_write',
    phone: '',
    navigation_permissions: {},
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.full_name || !formData.role) {
      toast({ variant: "destructive", title: "Validation Error", description: "Email, name, and role are required." });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role,
        employee_role: formData.employee_role === 'none' ? null : formData.employee_role || null, // NEW: Handle 'none' value
        tenant_id: formData.tenant_id || null,
        requested_access: formData.access_level || 'read_write',
        can_use_softphone: formData.can_use_softphone || false,
        phone: formData.phone || null,
        permissions: {
          navigation_permissions: formData.navigation_permissions || {}
        }
      };

      const response = await inviteUser(payload);
      
      if (response?.status === 200 && response?.data?.success) {
        const data = response.data;
        
        if (data.requires_manual_invite) {
          toast({ 
            title: "Invitation Notifications Sent", 
            description: `${formData.email} will receive a welcome email. Please complete the invite via base44 platform (Dashboard → Users → Invite User).`,
            duration: 8000
          });
        } else {
          toast({ 
            title: "User Invited Successfully", 
            description: data.message || `${formData.email} has been added to the system.`
          });
        }
        
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        const errorMsg = response?.data?.error || response?.data?.message || 'Failed to process invitation';
        toast({ 
          variant: "destructive", 
          title: "Invitation Failed", 
          description: errorMsg 
        });
      }
    } catch (error) {
      console.error('Error inviting user:', error);
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: error?.message || 'An error occurred'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = () => {
    setFormData({
      email: '',
      full_name: '',
      role: 'user',
      employee_role: '', // NEW
      tenant_id: '',
      can_use_softphone: false,
      access_level: 'read_write',
      phone: '',
      navigation_permissions: {},
    });
    onOpenChange(false);
  };

  const handleNavigationChange = (permissionKey, value) => {
    setFormData(prev => ({
      ...prev,
      navigation_permissions: {
        ...prev.navigation_permissions,
        [permissionKey]: value,
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Invite New User</DialogTitle>
          <DialogDescription className="text-slate-400">
            Send an invitation to join your CRM workspace
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-slate-200">Email address</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="Enter email address"
              required
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
            />
          </div>

          <div>
            <Label htmlFor="full_name" className="text-slate-200">Full Name</Label>
            <Input
              id="full_name"
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="Enter full name"
              required
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
            />
          </div>

          <div>
            <Label htmlFor="phone" className="text-slate-200">Phone Number (Optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="+1234567890"
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">Include country code for SMS notification (e.g., +1 for US)</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="role" className="text-slate-200">Role</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select access level" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
                  <SelectItem value="admin">Admin - Can manage the app</SelectItem>
                  <SelectItem value="power-user">Power User - Advanced features</SelectItem>
                  <SelectItem value="user">User - Can use the app</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="employee_role" className="text-slate-200">Employee Role</Label>
              <Select 
                value={formData.employee_role || 'none'} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, employee_role: value === 'none' ? '' : value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select employee role" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
                  <SelectItem value="none">None (Use Base44 Role)</SelectItem>
                  <SelectItem value="manager">Manager (Full Visibility)</SelectItem>
                  <SelectItem value="employee">Employee (Own Records)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {tenants && tenants.length > 0 && (
            <div>
              <Label htmlFor="tenant" className="text-slate-200">Client (Optional)</Label>
              <Select value={formData.tenant_id} onValueChange={(value) => setFormData(prev => ({ ...prev, tenant_id: value }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
                  <SelectItem value="no-client">No specific client</SelectItem>
                  {tenants.map(tenant => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="access_level" className="text-slate-200">Access Level</Label>
            <Select value={formData.access_level} onValueChange={(value) => setFormData(prev => ({ ...prev, access_level: value }))}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
                <SelectItem value="read_write">Read & Write</SelectItem>
                <SelectItem value="read_only">Read Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="can_use_softphone"
              checked={formData.can_use_softphone}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, can_use_softphone: checked }))}
              className="data-[state=checked]:bg-orange-500"
            />
            <Label htmlFor="can_use_softphone" className="text-slate-200">Can use Softphone</Label>
          </div>

          <div className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-300">
            <h3 className="font-semibold mb-2">Navigation Permissions (Advanced)</h3>
            <p className="text-sm text-slate-400">
              Granular control over specific application routes. (UI not fully implemented in this example)
            </p>
            {/* Example: A simple checkbox for a specific nav item */}
            {/* <div className="flex items-center space-x-2 mt-2">
              <Switch
                id="nav_dashboard"
                checked={formData.navigation_permissions.dashboard || false}
                onCheckedChange={(checked) => handleNavigationChange('dashboard', checked)}
              />
              <Label htmlFor="nav_dashboard">Access Dashboard</Label>
            </div> */}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
