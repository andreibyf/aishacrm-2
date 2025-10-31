import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User } from "@/api/entities";
import { User as UserIcon, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cleanupUserData } from "@/api/functions";

export default function UserInfo() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    setLoading(true);
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupUserData = async () => {
    if (!confirm("This will reset your custom branding and permission settings to fix display issues. Your role will NOT be changed. Continue?")) {
      return;
    }

    setCleaning(true);
    try {
      const response = await cleanupUserData();
      const result = response.data;

      if (result.status === 'success') {
        alert("User data cleaned successfully! Please refresh the page.");
        loadCurrentUser();
      } else {
        alert("Error cleaning user data: " + result.message);
      }
    } catch (error) {
      console.error("Error calling cleanup function:", error);
      const errorMessage = error.response?.data?.message || error.message || "An unknown error occurred.";
      alert("Error cleaning user data: " + errorMessage);
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-slate-400" />
          <p className="text-slate-300">Loading Your Profile...</p>
        </CardContent>
      </Card>);

  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <UserIcon className="w-5 h-5 text-blue-400" />
            My Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong className="text-slate-200">Name:</strong> 
            <span className="text-slate-300 ml-2">{currentUser?.full_name || "Not set"}</span>
          </div>
          <div>
            <strong className="text-slate-200">Email:</strong> 
            <span className="text-slate-300 ml-2">{currentUser?.email || "Not set"}</span>
          </div>
          <div>
            <strong className="text-slate-200">Role:</strong> 
            <Badge variant="destructive" className="ml-2 capitalize bg-red-600 text-white hover:bg-red-700">
              {currentUser?.role === 'power-user' ? 'Power User' : currentUser?.role || 'user'}
            </Badge>
          </div>
          
          {currentUser?.role === 'admin' &&
          <Alert variant="default" className="bg-green-900/30 border-green-700/50">
                <ShieldCheck className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-emerald-600 text-sm [&_p]:leading-relaxed">
                    <strong>You are the App Owner.</strong> Your Admin role is protected and gives you full control over the CRM. You can assign Power-User and User roles to your team members.
                </AlertDescription>
            </Alert>
          }
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
            <CardTitle className="text-slate-100">Data Maintenance</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-blue-900/30 border-blue-700/50">
            <RefreshCw className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              <div className="flex justify-between items-center">
                <span className="text-blue-600">Fix display issues or errors in the base44 dashboard by cleaning your user data:</span>
                <Button
                  onClick={handleCleanupUserData}
                  size="sm"
                  disabled={cleaning}
                  className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">

                  {cleaning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {cleaning ? 'Cleaning...' : 'Clean My Data'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>);

}