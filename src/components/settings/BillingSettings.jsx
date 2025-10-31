
import { useState, useEffect } from 'react';
import { SubscriptionPlan, Subscription, User, Tenant } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, Crown, Loader2, AlertCircle, Users, ExternalLink, Building2, Plug, Eye, EyeOff, Save, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createCheckoutSession } from '@/api/functions';
import { createBillingPortalSession } from '@/api/functions';
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { testStripeConnection } from "@/api/functions";

const AdminStripeConfig = ({ user, onUpdate }) => {
  const [config, setConfig] = useState({ secret_key: '', publishable_key: '', webhook_secret: '', is_connected: false });
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (user?.system_stripe_settings) {
      setConfig(user.system_stripe_settings);
      setTestResult({
        success: user.system_stripe_settings.is_connected,
        message: user.system_stripe_settings.is_connected ? 'Connection is active.' : 'Not tested.',
      });
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await User.updateMyUserData({ system_stripe_settings: { ...config, is_connected: testResult?.success || false } });
      toast.success("Stripe configuration saved.");
      onUpdate();
    } catch (error) {
      toast.error("Failed to save Stripe configuration.");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.secret_key) {
      toast.error("Please enter a Stripe Secret Key to test.");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const { data } = await testStripeConnection({ apiKey: config.secret_key });
      setTestResult(data);
      if (data.success) {
        toast.success("Stripe connection successful!");
        // Auto-save the connection status
        await User.updateMyUserData({ system_stripe_settings: { ...config, is_connected: true } });
        onUpdate();
      } else {
        toast.error(`Connection failed: ${data.message}`);
        await User.updateMyUserData({ system_stripe_settings: { ...config, is_connected: false } });
        onUpdate();
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      setTestResult({ success: false, message });
      toast.error(`Connection failed: ${message}`);
      await User.updateMyUserData({ system_stripe_settings: { ...config, is_connected: false } });
      onUpdate();
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700 mt-8">
      <CardHeader>
        <CardTitle className="text-slate-100">System Stripe Configuration</CardTitle>
        <CardDescription className="text-slate-400">
          Connect your Stripe account to process payments for tenant subscriptions. These keys are stored securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="stripe-secret" className="text-slate-300">Stripe Secret Key</Label>
          <div className="relative">
            <Input
              id="stripe-secret"
              type={showSecret ? 'text' : 'password'}
              value={config.secret_key || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, secret_key: e.target.value }))}
              placeholder="sk_live_..."
              className="bg-slate-700 border-slate-600 text-slate-200"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-slate-200"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stripe-publishable" className="text-slate-300">Stripe Publishable Key</Label>
          <Input
            id="stripe-publishable"
            value={config.publishable_key || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, publishable_key: e.target.value }))}
            placeholder="pk_live_..."
            className="bg-slate-700 border-slate-600 text-slate-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stripe-webhook" className="text-slate-300">Stripe Webhook Secret</Label>
          <Input
            id="stripe-webhook"
            value={config.webhook_secret || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, webhook_secret: e.target.value }))}
            placeholder="whsec_..."
            className="bg-slate-700 border-slate-600 text-slate-200"
          />
           <p className="text-xs text-slate-500">
            Find this in your Stripe Dashboard under Developers → Webhooks. Use the endpoint for `/functions/handleStripeWebhook`.
          </p>
        </div>
        
        {testResult && (
          <Alert className={testResult.success ? 'bg-green-900/30 border-green-700/50' : 'bg-red-900/30 border-red-700/50'}>
            {testResult.success ? <CheckCircle className="h-4 w-4 text-green-400" /> : <AlertCircle className="h-4 w-4 text-red-400" />}
            <AlertDescription className={testResult.success ? 'text-green-300' : 'text-red-300'}>
              {testResult.message}
            </AlertDescription>
          </Alert>
        )}

      </CardContent>
      <CardFooter className="flex gap-2">
        <Button onClick={handleSave} disabled={isSaving || isTesting} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={isSaving || isTesting} className="bg-slate-700 border-slate-600 hover:bg-slate-600">
          {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />}
          Test Connection
        </Button>
      </CardFooter>
    </Card>
  );
};


