
import { useState, useEffect, useCallback } from "react";
import { Announcement, Tenant, User, Notification } from "@/api/entities"; // Added User and Notification
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Edit, Trash2, Megaphone, Loader2, Info, AlertTriangle, ShieldAlert } from "lucide-react";

export default function SystemAnnouncements() {
    const [announcements, setAnnouncements] = useState([]);
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingAnnouncement, setEditingAnnouncement] = useState(null);
    const [newAnnouncement, setNewAnnouncement] = useState({
        title: "",
        message: "",
        type: "info",
        target_tenant_id: "all",
        is_active: true,
    });
    const { toast } = useToast();

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [announcementsData, tenantsData] = await Promise.all([
                Announcement.list("-created_date"),
                Tenant.list()
            ]);
            setAnnouncements(announcementsData);
            setTenants(tenantsData);
        } catch (error) {
            toast({ variant: "destructive", title: "Failed to load data", description: error.message });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleInputChange = (field, value) => {
        if (editingAnnouncement) {
            setEditingAnnouncement(prev => ({ ...prev, [field]: value }));
        } else {
            setNewAnnouncement(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = editingAnnouncement || newAnnouncement;
        try {
            if (editingAnnouncement) {
                await Announcement.update(editingAnnouncement.id, data);
                toast({ title: "Success", description: "Announcement updated." });
            } else {
                const newAnn = await Announcement.create(data);
                toast({ title: "Success", description: "Announcement created." });

                // After creating the announcement, create notifications for users
                try {
                    let targetUsers = [];
                    if (data.target_tenant_id === 'all') {
                        targetUsers = await User.list();
                    } else {
                        targetUsers = await User.filter({ tenant_id: data.target_tenant_id });
                    }

                    if (targetUsers.length > 0) {
                        const notificationRecords = targetUsers.map(user => ({
                            user_email: user.email,
                            title: `📢 ${data.title}`,
                            description: data.message.substring(0, 100) + (data.message.length > 100 ? '...' : ''),
                            link: '/Dashboard', // Link to dashboard when clicked
                            icon: 'Megaphone'
                        }));
                        await Notification.bulkCreate(notificationRecords);
                        console.log(`Created ${notificationRecords.length} notifications for announcement.`);
                    }
                } catch (notificationError) {
                    console.error("Failed to create notifications for announcement:", notificationError);
                    // Don't block the main success message, but log the error.
                    toast({
                        variant: "destructive",
                        title: "Notification Failure",
                        description: "The announcement was created, but failed to send notifications to users."
                    });
                }
            }
            resetForm();
            loadData();
        } catch (error) {
            toast({ variant: "destructive", title: "Operation Failed", description: error.message });
        }
    };

    const handleEdit = (announcement) => {
        setEditingAnnouncement(announcement);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this announcement?")) {
            try {
                await Announcement.delete(id);
                toast({ title: "Success", description: "Announcement deleted." });
                loadData();
            } catch (error) {
                toast({ variant: "destructive", title: "Delete Failed", description: error.message });
            }
        }
    };
    
    const handleToggleActive = async (announcement) => {
        try {
            await Announcement.update(announcement.id, { is_active: !announcement.is_active });
            toast({ title: "Status Updated" });
            loadData();
        } catch(error) {
            toast({ variant: "destructive", title: "Update Failed", description: error.message });
        }
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingAnnouncement(null);
        setNewAnnouncement({ title: "", message: "", type: "info", target_tenant_id: "all", is_active: true });
    };

    const typeConfig = {
        info: { color: "bg-blue-100 text-blue-800", icon: Info },
        warning: { color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
        critical: { color: "bg-red-100 text-red-800", icon: ShieldAlert },
    };

    return (
        <div className="space-y-6">
            <Card className="shadow-lg bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <Megaphone className="w-6 h-6 text-blue-400" />
                        System Announcements
                    </CardTitle>
                    <CardDescription className="text-slate-400">Create and manage global or tenant-specific announcements.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={() => { setShowForm(!showForm); setEditingAnnouncement(null); }} className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="w-4 h-4 mr-2" /> {showForm ? "Cancel" : "Create New Announcement"}
                    </Button>

                    {showForm && (
                        <form onSubmit={handleSubmit} className="mt-6 space-y-4 p-4 border rounded-lg bg-slate-700/50 border-slate-600">
                            <h3 className="font-medium text-lg text-slate-100">{editingAnnouncement ? "Edit Announcement" : "New Announcement"}</h3>
                            <div>
                                <Label htmlFor="title" className="text-slate-200">Title</Label>
                                <Input id="title" value={editingAnnouncement?.title || newAnnouncement.title} onChange={(e) => handleInputChange('title', e.target.value)} required className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" />
                            </div>
                            <div>
                                <Label htmlFor="message" className="text-slate-200">Message</Label>
                                <Textarea id="message" value={editingAnnouncement?.message || newAnnouncement.message} onChange={(e) => handleInputChange('message', e.target.value)} required className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="type" className="text-slate-200">Type</Label>
                                    <Select value={editingAnnouncement?.type || newAnnouncement.type} onValueChange={(value) => handleInputChange('type', value)}>
                                        <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            <SelectItem value="info" className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">Info</SelectItem>
                                            <SelectItem value="warning" className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">Warning</SelectItem>
                                            <SelectItem value="critical" className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">Critical</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="target" className="text-slate-200">Target</Label>
                                    <Select value={editingAnnouncement?.target_tenant_id || newAnnouncement.target_tenant_id} onValueChange={(value) => handleInputChange('target_tenant_id', value)}>
                                        <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            <SelectItem value="all" className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">All Tenants</SelectItem>
                                            {tenants.map(t => <SelectItem key={t.id} value={t.id} className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">{t.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">{editingAnnouncement ? "Update Announcement" : "Create Announcement"}</Button>
                                <div className="flex items-center space-x-2">
                                    <Label htmlFor="is_active" className="text-slate-200">Active</Label>
                                    <Switch id="is_active" checked={editingAnnouncement?.is_active ?? newAnnouncement.is_active} onCheckedChange={(checked) => handleInputChange('is_active', checked)} />
                                </div>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-lg bg-slate-800 border-slate-700">
                <CardHeader><CardTitle className="text-slate-100">Existing Announcements</CardTitle></CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center items-center py-8"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-700">
                                    <TableHead className="text-slate-300">Status</TableHead>
                                    <TableHead className="text-slate-300">Type</TableHead>
                                    <TableHead className="text-slate-300">Title</TableHead>
                                    <TableHead className="text-slate-300">Target</TableHead>
                                    <TableHead className="text-slate-300">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {announcements.map(ann => {
                                    const TypeIcon = typeConfig[ann.type].icon;
                                    return (
                                        <TableRow key={ann.id} className="border-slate-700">
                                            <TableCell>
                                                <Switch checked={ann.is_active} onCheckedChange={() => handleToggleActive(ann)} />
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={typeConfig[ann.type].color}>
                                                    <TypeIcon className="w-4 h-4 mr-1.5" />
                                                    {ann.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-medium text-slate-200">{ann.title}</p>
                                                <p className="text-sm text-slate-400 truncate max-w-xs">{ann.message}</p>
                                            </TableCell>
                                            <TableCell className="text-slate-200">{ann.target_tenant_id === 'all' ? 'All Tenants' : tenants.find(t => t.id === ann.target_tenant_id)?.name || 'N/A'}</TableCell>
                                            <TableCell className="space-x-2">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(ann)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"><Edit className="w-4 h-4" /></Button>
                                                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-slate-700" onClick={() => handleDelete(ann.id)}><Trash2 className="w-4 h-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
