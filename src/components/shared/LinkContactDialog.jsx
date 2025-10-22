
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Link as LinkIcon, User as UserIcon, PlusCircle } from 'lucide-react';
import { Contact, User } from '@/api/entities';
import { getTenantFilter, useTenant } from './tenantContext';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LinkContactDialog({ open, onOpenChange, accountId, onContactLinked }) {
  const [unassignedContacts, setUnassignedContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); // Renamed from isLinking
  const [selectedContacts, setSelectedContacts] = useState([]);
  const { selectedTenantId } = useTenant();
  const [activeTab, setActiveTab] = useState('existing');

  // State for new contact form
  const [newContactFirstName, setNewContactFirstName] = useState('');
  const [newContactLastName, setNewContactLastName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  useEffect(() => {
    const fetchUnassignedContacts = async () => {
      if (!open || activeTab !== 'existing') return; // Only fetch if dialog is open and on existing tab
      setLoading(true);
      try {
        const user = await User.me();
        const tenantFilter = getTenantFilter(user, selectedTenantId);
        const allContacts = await Contact.filter(tenantFilter);
        
        // Filter for contacts that do NOT have an account_id
        const filtered = allContacts.filter(c => !c.account_id);
        setUnassignedContacts(filtered);
      } catch (error) {
        console.error("Failed to fetch unassigned contacts:", error);
        toast.error("Could not load contacts to link.");
      } finally {
        setLoading(false);
      }
    };

    fetchUnassignedContacts();
  }, [open, selectedTenantId, activeTab]); // Depend on activeTab to refetch when switching to existing

  const handleLinkExistingContacts = async () => {
    if (selectedContacts.length === 0) {
      toast.warning("Please select at least one contact to link.");
      return;
    }
    setIsSubmitting(true);
    try {
      const promises = selectedContacts.map(contactId => 
        Contact.update(contactId, { account_id: accountId })
      );
      await Promise.all(promises);
      toast.success(`${selectedContacts.length} contact(s) linked successfully!`);
      onContactLinked(true); // pass true to indicate it was a manual refresh
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to link contacts:", error);
      toast.error("An error occurred while linking contacts.");
    } finally {
      setIsSubmitting(false);
      setSelectedContacts([]);
    }
  };

  const handleCreateNewContact = async () => {
    if (!newContactFirstName && !newContactEmail) {
      toast.warning("Please provide at least a first name or an email for the new contact.");
      return;
    }

    setIsSubmitting(true);
    try {
      await Contact.create({
        first_name: newContactFirstName,
        last_name: newContactLastName,
        email: newContactEmail,
        phone_number: newContactPhone,
        account_id: accountId, // Link new contact directly to the account
        tenant_id: selectedTenantId // Assign to current tenant
      });
      toast.success("New contact created and linked successfully!");
      onContactLinked(true);
      onOpenChange(false);
      // Reset form fields
      setNewContactFirstName('');
      setNewContactLastName('');
      setNewContactEmail('');
      setNewContactPhone('');
    } catch (error) {
      console.error("Failed to create new contact:", error);
      toast.error("An error occurred while creating the new contact.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (activeTab === 'existing') {
      handleLinkExistingContacts();
    } else {
      handleCreateNewContact();
    }
  };

  const handleSelectContact = (contactId, checked) => {
    setSelectedContacts(prev => 
      checked ? [...prev, contactId] : prev.filter(id => id !== contactId)
    );
  };

  // If not open, return null (parent controls rendering)
  if (!open) return null;

  const isSubmitButtonDisabled = isSubmitting || (
    activeTab === 'existing' 
      ? selectedContacts.length === 0 
      : (!newContactFirstName && !newContactEmail)
  );

  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-sm">
        Link an existing contact or create a new one for this account.
      </p>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-700">
          <TabsTrigger value="existing" className="data-[state=active]:bg-slate-600 data-[state=active]:text-slate-100 text-slate-300">
            Link Existing Contact
          </TabsTrigger>
          <TabsTrigger value="new" className="data-[state=active]:bg-slate-600 data-[state=active]:text-slate-100 text-slate-300">
            Create New Contact
          </TabsTrigger>
        </TabsList>

        <TabsContent value="existing" className="space-y-4">
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : unassignedContacts.length > 0 ? (
            <ScrollArea className="h-72 pr-4">
              <div className="space-y-2">
                {unassignedContacts.map(contact => (
                  <div key={contact.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-700/50">
                    <Checkbox
                      id={`contact-${contact.id}`}
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={(checked) => handleSelectContact(contact.id, checked)}
                      className="border-slate-500 data-[state=checked]:bg-blue-600"
                    />
                    <label htmlFor={`contact-${contact.id}`} className="flex-grow cursor-pointer">
                      <p className="font-medium text-slate-200">{contact.first_name} {contact.last_name}</p>
                      <p className="text-xs text-slate-400">{contact.email}</p>
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-10 text-slate-500">
              <UserIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No unassigned contacts available.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-slate-300">First Name</Label>
              <Input
                id="firstName"
                value={newContactFirstName}
                onChange={(e) => setNewContactFirstName(e.target.value)}
                placeholder="John"
                className="bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-slate-300">Last Name</Label>
              <Input
                id="lastName"
                value={newContactLastName}
                onChange={(e) => setNewContactLastName(e.target.value)}
                placeholder="Doe"
                className="bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">Email</Label>
            <Input
              id="email"
              type="email"
              value={newContactEmail}
              onChange={(e) => setNewContactEmail(e.target.value)}
              placeholder="john.doe@example.com"
              className="bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-slate-300">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={newContactPhone}
              onChange={(e) => setNewContactPhone(e.target.value)}
              placeholder="(123) 456-7890"
              className="bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitButtonDisabled}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : activeTab === "existing" ? (
            <LinkIcon className="w-4 h-4 mr-2" />
          ) : (
            <PlusCircle className="w-4 h-4 mr-2" />
          )}
          {isSubmitting ? "Processing..." : activeTab === "existing" ? `Link Selected (${selectedContacts.length})` : "Create Contact"}
        </Button>
      </div>
    </div>
  );
}
