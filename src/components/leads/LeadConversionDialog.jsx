import React, { useState } from "react";
import { Contact, Account, Opportunity, Lead, User } from "@/api/entities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { Loader2, UserPlus, Building2, Target, ArrowRight } from "lucide-react";
import { generateUniqueId } from "@/api/functions";
import { useApiManager } from "../shared/ApiManager";

export default function LeadConversionDialog({ lead, accounts, open, onConvert, onClose }) {
  const [isConverting, setIsConverting] = useState(false);
  const [createAccount, setCreateAccount] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [createOpportunity, setCreateOpportunity] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [opportunityAmount, setOpportunityAmount] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const { cachedRequest } = useApiManager();

  // Update state when lead data becomes available
  React.useEffect(() => {
    if (lead) {
      // Set account name from lead company
      setAccountName(lead.company || "");
      
      // Set opportunity name with proper null checking
      const firstName = lead.first_name || "";
      const lastName = lead.last_name || "";
      const fullName = `${firstName} ${lastName}`.trim();
      setOpportunityName(fullName ? `${fullName} - Opportunity` : "New Opportunity");
      
      // Set opportunity amount from lead estimated value
      setOpportunityAmount(lead.estimated_value || "");
    }
  }, [lead]);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to load current user:", error);
      }
    };
    loadUser();
  }, []);

  const handleConvert = async () => {
    if (!currentUser?.tenant_id) {
      alert("Cannot convert lead: Your account is not configured with a tenant.");
      return;
    }

    setIsConverting(true);
    try {
      let accountId = selectedAccountId;
      
      // Create or use existing account
      if (createAccount && accountName.trim()) {
        console.log("Creating new account:", accountName);

        const newAccountData = {
          name: accountName,
          tenant_id: currentUser.tenant_id,
          type: "prospect",
          phone: lead.phone || null,
          address_1: lead.address_1 || null,
          address_2: lead.address_2 || null,
          city: lead.city || null,
          state: lead.state || null,
          zip: lead.zip || null,
          country: lead.country || null,
          assigned_to: lead.assigned_to || currentUser.email,
        };

        try {
          const idResponse = await generateUniqueId({ entity_type: 'Account', tenant_id: currentUser.tenant_id });
          if (idResponse.data?.unique_id) {
            newAccountData.unique_id = idResponse.data.unique_id;
            console.log("Generated unique_id for new account during conversion:", newAccountData.unique_id);
          }
        } catch (error) {
          console.warn("Failed to generate unique_id for account during conversion", error);
        }

        const newAccount = await cachedRequest(
          'Account',
          'create',
          { data: newAccountData },
          () => Account.create(newAccountData)
        );
        accountId = newAccount.id;
      } else if (!createAccount && selectedAccountId) {
        accountId = selectedAccountId;
        console.log("Using existing account:", accountId);
      } else if (createAccount && !accountName.trim()) {
        throw new Error("Account name is required to create a new account.");
      }

      // Create contact from lead
      console.log("Creating contact from lead");
      const newContact = await cachedRequest(
        'Contact',
        'create',
        {
          data: {
            tenant_id: currentUser.tenant_id,
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email,
            phone: lead.phone || null,
            job_title: lead.job_title || null,
            account_id: accountId || null,
            lead_source: lead.source || "other",
            status: "prospect",
            address_1: lead.address_1 || null,
            address_2: lead.address_2 || null,
            city: lead.city || null,
            state: lead.state || null,
            zip: lead.zip || null,
            country: lead.country || null,
            notes: lead.notes || null,
            score: lead.score || 50,
            score_reason: lead.score_reason || "Converted from lead",
            ai_action: "follow_up",
            last_contacted: new Date().toISOString().split('T')[0],
            next_action: "Initial contact as converted lead",
            assigned_to: lead.assigned_to || currentUser.email,
          }
        },
        () => Contact.create({
          tenant_id: currentUser.tenant_id,
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          phone: lead.phone || null,
          job_title: lead.job_title || null,
          account_id: accountId || null,
          lead_source: lead.source || "other",
          status: "prospect",
          address_1: lead.address_1 || null,
          address_2: lead.address_2 || null,
          city: lead.city || null,
          state: lead.state || null,
          zip: lead.zip || null,
          country: lead.country || null,
          notes: lead.notes || null,
          score: lead.score || 50,
          score_reason: lead.score_reason || "Converted from lead",
          ai_action: "follow_up",
          last_contacted: new Date().toISOString().split('T')[0],
          next_action: "Initial contact as converted lead",
          assigned_to: lead.assigned_to || currentUser.email,
        })
      );

      // Create opportunity if requested
      let opportunityId = null;
      if (createOpportunity && opportunityName.trim()) {
        console.log("Creating opportunity");
        const newOpportunity = await cachedRequest(
          'Opportunity',
          'create',
          {
            data: {
              tenant_id: currentUser.tenant_id,
              name: opportunityName,
              account_id: accountId || null,
              contact_id: newContact.id,
              stage: "prospecting",
              amount: parseFloat(opportunityAmount) || 0,
              probability: 25,
              lead_source: lead.source || "other",
              assigned_to: lead.assigned_to || currentUser.email,
              close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
              type: "new_business",
            }
          },
          () => Opportunity.create({
            tenant_id: currentUser.tenant_id,
            name: opportunityName,
            account_id: accountId || null,
            contact_id: newContact.id,
            stage: "prospecting",
            amount: parseFloat(opportunityAmount) || 0,
            probability: 25,
            lead_source: lead.source || "other",
            assigned_to: lead.assigned_to || currentUser.email,
            close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            type: "new_business",
          })
        );
        opportunityId = newOpportunity.id;
      }

      // Update lead as converted
      console.log("Updating lead status to converted");
      await cachedRequest(
        'Lead',
        'update',
        { id: lead.id, data: { status: "converted", converted_contact_id: newContact.id, converted_account_id: accountId } },
        () => Lead.update(lead.id, { status: "converted", converted_contact_id: newContact.id, converted_account_id: accountId })
      );

      console.log("Lead conversion completed successfully");
      
      if (cachedRequest.invalidate) {
        cachedRequest.invalidate('Lead', 'filter');
        cachedRequest.invalidate('Lead', 'get');
        cachedRequest.invalidate('Contact', 'filter');
        cachedRequest.invalidate('Account', 'filter');
        cachedRequest.invalidate('Opportunity', 'filter');
      }

      // Call the parent's onConvert callback
      await onConvert({
        leadId: lead.id,
        contact: newContact,
        accountId,
        opportunityId,
      });
      
      onClose();
      
    } catch (error) {
      console.error("Detailed conversion error:", error);
      alert(`Failed to convert lead: ${error.message || "Unknown error"}. Please try again.`);
    } finally {
      setIsConverting(false);
    }
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-green-600" />
            Convert Lead: {lead.first_name || ""} {lead.last_name || ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Conversion Summary</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-green-600" />
                <span>Lead → Contact</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
              {(createAccount || selectedAccountId) ? ( // Account will be created or selected
                <>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>{createAccount ? "New Account" : "Existing Account"}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </>
              ) : null}
              {createOpportunity && (
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-600" />
                  <span>New Opportunity</span>
                </div>
              )}
            </div>
          </div>

          {/* Account Creation Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="createAccount"
                checked={createAccount}
                onCheckedChange={(checked) => {
                  setCreateAccount(checked);
                  // Reset selected account ID if switching to create new
                  if (checked) setSelectedAccountId("");
                  // If switching to use existing, clear account name
                  else setAccountName("");
                }}
              />
              <Label htmlFor="createAccount" className="text-sm font-medium">
                Create new Account
              </Label>
            </div>

            {createAccount ? (
              <div>
                <Label htmlFor="accountName">Account Name *</Label>
                <Input
                  id="accountName"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Company name"
                  required
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="existingAccount">Select Existing Account</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.length > 0 ? (
                      accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={null} disabled>
                        No accounts available
                      </SelectItem>
                    )}
                    <SelectItem value={null}>No Account / Don't associate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Opportunity Creation Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="createOpportunity"
                checked={createOpportunity}
                onCheckedChange={setCreateOpportunity}
              />
              <Label htmlFor="createOpportunity" className="text-sm font-medium">
                Create Opportunity
              </Label>
            </div>

            {createOpportunity && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="opportunityName">Opportunity Name *</Label>
                  <Input
                    id="opportunityName"
                    value={opportunityName}
                    onChange={(e) => setOpportunityName(e.target.value)}
                    placeholder="Opportunity title"
                  />
                </div>
                <div>
                  <Label htmlFor="opportunityAmount">Estimated Value ($)</Label>
                  <Input
                    id="opportunityAmount"
                    type="number"
                    value={opportunityAmount}
                    onChange={(e) => setOpportunityAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isConverting}>
            Cancel
          </Button>
          <Button 
            onClick={handleConvert} 
            disabled={isConverting || (createAccount && !accountName.trim()) || (!createAccount && !selectedAccountId && createOpportunity)}
            className="bg-green-600 hover:bg-green-700"
          >
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Converting...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Convert Lead
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
