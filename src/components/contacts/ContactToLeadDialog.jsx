import React, { useState } from "react";
import { Lead } from "@/api/entities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, ArrowRight } from "lucide-react";

export default function ContactToLeadDialog({ contact, account, onConvert, onClose }) {
  const [isConverting, setIsConverting] = useState(false);
  const [reason, setReason] = useState("");
  const [leadStatus, setLeadStatus] = useState("new");
  const [leadSource, setLeadSource] = useState("referral");

  const handleConvert = async () => {
    setIsConverting(true);
    try {
      const newLead = await Lead.create({
        tenant_id: contact.tenant_id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        company: account?.name || "",
        job_title: contact.job_title,
        source: leadSource,
        status: leadStatus,
        address_1: contact.address_1,
        address_2: contact.address_2,
        city: contact.city,
        state: contact.state,
        zip: contact.zip,
        country: contact.country,
        notes: `Converted from Contact (${contact.id}). Reason: ${reason}`,
        tags: contact.tags,
        score: contact.score,
        score_reason: contact.score_reason,
        assigned_to: contact.assigned_to,
      });

      await onConvert({
        lead: newLead,
        contactId: contact.id
      });
      
    } catch (error) {
      console.error("Error converting contact to lead:", error);
      alert("Failed to convert contact to lead. Please try again.");
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Dialog open={!!contact} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-orange-600" />
            Convert to Lead: {contact?.first_name} {contact?.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="p-4 bg-orange-50 rounded-lg">
            <h3 className="font-semibold text-orange-900 mb-2">Conversion Summary</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-100 text-green-800">Contact</Badge>
                <ArrowRight className="w-4 h-4" />
                <Badge variant="outline" className="bg-orange-100 text-orange-800">Lead</Badge>
              </div>
            </div>
            <p className="text-sm text-orange-700 mt-2">
              This will create a new lead record for re-qualification purposes.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Reason for Re-qualification</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this contact being converted back to a lead?"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Lead Status</Label>
                <Select value={leadStatus} onValueChange={setLeadStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lead Source</Label>
                <Select value={leadSource} onValueChange={setLeadSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="cold_call">Cold Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="social_media">Social Media</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isConverting}>
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={isConverting || !reason.trim()}>
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <Star className="w-4 h-4 mr-2" />
                Convert to Lead
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}