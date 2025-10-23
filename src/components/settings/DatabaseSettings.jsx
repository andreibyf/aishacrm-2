
import React, { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Database,
  RefreshCw,
  Loader2,
  BarChart3,
  AlertTriangle,
  Archive,
  Save,
  Trash2
} from "lucide-react";
import { syncDatabase } from "@/api/functions";
import { checkDataVolume } from "@/api/functions";
import { DataManagementSettings } from "@/api/entities";
import { archiveAgedData } from "@/api/functions";
import { cleanupOrphanedData } from "@/api/functions";
import R2ConfigChecker from "./R2ConfigChecker"; // Added import

export default function DatabaseSettings() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingVolume, setIsCheckingVolume] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isCleaningOrphaned, setIsCleaningOrphaned] = useState(false);
  const [connectionString, setConnectionString] = useState('');
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [settings, setSettings] = useState({
    id: null,
    activity_retention_days: 365,
    opportunity_retention_days: 365,
  });
  const { toast } = useToast();

  useEffect(() => {
    const loadSettings = async () => {
        try {
            const [existingSettings, currentUser] = await Promise.all([
                DataManagementSettings.filter({}),
                User.me()
            ]);

            if (existingSettings.length > 0) {
                setSettings({
                    id: existingSettings[0].id,
                    activity_retention_days: existingSettings[0].activity_retention_days,
                    opportunity_retention_days: existingSettings[0].opportunity_retention_days,
                });
            }

            if (currentUser && currentUser.database_connection_string) {
                setConnectionString(currentUser.database_connection_string);
            }
        } catch (error) {
            console.error("Could not load data management settings or user data", error);
            toast({ variant: "destructive", title: "Failed to load settings" });
        }
    };
    loadSettings();
  }, [toast]);

  const handleSync = async () => {
    setIsSyncing(true);
    toast({
      title: "Starting Database Synchronization",
      description: "This may take a few minutes. Please do not close the page.",
    });

    try {
      const response = await syncDatabase();
      const data = response.data;

      if (data.status === 'success') {
        toast({
          title: "Synchronization Complete",
          description: data.message,
        });
      } else {
        throw new Error(data.message || 'Sync failed');
      }
    } catch (error) {
      console.error("Sync failed:", error);
      let errorMessage = "An unexpected error occurred during sync.";

      if (error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        variant: "destructive",
        title: "Synchronization Failed",
        description: errorMessage,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckVolume = async () => {
    setIsCheckingVolume(true);
    toast({
      title: "Starting Data Volume Check",
      description: "Checking all tenants for high data volumes. This may take a moment.",
    });
    try {
      const response = await checkDataVolume();
      const { data } = response;
      toast({
        title: "Check Complete",
        description: `${data.message} ${data.notifications_created} notifications were sent.`,
      });
    } catch (error) {
      console.error("Error checking data volume:", error);
      toast({
        variant: "destructive",
        title: "Check Failed",
        description: error.message || "An unexpected error occurred.",
      });
    } finally {
      setIsCheckingVolume(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
        const dataToSave = {
            activity_retention_days: Number(settings.activity_retention_days),
            opportunity_retention_days: Number(settings.opportunity_retention_days),
        };

        if (settings.id) {
            await DataManagementSettings.update(settings.id, dataToSave);
        } else {
            const newSettings = await DataManagementSettings.create(dataToSave);
            setSettings(prev => ({...prev, id: newSettings.id}));
        }
        toast({ title: "Settings Saved Successfully" });
    } catch (error) {
        console.error("Failed to save settings:", error);
        toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
        setIsSavingSettings(false);
    }
  };

  const handleRunArchival = async () => {
    setIsArchiving(true);
    toast({
      title: "Starting Data Archival",
      description: "This process may take some time depending on data volume.",
    });
    try {
        const response = await archiveAgedData();
        const { data } = response;
        if(data.status === 'success'){
            toast({
                title: "Archival Process Complete",
                description: `Archived ${data.archived_activities} activities and ${data.archived_opportunities} opportunities.`,
            });
        } else {
            throw new Error(data.message || 'Archival failed');
        }
    } catch (error) {
        console.error("Archival failed:", error);
        toast({
            variant: "destructive",
            title: "Archival Failed",
            description: error.message || "An unexpected error occurred.",
        });
    } finally {
        setIsArchiving(false);
    }
  };

  const handleCleanupOrphaned = async () => {
    if (!confirm("Are you sure you want to permanently delete all old data that is not assigned to a tenant? This cannot be undone.")) {
      return;
    }
    setIsCleaningOrphaned(true);
    toast({
      title: "Starting Orphaned Data Cleanup...",
      description: "This may take a moment."
    });
    try {
      const { data } = await cleanupOrphanedData();
      if (data.status === 'success') {
        toast({
          title: "Cleanup Successful",
          description: data.message
        });
      } else {
        throw new Error(data.message || 'Cleanup failed');
      }
    } catch (error) {
      console.error("Error cleaning orphaned data:", error);
      toast({
        variant: "destructive",
        title: "Cleanup Failed",
        description: error.message || "An unexpected error occurred."
      });
    } finally {
      setIsCleaningOrphaned(false);
    }
  };

  const handleSaveConnection = async () => {
    setIsSavingConnection(true);
    try {
      await User.updateMyUserData({ database_connection_string: connectionString });
      toast({ title: "Database connection string saved successfully!" });
    } catch (error) {
      console.error("Failed to save connection string:", error);
      toast({ variant: "destructive", title: "Failed to save connection string", description: error.message || "An unexpected error occurred." });
    } finally {
      setIsSavingConnection(false);
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Database className="w-6 h-6 text-blue-600" />
            Database Connection
          </CardTitle>
          <CardDescription className="text-slate-400">
            Configure your external database connection for syncing and backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="connectionString" className="text-slate-200">PostgreSQL Connection String</Label>
            <Input
              id="connectionString"
              type="text"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              placeholder="postgresql://username:password@host:port/database"
              className="font-mono text-sm mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Example: postgresql://ai_sha_user:your_password@localhost:5432/ai_sha_crm
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveConnection} disabled={isSavingConnection} variant="outline" className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
              {isSavingConnection ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Save Connection</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Database className="w-6 h-6 text-blue-600" />
            Database Maintenance
          </CardTitle>
          <CardDescription className="text-slate-400">
            Perform database synchronization and data volume checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg border-slate-600 bg-slate-700/30">
            <div>
                <h3 className="font-semibold text-slate-200">Database Synchronization</h3>
                <p className="text-sm text-slate-400">Scan for and fix data inconsistencies.</p>
            </div>
            <Button onClick={handleSync} disabled={isSyncing} className="bg-blue-600 hover:bg-blue-700">
              {isSyncing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Run Sync</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Run Sync</>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg border-slate-600 bg-slate-700/30">
            <div>
                <h3 className="font-semibold text-slate-200">Data Volume Monitoring</h3>
                <p className="text-sm text-slate-400">Check for tenants exceeding data thresholds.</p>
            </div>
            <Button onClick={handleCheckVolume} disabled={isCheckingVolume} variant="outline" className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
              {isCheckingVolume ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking...</>
              ) : (
                <><BarChart3 className="w-4 h-4 mr-2" /> Check Volume</>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg border-amber-600/50 bg-amber-900/20">
            <div>
              <h3 className="font-semibold text-amber-200">Cleanup Orphaned Data</h3>
              <p className="text-sm text-amber-300">Permanently delete old records not assigned to any tenant.</p>
            </div>
            <Button
              onClick={handleCleanupOrphaned}
              disabled={isCleaningOrphaned}
              variant="outline"
              className="border-amber-600 text-amber-300 hover:bg-amber-900/40 hover:text-amber-200"
            >
              {isCleaningOrphaned ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cleaning...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Run Cleanup</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Archive className="w-6 h-6 text-blue-600" />
            Data Retention Policy
          </CardTitle>
          <CardDescription className="text-slate-400">
            Automatically archive old records to keep the application fast. Data is purged from the primary database but remains in your external sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label htmlFor="activity_retention_days" className="text-slate-200">Activity Retention (Days)</Label>
                <Input
                    id="activity_retention_days"
                    name="activity_retention_days"
                    type="number"
                    min="30"
                    max="365"
                    value={settings.activity_retention_days}
                    onChange={handleSettingsChange}
                    className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
                <p className="text-xs text-slate-500">Days to keep completed/cancelled activities.</p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="opportunity_retention_days" className="text-slate-200">Opportunity Retention (Days)</Label>
                <Input
                    id="opportunity_retention_days"
                    name="opportunity_retention_days"
                    type="number"
                    min="30"
                    max="365"
                    value={settings.opportunity_retention_days}
                    onChange={handleSettingsChange}
                    className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
                <p className="text-xs text-slate-500">Days to keep closed-won/lost opportunities.</p>
            </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6 border-slate-700">
            <Button onClick={handleRunArchival} disabled={isArchiving} variant="destructive">
                {isArchiving ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Archiving...</>
                ) : (
                    <><Archive className="w-4 h-4 mr-2" /> Run Archival Now</>
                )}
            </Button>
            <Button onClick={handleSaveSettings} disabled={isSavingSettings} className="bg-blue-600 hover:bg-blue-700">
                {isSavingSettings ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                    <><Save className="w-4 h-4 mr-2" /> Save Policy</>
                )}
            </Button>
        </CardFooter>
      </Card>

      <R2ConfigChecker />

      <Alert variant="destructive" className="bg-red-900/30 border-red-700/50">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <AlertTitle className="text-red-200">Warning</AlertTitle>
        <AlertDescription className="text-red-300">
          Database maintenance and archival are powerful tools that directly modify data. Please use them with caution. Archiving data is a permanent deletion from the app.
        </AlertDescription>
      </Alert>
    </div>
  );
}
