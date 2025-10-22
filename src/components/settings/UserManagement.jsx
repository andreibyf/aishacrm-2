import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PlusCircle, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { inviteUser } from "@/api/functions";
import { Tenant } from "@/api/entities";

const InviteUserModal = ({ tenants, onInvite, onCancel }) => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('user');
    const [tenantId, setTenantId] = useState('');
    const [sending, setSending] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !fullName) {
            toast.error("Full Name and Email are required.");
            return;
        }
        setSending(true);
        try {
            await onInvite({ fullName, email, role, tenantId: tenantId || null });
            onCancel(); // Close modal on success
        } catch (error) {
            console.error("Invite error from modal:", error);
            // Error is already toasted in the parent component
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={true} onOpenChange={onCancel}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite New User</DialogTitle>
                    <DialogDescription>
                        An invitation email will be sent to the user to set up their account.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div>
                        <Label htmlFor="full-name">Full Name</Label>
                        <Input 
                            id="full-name" 
                            value={fullName} 
                            onChange={(e) => setFullName(e.target.value)} 
                            required 
                        />
                    </div>
                    <div>
                        <Label htmlFor="email">Email</Label>
                        <Input 
                            id="email" 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                    </div>
                    <div>
                        <Label htmlFor="role">Role</Label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger id="role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="power-user">Power User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="tenant">Assign to Tenant (optional)</Label>
                        <Select value={tenantId} onValueChange={setTenantId}>
                            <SelectTrigger id="tenant">
                                <SelectValue placeholder="No specific tenant" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={null}>No specific tenant</SelectItem>
                                {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                        <Button type="submit" disabled={sending}>
                            {sending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                </>
                            ) : 'Send Invitation'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default function UserManagement() {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [tenants, setTenants] = useState([]);

    useEffect(() => {
        const loadTenants = async () => {
            try {
                const tenantsData = await Tenant.list();
                setTenants(tenantsData);
            } catch (error) {
                console.error("Failed to load tenants:", error);
                toast.error("Could not load tenant list for invitations.");
            }
        };
        loadTenants();
    }, []);

    const handleInvite = async (invitationData) => {
        try {
            const { error } = await inviteUser(invitationData);
            if (error) {
                throw new Error(error);
            }
            toast.success(`Invitation sent to ${invitationData.email}`);
        } catch (err) {
            console.error("Failed to send invitation:", err);
            toast.error(`Invitation failed: ${err.message}`);
            // Re-throw to keep modal open on failure
            throw err;
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="w-6 h-6 text-blue-600" />
                                Invite Users
                            </CardTitle>
                            <CardDescription>
                                Add new users to the platform by sending an email invitation.
                            </CardDescription>
                        </div>
                        <Button onClick={() => setShowInviteModal(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Invite User
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                     <div className="p-4 bg-slate-50 border rounded-lg">
                        <div className="flex items-start gap-3">
                            <ShieldCheck className="w-5 h-5 text-slate-500 mt-1" />
                            <div>
                                <h4 className="font-semibold text-slate-800">Role Information</h4>
                                <ul className="list-disc pl-5 mt-1 text-sm text-slate-600 space-y-1">
                                    <li><strong>Admin:</strong> Can manage users, tenants, and all system settings.</li>
                                    <li><strong>Power User:</strong> Can view and manage all data within their assigned tenant.</li>
                                    <li><strong>User:</strong> Has standard access to CRM features based on assigned permissions.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
            {showInviteModal && (
                <InviteUserModal
                    tenants={tenants}
                    onInvite={handleInvite}
                    onCancel={() => setShowInviteModal(false)}
                />
            )}
        </>
    );
}