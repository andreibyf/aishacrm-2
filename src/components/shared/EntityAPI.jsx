// Entity API Documentation Component

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Database, Shield, Zap } from "lucide-react";

export default function EntityAPI() {
  const entities = [
    {
      name: "Contact",
      description: "Individual contacts and their details",
      required: ["first_name", "last_name", "email"],
      endpoints: [
        {
          method: "GET",
          path: "Contact.list()",
          description: "List all contacts",
        },
        {
          method: "POST",
          path: "Contact.create(data)",
          description: "Create new contact",
        },
        {
          method: "PUT",
          path: "Contact.update(id, data)",
          description: "Update contact",
        },
        {
          method: "DELETE",
          path: "Contact.delete(id)",
          description: "Delete contact",
        },
      ],
    },
    {
      name: "Account",
      description: "Companies and organizations",
      required: ["name"],
      endpoints: [
        {
          method: "GET",
          path: "Account.list()",
          description: "List all accounts",
        },
        {
          method: "POST",
          path: "Account.create(data)",
          description: "Create new account",
        },
        {
          method: "PUT",
          path: "Account.update(id, data)",
          description: "Update account",
        },
        {
          method: "DELETE",
          path: "Account.delete(id)",
          description: "Delete account",
        },
      ],
    },
    {
      name: "Lead",
      description: "Potential customers and prospects",
      required: ["first_name", "last_name", "email"],
      endpoints: [
        { method: "GET", path: "Lead.list()", description: "List all leads" },
        {
          method: "POST",
          path: "Lead.create(data)",
          description: "Create new lead",
        },
        {
          method: "PUT",
          path: "Lead.update(id, data)",
          description: "Update lead",
        },
        {
          method: "DELETE",
          path: "Lead.delete(id)",
          description: "Delete lead",
        },
      ],
    },
    {
      name: "Opportunity",
      description: "Sales opportunities and pipeline",
      required: ["name", "amount", "close_date"],
      endpoints: [
        {
          method: "GET",
          path: "Opportunity.list()",
          description: "List all opportunities",
        },
        {
          method: "POST",
          path: "Opportunity.create(data)",
          description: "Create new opportunity",
        },
        {
          method: "PUT",
          path: "Opportunity.update(id, data)",
          description: "Update opportunity",
        },
        {
          method: "DELETE",
          path: "Opportunity.delete(id)",
          description: "Delete opportunity",
        },
      ],
    },
    {
      name: "Activity",
      description: "Tasks, meetings, calls, and activities",
      required: ["type", "subject", "due_date"],
      endpoints: [
        {
          method: "GET",
          path: "Activity.list()",
          description: "List all activities",
        },
        {
          method: "POST",
          path: "Activity.create(data)",
          description: "Create new activity",
        },
        {
          method: "PUT",
          path: "Activity.update(id, data)",
          description: "Update activity",
        },
        {
          method: "DELETE",
          path: "Activity.delete(id)",
          description: "Delete activity",
        },
      ],
    },
    {
      name: "TenantIntegration",
      description: "Tenant-specific integrations with external services",
      required: ["tenant_id", "integration_type", "integration_name"],
      endpoints: [
        {
          method: "GET",
          path: "TenantIntegration.list()",
          description: "List tenant integrations",
        },
        {
          method: "POST",
          path: "TenantIntegration.create(data)",
          description: "Create new integration",
        },
        {
          method: "PUT",
          path: "TenantIntegration.update(id, data)",
          description: "Update integration",
        },
        {
          method: "DELETE",
          path: "TenantIntegration.delete(id)",
          description: "Delete integration",
        },
      ],
    },
    {
      name: "TestReport",
      description: "Stores the results of comprehensive system integrity tests",
      required: ["test_date", "status", "report_data", "triggered_by"],
      endpoints: [
        {
          method: "GET",
          path: "TestReport.list()",
          description: "List all test reports",
        },
        {
          method: "POST",
          path: "TestReport.create(data)",
          description: "Create a new test report (system use)",
        },
      ],
    },
  ];

  const getMethodColor = (method) => {
    switch (method) {
      case "GET":
        return "bg-green-100 text-green-800";
      case "POST":
        return "bg-blue-100 text-blue-800";
      case "PUT":
        return "bg-yellow-100 text-yellow-800";
      case "DELETE":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Ai-SHA CRM API Documentation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 mb-4">
            Ai-SHA CRM uses the base44 platform's built-in entity SDK for all
            data operations. Each entity provides a consistent API for CRUD
            operations with built-in tenant isolation.
          </p>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="authentication">Authentication</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {entities.map((entity) => (
                <Card key={entity.name} className="border">
                  <CardHeader>
                    <CardTitle className="text-lg">{entity.name}</CardTitle>
                    <p className="text-sm text-slate-600">
                      {entity.description}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <h4 className="font-semibold text-sm mb-2">Endpoints:</h4>
                    <div className="space-y-2">
                      {entity.endpoints.map((endpoint, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 border rounded-md bg-slate-50/50"
                        >
                          <div className="flex items-center gap-3">
                            <Badge className={getMethodColor(endpoint.method)}>
                              {endpoint.method}
                            </Badge>
                            <code className="text-sm bg-slate-200/50 px-2 py-1 rounded">
                              {endpoint.path}
                            </code>
                          </div>
                          <span className="text-sm text-slate-600 hidden md:inline">
                            {endpoint.description}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <h4 className="font-semibold text-sm mb-2">
                        Required Fields for Creation:
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {entity.required.map((field) => (
                          <Badge
                            key={field}
                            variant="outline"
                            className="font-mono"
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="authentication">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Authentication & Authorization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">
                      Authentication Method
                    </h4>
                    <p className="text-slate-600">
                      Ai-SHA CRM uses Google OAuth 2.0 for authentication,
                      managed by the base44 platform. No custom JWT
                      implementation needed.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">User Roles</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">admin</Badge>
                        <span className="text-sm">
                          Full access to all CRM features and settings across
                          all tenants
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">power-user</Badge>
                        <span className="text-sm">
                          Manages all data within an assigned tenant, including
                          integrations
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">user</Badge>
                        <span className="text-sm">
                          Standard access; can only manage their own assigned
                          records within their tenant
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">
                      Multi-Tenant Data Isolation
                    </h4>
                    <p className="text-slate-600">
                      All data is strictly segregated by{" "}
                      <code className="bg-slate-100 p-1 rounded">
                        tenant_id
                      </code>. Users can only access data belonging to their
                      assigned tenant. The Admin role is the only exception,
                      having cross-tenant visibility for management purposes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Tenant-Specific Integrations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-slate-600">
                    Each tenant maintains their own private integrations with
                    external services, ensuring complete data isolation and
                    security.
                  </p>

                  <div>
                    <h4 className="font-semibold mb-2">
                      Supported Integrations
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="p-3 border rounded-lg">
                        <h5 className="font-medium">Google Services</h5>
                        <p className="text-sm text-slate-600">
                          Drive, Calendar, and Gmail integration with OAuth
                          authentication
                        </p>
                      </div>
                      <div className="p-3 border rounded-lg">
                        <h5 className="font-medium">Zapier</h5>
                        <p className="text-sm text-slate-600">
                          Connect to 1000+ apps with webhook-based automation
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Security</h4>
                    <p className="text-sm text-slate-600">
                      API credentials are encrypted at rest and isolated per
                      tenant. Only Power Users within each tenant can manage
                      their organization's integrations.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhooks">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Webhook Integration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-slate-600">
                    Webhooks can be configured in{" "}
                    <Badge variant="outline">Settings → Webhooks</Badge>{" "}
                    to send real-time data to external services like Zapier or
                    n8n when events occur in the CRM (e.g., a new contact is
                    created).
                  </p>

                  <div>
                    <h4 className="font-semibold mb-2">Supported Events</h4>
                    <p className="text-sm text-slate-600">
                      You can create webhooks for create, update, and delete
                      events for Contacts, Accounts, Leads, Opportunities, and
                      Activities.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
