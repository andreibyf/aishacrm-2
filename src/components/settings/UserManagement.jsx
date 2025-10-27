import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PlusCircle, ShieldCheck, Users, Copy, CheckCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { inviteUser } from "@/api/functions";
import { Tenant } from "@/api/entities";

const InviteUserModal = ({ tenants, onInvite, onCancel }) => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('user');
    const [tenantId, setTenantId] = useState('');
    const [sending, setSending] = useState(false);
    const [createdUser, setCreatedUser] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [passwordCopied, setPasswordCopied] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !fullName) {
            toast.error("Full Name and Email are required.");
            return;
        }
        setSending(true);
        try {
            const result = await onInvite({ fullName, email, role, tenantId: tenantId || null });
            
            // Check if result contains auth credentials
            if (result?.data?.auth?.password) {
                setCreatedUser({
                    email,
                    fullName,
                    password: result.data.auth.password,
                    expiresHours: result.data.auth.password_expires_hours || 24
                });
            } else {
                // No password returned, close modal immediately
                onCancel();
            }
        } catch (error) {
            console.error("Invite error from modal:", error);
            // Error is already toasted in the parent component
        } finally {
            setSending(false);
        }
    };

    const copyPassword = () => {
        if (createdUser?.password) {
            navigator.clipboard.writeText(createdUser.password);
            setPasswordCopied(true);
            toast.success("Password copied to clipboard!");
            setTimeout(() => setPasswordCopied(false), 2000);
        }
    };

    const handleClose = () => {
        setCreatedUser(null);
        setFullName('');
        setEmail('');
        setRole('user');
        setTenantId('');
        setShowPassword(false);
        setPasswordCopied(false);
        onCancel();
    };

    // Show success screen with password
    if (createdUser) {
        return (
            <Dialog open={true} onOpenChange={handleClose}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            User Created Successfully
                        </DialogTitle>
                        <DialogDescription>
                            Login credentials for <strong>{createdUser.email}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <div className="flex items-start gap-2 mb-3">
                                <ShieldCheck className="h-5 w-5 text-amber-600 mt-0.5" />
                                <div className="flex-1">
                                    <h4 className="font-semibold text-amber-900">Temporary Password</h4>
                                    <p className="text-sm text-amber-700">
                                        This password expires in {createdUser.expiresHours} hours. User must change it on first login.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="show-password" className="text-slate-700">Password</Label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            id="show-password"
                                            type={showPassword ? "text" : "password"}
                                            value={createdUser.password}
                                            readOnly
                                            className="pr-10 font-mono bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={copyPassword}
                                        variant={passwordCopied ? "default" : "outline"}
                                        size="icon"
                                        className={passwordCopied ? "bg-green-600 hover:bg-green-700" : ""}
                                    >
                                        {passwordCopied ? (
                                            <CheckCircle className="h-4 w-4" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                            <strong>Next Steps:</strong>
                            <ol className="list-decimal pl-5 mt-2 space-y-1">
                                <li>Copy the password using the button above</li>
                                <li>Send credentials to the user securely (email/Slack)</li>
                                <li>User must log in and change password within {createdUser.expiresHours} hours</li>
                            </ol>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={handleClose} className="w-full">
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

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
            const result = await inviteUser(invitationData);
            if (result.data?.error || result.error) {
                throw new Error(result.data?.error || result.error);
            }
            toast.success(`Invitation sent to ${invitationData.email}`);
            return result; // Return result to modal so it can show password
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