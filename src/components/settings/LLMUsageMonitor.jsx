import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Brain,
  CheckCircle,
  DollarSign,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Tenant, TenantIntegration } from "@/api/entities";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LLMUsageMonitor() {
  const [tenants, setTenants] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTenants: 0,
    tenantsWithOwnLLM: 0,
    tenantsUsingSystemLLM: 0,
    llmTypes: {},
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsData, integrationsData] = await Promise.all([
        Tenant.list(),
        TenantIntegration.filter({
          integration_type: ["openai_llm", "anthropic_llm", "azure_openai_llm"],
        }),
      ]);

      setTenants(tenantsData);
      setIntegrations(integrationsData);

      // Calculate statistics
      const activeLLMIntegrations = integrationsData.filter((i) => i.is_active);
      const tenantsWithLLM = new Set(
        activeLLMIntegrations.map((i) => i.tenant_id),
      );

      const llmTypeCounts = {};
      activeLLMIntegrations.forEach((integration) => {
        llmTypeCounts[integration.integration_type] =
          (llmTypeCounts[integration.integration_type] || 0) + 1;
      });

      setStats({
        totalTenants: tenantsData.length,
        tenantsWithOwnLLM: tenantsWithLLM.size,
        tenantsUsingSystemLLM: tenantsData.length - tenantsWithLLM.size,
        llmTypes: llmTypeCounts,
      });
    } catch (error) {
      console.error("Error loading LLM usage data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTenantLLMInfo = (tenantId) => {
    const tenantIntegrations = integrations.filter((i) =>
      i.tenant_id === tenantId && i.is_active
    );

    if (tenantIntegrations.length === 0) {
      return {
        type: "system",
        provider: "System Default",
        status: "using_system",
      };
    }

    const integration = tenantIntegrations[0]; // Use first active integration
    return {
      type: "tenant",
      provider: integration.integration_type.replace("_", " ").replace(
        "llm",
        "LLM",
      ).toUpperCase(),
      status: integration.sync_status,
      lastSync: integration.last_sync,
      integrationName: integration.integration_name,
    };
  };

  const getStatusBadge = (status, type) => {
    if (type === "system") {
      return (
        <Badge className="bg-blue-700 text-blue-100 hover:bg-blue-700">
          Using Your Credits
        </Badge>
      );
    }

    switch (status) {
      case "connected":
        return (
          <Badge className="bg-green-700 text-green-100 hover:bg-green-700">
            Own API Key
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "pending":
        return (
          <Badge
            variant="secondary"
            className="bg-slate-600 text-slate-200 hover:bg-slate-600"
          >
            Configuring
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="outline" className="border-slate-500 text-slate-300">
            Disconnected
          </Badge>
        );
      default:
        return (
          <Badge
            variant="secondary"
            className="bg-slate-600 text-slate-200 hover:bg-slate-600"
          >
            {status}
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-slate-400" />
          <p className="text-slate-300">Loading LLM usage data...</p>
        </CardContent>
      </Card>
    );
  }

  const selfServiceRate = stats.totalTenants > 0
    ? Math.round((stats.tenantsWithOwnLLM / stats.totalTenants) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-slate-100">
                  {stats.totalTenants}
                </p>
                <p className="text-sm text-slate-400">Total Tenants</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-slate-100">
                  {stats.tenantsWithOwnLLM}
                </p>
                <p className="text-sm text-slate-400">Own API Keys</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-2xl font-bold text-slate-100">
                  {stats.tenantsUsingSystemLLM}
                </p>
                <p className="text-sm text-slate-400">Using Your Credits</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-slate-600" />
              <div>
                <p className="text-2xl font-bold text-slate-100">
                  {selfServiceRate}%
                </p>
                <p className="text-sm text-slate-400">Self-Service Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Impact Alert */}
      {stats.tenantsUsingSystemLLM > 0 && (
        <Alert className="border-amber-600/50 bg-amber-900/30">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300">
            <strong>{stats.tenantsUsingSystemLLM} tenants</strong>{" "}
            are currently using your system LLM credits. Consider encouraging
            them to set up their own API keys in{" "}
            <strong>Settings &gt; Integrations</strong> to reduce your costs.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Data Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Brain className="w-5 h-5 text-purple-600" />
              LLM Usage by Tenant
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-300">Tenant</TableHead>
                <TableHead className="text-slate-300">LLM Provider</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300">Configuration</TableHead>
                <TableHead className="text-slate-300">Cost Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => {
                const llmInfo = getTenantLLMInfo(tenant.id);
                return (
                  <TableRow key={tenant.id} className="border-slate-700">
                    <TableCell>
                      <div>
                        <div className="font-medium text-slate-200">
                          {tenant.name}
                        </div>
                        {tenant.domain && (
                          <div className="text-sm text-slate-400">
                            {tenant.domain}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-200">
                          {llmInfo.provider}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(llmInfo.status, llmInfo.type)}
                    </TableCell>
                    <TableCell>
                      {llmInfo.type === "tenant"
                        ? (
                          <div className="text-sm">
                            <div className="text-slate-200">
                              {llmInfo.integrationName}
                            </div>
                            {llmInfo.lastSync && (
                              <div className="text-slate-400">
                                Last sync:{" "}
                                {new Date(llmInfo.lastSync)
                                  .toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        )
                        : (
                          <div className="text-sm text-slate-400">
                            Default system configuration
                          </div>
                        )}
                    </TableCell>
                    <TableCell>
                      {llmInfo.type === "system"
                        ? (
                          <div className="flex items-center gap-1 text-amber-400">
                            <DollarSign className="w-3 h-3" />
                            <span className="text-sm">Your cost</span>
                          </div>
                        )
                        : (
                          <div className="flex items-center gap-1 text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            <span className="text-sm">Their cost</span>
                          </div>
                        )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-slate-400"
                  >
                    No tenants found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* LLM Provider Breakdown */}
      {Object.keys(stats.llmTypes).length > 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Zap className="w-5 h-5 text-blue-600" />
              LLM Provider Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(stats.llmTypes).map(([provider, count]) => (
                <div
                  key={provider}
                  className="p-4 border rounded-lg border-slate-600 bg-slate-700/30"
                >
                  <div className="text-lg font-semibold text-slate-200">
                    {provider.replace("_", " ").replace("llm", "LLM")
                      .toUpperCase()}
                  </div>
                  <div className="text-2xl font-bold text-blue-400">
                    {count}
                  </div>
                  <div className="text-sm text-slate-400">
                    {count === 1 ? "tenant" : "tenants"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