export default function BillingSettings() {
  const [plans, setPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [allSubscriptions, setAllSubscriptions] = useState([]);
  const [allTenants, setAllTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [plansData, userData] = await Promise.all([
        SubscriptionPlan.list('display_order'),
        User.me()
      ]);
      setPlans(plansData);
      setUser(userData);
      
      // Admin-specific data
      if (userData?.role === 'admin' || userData?.role === 'superadmin') {
        const [subsData, tenantsData] = await Promise.all([
            Subscription.list(),
            Tenant.list()
        ]);
        setAllSubscriptions(subsData);
        setAllTenants(tenantsData);
      }

      // User-specific data (for both admins and regular users)
      if (userData?.tenant_id) {
        const subscriptions = await Subscription.filter({ tenant_id: userData.tenant_id });
        if (subscriptions.length > 0) {
          setCurrentSubscription(subscriptions[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching billing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan) => {
    if (!user?.tenant_id) {
      alert("Tenant information is missing. Cannot subscribe.");
      return;
    }
    setIsProcessing(true);
    try {
      const { data } = await createCheckoutSession({ 
        priceId: plan.stripe_price_id,
        tenantId: user.tenant_id
      });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      alert("Could not initiate subscription. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManageSubscription = async (customerId) => {
    if (!customerId) {
      alert("Could not find customer billing information.");
      return;
    }
    setIsProcessing(true);
    try {
      const { data } = await createBillingPortalSession({ 
        customerId: customerId 
      });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating billing portal session:", error);
      alert("Could not open billing portal. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const getTenantSubscription = (tenantId) => {
    return allSubscriptions.find(sub => sub.tenant_id === tenantId);
  };

  const getPlanName = (planId) => {
    const plan = plans.find(p => p.id === planId);
    return plan ? plan.name : 'Unknown Plan';
  };

  if (loading) {
    return <div className="flex justify-center items-center p-10"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }
  
  if (user?.role === 'admin' || user?.role === 'superadmin') {
    return (
      <div className="space-y-8">
        <AdminStripeConfig user={user} onUpdate={fetchData} />

        {/* Available Subscription Plans */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">Available Subscription Plans</CardTitle>
            <CardDescription className="text-slate-400">
              These are the plans available to your tenants. Manage plan details through your Stripe dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan) => (
                <Card key={plan.id} className={`flex flex-col bg-slate-700 border-slate-600 ${plan.name === 'Professional' ? 'border-blue-500 relative' : ''}`}>
                  {plan.name === 'Professional' && (
                    <div className="absolute top-3 right-3">
                      <Crown className="w-5 h-5 text-yellow-500" />
                    </div>
                  )}
                  <CardHeader>
                    <h3 className="text-xl font-bold text-slate-100">{plan.name}</h3>
                    <p className="text-slate-400 text-sm">{plan.description}</p>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-slate-100">${plan.price_monthly}</span>
                      <span className="text-slate-400">/month</span>
                    </div>
                    <ul className="space-y-3">
                      {plan.features?.map((feature, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                          <span className="text-sm text-slate-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full bg-slate-600 hover:bg-slate-500" disabled>
                      Plan Configuration
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tenant Subscription Management */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Users className="w-5 h-5 text-blue-600" />
              Tenant Subscription Management
            </CardTitle>
            <CardDescription className="text-slate-400">
              View and manage subscriptions for all tenants in the system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-300">Tenant</TableHead>
                  <TableHead className="text-slate-300">Current Plan</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Renews On</TableHead>
                  <TableHead className="text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allTenants.map(tenant => {
                  const subscription = getTenantSubscription(tenant.id);
                  return (
                    <TableRow key={tenant.id} className="border-slate-700">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-500" />
                          <div>
                            <div className="font-medium text-slate-200">{tenant.name}</div>
                            {tenant.domain && (
                              <div className="text-xs text-slate-500">{tenant.domain}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {subscription ? (
                          <Badge variant="default" className="bg-blue-100 text-blue-800">
                            {getPlanName(subscription.plan_id)}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-600 text-slate-300">No Active Plan</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {subscription ? (
                          <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'} 
                                 className={subscription.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-600 text-slate-300'}>
                            {subscription.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-700 border-slate-600 text-slate-300">Unsubscribed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {subscription?.current_period_end ? 
                          new Date(subscription.current_period_end).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {subscription ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleManageSubscription(subscription.stripe_customer_id)}
                            disabled={isProcessing}
                            className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            ) : (
                              <ExternalLink className="w-3 h-3 mr-2" />
                            )}
                            Manage
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-500">No subscription</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {allTenants.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No tenants found in the system.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // View for Regular Users
  const currentPlan = plans.find(p => p.id === currentSubscription?.plan_id);
  
  return (
    <div className="space-y-6">
      {currentSubscription && currentPlan ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">Your Subscription</CardTitle>
            <CardDescription className="text-slate-400">Manage your current plan and billing details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border rounded-lg bg-slate-700/50 border-slate-600">
              <h3 className="text-lg font-semibold text-blue-400">{currentPlan.name}</h3>
              <p className="text-slate-300">You are currently subscribed to the {currentPlan.name} plan.</p>
              <div className="mt-2 text-sm">
                Status: <Badge className={currentSubscription.status === 'active' ? 'bg-green-600 text-white' : 'bg-slate-600 text-slate-300'}>{currentSubscription.status}</Badge>
              </div>
              {currentSubscription.current_period_end && (
                <div className="mt-1 text-sm text-slate-400">
                  Your plan renews on {new Date(currentSubscription.current_period_end).toLocaleDateString()}.
                </div>
              )}
            </div>
            <Button 
                onClick={() => handleManageSubscription(currentSubscription.stripe_customer_id)}
                disabled={isProcessing}
                className="bg-blue-600 hover:bg-blue-700"
            >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Manage Billing & Subscription
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
            <Alert className="bg-red-900/30 border-red-700/50">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertTitle className="text-red-200">No Active Subscription</AlertTitle>
                <AlertDescription className="text-red-300">
                Please choose a plan below to activate your CRM features.
                </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
                <Card key={plan.id} className={`flex flex-col bg-slate-700 border-slate-600 ${plan.name === 'Professional' ? 'border-blue-500' : ''}`}>
                <CardHeader>
                    <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-100">{plan.name}</h3>
                    {plan.name === 'Professional' && <Crown className="w-5 h-5 text-yellow-500" />}
                    </div>
                    <p className="text-slate-400 text-sm">{plan.description}</p>
                </CardHeader>
                <CardContent className="flex-1">
                    <div className="mb-6">
                    <span className="text-4xl font-bold text-slate-100">${plan.price_monthly}</span>
                    <span className="text-slate-400">/month</span>
                    </div>
                    <ul className="space-y-3">
                    {plan.features?.map((feature, i) => (
                        <li key={i} className="flex items-center gap-3">
                        <Check className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-slate-300">{feature}</span>
                        </li>
                    ))}
                    </ul>
                </CardContent>
                <CardFooter>
                    <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700" 
                        onClick={() => handleSubscribe(plan)}
                        disabled={isProcessing}
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Choose Plan
                    </Button>
                </CardFooter>
                </Card>
            ))}
            </div>
        </>
      )}
    </div>
  );
}
