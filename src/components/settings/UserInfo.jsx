import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User as UserIcon, Loader2 } from "lucide-react";
import { useUser } from "@/components/shared/useUser.js";

export default function UserInfo() {
  const { user: currentUser, loading } = useUser();

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
        </CardContent>
      </Card>
    </div>);

}