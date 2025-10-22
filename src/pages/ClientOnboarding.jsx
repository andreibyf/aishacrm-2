import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, CheckCircle2, Loader2, Calendar } from 'lucide-react';
import { submitClientRequirement } from '@/api/functions';
import { toast } from 'sonner';

const moduleOptions = [
{ id: 'dashboard', label: 'Dashboard', description: 'Central analytics hub', default: true },
{ id: 'contacts', label: 'Contact Management', description: 'Manage customer contacts', default: true },
{ id: 'accounts', label: 'Account Management', description: 'Manage companies', default: true },
{ id: 'leads', label: 'Lead Management', description: 'Track potential customers', default: true },
{ id: 'opportunities', label: 'Opportunities', description: 'Manage sales pipeline', default: true },
{ id: 'activities', label: 'Activity Tracking', description: 'Tasks, calls, meetings', default: true },
{ id: 'calendar', label: 'Calendar', description: 'Schedule management', default: true },
{ id: 'reports', label: 'Analytics & Reports', description: 'Business intelligence', default: true },
{ id: 'bizdev_sources', label: 'BizDev Sources', description: 'Import business directories', default: false },
{ id: 'cash_flow', label: 'Cash Flow Management', description: 'Track income/expenses', default: false },
{ id: 'document_processing', label: 'Document Processing', description: 'AI document extraction', default: false },
{ id: 'employees', label: 'Employee Management', description: 'Manage team members', default: false },
{ id: 'integrations', label: 'Integrations', description: 'Connect external tools', default: false },
{ id: 'payment_portal', label: 'Payment Portal', description: 'Stripe integration', default: false },
{ id: 'ai_campaigns', label: 'AI Campaigns', description: 'AI-powered outreach', default: false },
{ id: 'utilities', label: 'Utilities', description: 'Data quality tools', default: false }];


