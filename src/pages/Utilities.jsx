import { useEffect, useState } from "react";
import { User } from "@/api/entities";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Database, Loader2, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function UtilitiesPage() {
  const [, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // REMOVED: Local module permission check
  // Module visibility is now controlled centrally by ModuleSettings in Layout

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Error loading user:", error);
        }
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const utilities = [
    {
      id: "cleanup-orphaned-data",
      name: "Clean Up Orphaned Data",
      description:
        "Removes records without a tenant_id, ensuring data integrity.",
      icon: Database,
      page: "CleanupOrphanedData",
    },
    {
      id: "data-diagnostics",
      name: "Data Diagnostics",
      description:
        "Analyze and troubleshoot data inconsistencies across your system.",
      icon: Database,
      page: "DataDiagnostics",
    },
    // Add more utility tools here as needed
    // {
    //   id: "another-utility",
    //   name: "Another Utility Tool",
    //   description: "Description of another utility tool.",
    //   icon: SomeIcon,
    //   page: "AnotherUtilityPage",
    // },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Wrench className="w-5 h-5 text-blue-400" />
            System Utilities
          </CardTitle>
          <CardDescription className="text-slate-400">
            Administrative tools for data management and system maintenance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {utilities.map((utility) => (
              <Link
                key={utility.id}
                to={createPageUrl(utility.page)}
                className="block"
              >
                <Card className="bg-slate-700/50 border-slate-600 hover:bg-slate-700 hover:border-blue-500 transition-all cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                        <utility.icon className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-slate-100 text-base">
                          {utility.name}
                        </CardTitle>
                        <CardDescription className="text-slate-400 text-sm mt-1">
                          {utility.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