export default function ClientOnboarding() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    company_name: '',
    industry: '',
    business_model: 'b2b',
    geographic_focus: 'north_america',
    project_title: '',
    project_description: '',
    target_test_date: '',
    target_implementation_date: '',
    selected_modules: moduleOptions.reduce((acc, mod) => {
      acc[mod.id] = mod.default;
      return acc;
    }, {}),
    initial_employee: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: 'admin',
      employee_role: 'manager',
      access_level: 'read_write',
      has_crm_access: true
    }
  });

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateEmployeeField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      initial_employee: { ...prev.initial_employee, [field]: value }
    }));
  };

  const toggleModule = (moduleId) => {
    setFormData((prev) => ({
      ...prev,
      selected_modules: {
        ...prev.selected_modules,
        [moduleId]: !prev.selected_modules[moduleId]
      }
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data } = await submitClientRequirement(formData);
      if (data.success) {
        setSubmitted(true);
        toast.success('Your request has been submitted successfully!');
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Submission error:', error);
      toast.error(error.response?.data?.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full bg-slate-800 border-slate-700">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-3xl font-bold text-slate-100 mb-4">Thank You!</h2>
            <p className="text-slate-300 text-lg mb-2">Your onboarding request has been submitted.</p>
            <p className="text-slate-400">Our team will review your requirements and contact you within 24-48 hours.</p>
          </CardContent>
        </Card>
      </div>);

  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Building2 className="w-12 h-12 text-blue-400" />
            <h1 className="text-lime-500 text-4xl font-bold">Ai-SHA CRM</h1>
          </div>
          <p className="text-lime-500 text-lg">Client Onboarding Portal</p>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center">
            {[1, 2, 3, 4].map((s) =>
            <div key={s} className="flex items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
              step >= s ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`
              }>
                  {s}
                </div>
                {s < 4 && <div className={`flex-1 h-1 mx-2 ${step > s ? 'bg-blue-600' : 'bg-slate-700'}`} />}
              </div>
            )}
          </div>
          <div className="text-yellow-300 mt-2 text-xs flex justify-between">
            <span>Company Info</span>
            <span>Project Details</span>
            <span>Modules</span>
            <span>Contact Info</span>
          </div>
        </div>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">
              {step === 1 && 'Company Information'}
              {step === 2 && 'Project Details'}
              {step === 3 && 'Select CRM Modules'}
              {step === 4 && 'Primary Contact'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {step === 1 && 'Tell us about your organization'}
              {step === 2 && 'Describe your project and timeline'}
              {step === 3 && 'Choose the features you need'}
              {step === 4 && 'Who will be the main administrator?'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 &&
            <>
                <div>
                  <Label className="text-slate-200">Company Name *</Label>
                  <Input
                  value={formData.company_name}
                  onChange={(e) => updateField('company_name', e.target.value)}
                  placeholder="Your Company Inc."
                  className="bg-slate-700 border-slate-600 text-slate-100"
                  required />

                </div>

                <div>
                  <Label className="text-slate-200">Industry *</Label>
                  <Select value={formData.industry} onValueChange={(v) => updateField('industry', v)}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 max-h-[300px]">
                      <SelectItem value="accounting_and_finance">Accounting & Finance</SelectItem>
                      <SelectItem value="aerospace_and_defense">Aerospace & Defense</SelectItem>
                      <SelectItem value="agriculture_and_farming">Agriculture & Farming</SelectItem>
                      <SelectItem value="automotive_and_transportation">Automotive & Transportation</SelectItem>
                      <SelectItem value="banking_and_financial_services">Banking & Financial Services</SelectItem>
                      <SelectItem value="biotechnology_and_pharmaceuticals">Biotechnology & Pharmaceuticals</SelectItem>
                      <SelectItem value="chemicals_and_materials">Chemicals & Materials</SelectItem>
                      <SelectItem value="construction_and_engineering">Construction & Engineering</SelectItem>
                      <SelectItem value="consulting_and_professional_services">Consulting & Professional Services</SelectItem>
                      <SelectItem value="consumer_goods_and_retail">Consumer Goods & Retail</SelectItem>
                      <SelectItem value="cybersecurity">Cybersecurity</SelectItem>
                      <SelectItem value="data_analytics_and_business_intelligence">Data Analytics & Business Intelligence</SelectItem>
                      <SelectItem value="education_and_training">Education & Training</SelectItem>
                      <SelectItem value="energy_oil_and_gas">Energy, Oil & Gas</SelectItem>
                      <SelectItem value="entertainment_and_media">Entertainment & Media</SelectItem>
                      <SelectItem value="environmental_services">Environmental Services</SelectItem>
                      <SelectItem value="event_management">Event Management</SelectItem>
                      <SelectItem value="fashion_and_apparel">Fashion & Apparel</SelectItem>
                      <SelectItem value="food_and_beverage">Food & Beverage</SelectItem>
                      <SelectItem value="franchising">Franchising</SelectItem>
                      <SelectItem value="gaming_and_esports">Gaming & Esports</SelectItem>
                      <SelectItem value="government_and_public_sector">Government & Public Sector</SelectItem>
                      <SelectItem value="green_energy_and_solar">Green Energy & Solar</SelectItem>
                      <SelectItem value="healthcare_and_medical_services">Healthcare & Medical Services</SelectItem>
                      <SelectItem value="hospitality_and_tourism">Hospitality & Tourism</SelectItem>
                      <SelectItem value="human_resources_and_staffing">Human Resources & Staffing</SelectItem>
                      <SelectItem value="information_technology_and_software">Information Technology & Software</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="interior_design_and_architecture">Interior Design & Architecture</SelectItem>
                      <SelectItem value="legal_services">Legal Services</SelectItem>
                      <SelectItem value="logistics_and_supply_chain">Logistics & Supply Chain</SelectItem>
                      <SelectItem value="manufacturing_industrial">Manufacturing (Industrial)</SelectItem>
                      <SelectItem value="marketing_advertising_and_pr">Marketing, Advertising & PR</SelectItem>
                      <SelectItem value="mining_and_metals">Mining & Metals</SelectItem>
                      <SelectItem value="nonprofit_and_ngos">Nonprofit & NGOs</SelectItem>
                      <SelectItem value="packaging_and_printing">Packaging & Printing</SelectItem>
                      <SelectItem value="pharmaceuticals">Pharmaceuticals</SelectItem>
                      <SelectItem value="real_estate_and_property_management">Real Estate & Property Management</SelectItem>
                      <SelectItem value="renewable_energy">Renewable Energy</SelectItem>
                      <SelectItem value="research_and_development">Research & Development</SelectItem>
                      <SelectItem value="retail_and_wholesale">Retail & Wholesale</SelectItem>
                      <SelectItem value="robotics_and_automation">Robotics & Automation</SelectItem>
                      <SelectItem value="saas_and_cloud_services">SaaS & Cloud Services</SelectItem>
                      <SelectItem value="security_services">Security Services</SelectItem>
                      <SelectItem value="social_media_and_influencer">Social Media & Influencer</SelectItem>
                      <SelectItem value="sports_and_recreation">Sports & Recreation</SelectItem>
                      <SelectItem value="telecommunications">Telecommunications</SelectItem>
                      <SelectItem value="textiles_and_apparel">Textiles & Apparel</SelectItem>
                      <SelectItem value="transportation_and_delivery">Transportation & Delivery</SelectItem>
                      <SelectItem value="utilities_water_and_waste">Utilities (Water & Waste)</SelectItem>
                      <SelectItem value="veterinary_services">Veterinary Services</SelectItem>
                      <SelectItem value="warehousing_and_distribution">Warehousing & Distribution</SelectItem>
                      <SelectItem value="wealth_management">Wealth Management</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-200">Business Model</Label>
                    <Select value={formData.business_model} onValueChange={(v) => updateField('business_model', v)}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="b2b">B2B (Business to Business)</SelectItem>
                        <SelectItem value="b2c">B2C (Business to Consumer)</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-200">Geographic Focus</Label>
                    <Select value={formData.geographic_focus} onValueChange={(v) => updateField('geographic_focus', v)}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="north_america">North America</SelectItem>
                        <SelectItem value="europe">Europe</SelectItem>
                        <SelectItem value="asia">Asia</SelectItem>
                        <SelectItem value="south_america">South America</SelectItem>
                        <SelectItem value="africa">Africa</SelectItem>
                        <SelectItem value="oceania">Oceania</SelectItem>
                        <SelectItem value="global">Global</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            }

            {step === 2 &&
            <>
                <div>
                  <Label className="text-slate-200">Project Title</Label>
                  <Input
                  value={formData.project_title}
                  onChange={(e) => updateField('project_title', e.target.value)}
                  placeholder="CRM Implementation 2025"
                  className="bg-slate-700 border-slate-600 text-slate-100" />

                </div>

                <div>
                  <Label className="text-slate-200">Project Description</Label>
                  <Textarea
                  value={formData.project_description}
                  onChange={(e) => updateField('project_description', e.target.value)}
                  placeholder="Describe your goals, team size, current challenges..."
                  className="bg-slate-700 border-slate-600 text-slate-100 min-h-[120px]" />

                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-200 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Target Test Date
                    </Label>
                    <Input
                    type="date"
                    value={formData.target_test_date}
                    onChange={(e) => updateField('target_test_date', e.target.value)}
                    className="bg-slate-700 border-slate-600 text-slate-100" />

                  </div>
                  <div>
                    <Label className="text-slate-200 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Target Go-Live Date
                    </Label>
                    <Input
                    type="date"
                    value={formData.target_implementation_date}
                    onChange={(e) => updateField('target_implementation_date', e.target.value)}
                    className="bg-slate-700 border-slate-600 text-slate-100" />

                  </div>
                </div>
              </>
            }

            {step === 3 &&
            <div className="space-y-3">
                <Alert className="bg-blue-900/30 border-blue-700/50">
                  <AlertDescription className="text-blue-300">
                    Select the modules you need. You can always add more later.
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {moduleOptions.map((module) =>
                <div
                  key={module.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  formData.selected_modules[module.id] ?
                  'bg-blue-900/30 border-blue-600' :
                  'bg-slate-700/50 border-slate-600 hover:border-slate-500'}`
                  }
                  onClick={() => toggleModule(module.id)}>

                      <div className="flex items-start gap-3">
                        <Checkbox
                      checked={formData.selected_modules[module.id]}
                      className="mt-1" />

                        <div className="flex-1">
                          <div className="font-medium text-slate-100">{module.label}</div>
                          <div className="text-xs text-slate-400">{module.description}</div>
                        </div>
                      </div>
                    </div>
                )}
                </div>
              </div>
            }

            {step === 4 &&
            <>
                <Alert className="bg-amber-900/30 border-amber-700/50">
                  <AlertDescription className="text-amber-300">
                    This person will be the primary admin and receive the invitation email.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-200">First Name *</Label>
                    <Input
                    value={formData.initial_employee.first_name}
                    onChange={(e) => updateEmployeeField('first_name', e.target.value)}
                    placeholder="John"
                    className="bg-slate-700 border-slate-600 text-slate-100"
                    required />

                  </div>
                  <div>
                    <Label className="text-slate-200">Last Name *</Label>
                    <Input
                    value={formData.initial_employee.last_name}
                    onChange={(e) => updateEmployeeField('last_name', e.target.value)}
                    placeholder="Doe"
                    className="bg-slate-700 border-slate-600 text-slate-100"
                    required />

                  </div>
                </div>

                <div>
                  <Label className="text-slate-200">Email *</Label>
                  <Input
                  type="email"
                  value={formData.initial_employee.email}
                  onChange={(e) => updateEmployeeField('email', e.target.value)}
                  placeholder="john.doe@company.com"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                  required />

                </div>

                <div>
                  <Label className="text-slate-200">Phone</Label>
                  <Input
                  type="tel"
                  value={formData.initial_employee.phone}
                  onChange={(e) => updateEmployeeField('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="bg-slate-700 border-slate-600 text-slate-100" />

                </div>
              </>
            }

            <div className="flex justify-between pt-6 border-t border-slate-700">
              {step > 1 &&
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">

                  Back
                </Button>
              }
              {step < 4 ?
              <Button
                type="button"
                onClick={() => setStep(step + 1)}
                className="ml-auto bg-blue-600 hover:bg-blue-700"
                disabled={
                step === 1 && (!formData.company_name || !formData.industry) ||
                step === 4 && (!formData.initial_employee.first_name || !formData.initial_employee.last_name || !formData.initial_employee.email)
                }>

                  Next
                </Button> :

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !formData.initial_employee.email}
                className="ml-auto bg-green-600 hover:bg-green-700">

                  {submitting ?
                <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </> :

                'Submit Request'
                }
                </Button>
              }
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);

}