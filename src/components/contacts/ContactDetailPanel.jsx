
import { useState } from 'react';
import UniversalDetailPanel from "../shared/UniversalDetailPanel";
import { Star, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { universalAICall } from "@/api/functions";
import { generateAIEmailDraft } from "@/api/functions";
import { sendAIEmail } from "@/api/functions";
import { toast } from "sonner";

export default function ContactDetailPanel({
  contact,
  accountId,
  accountName,
  assignedUserName,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  user
}) {
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [callPrompt, setCallPrompt] = useState("");
  const [emailPrompt, setEmailPrompt] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  if (!contact) {
    return null;
  }

  const handleMakeCall = () => {
    if (!contact.phone && !contact.mobile) {
      toast.error("No phone number available for this contact");
      return;
    }
    setCallPrompt(`Call ${contact.first_name} ${contact.last_name} from ${accountName || contact.account_name || 'their company'} for a follow-up conversation.`);
    setShowCallDialog(true);
  };

  const handleInitiateCall = async () => {
    if (!callPrompt.trim()) {
      toast.error("Please provide a call objective");
      return;
    }

    const phone = contact.phone || contact.mobile;
    setIsCalling(true);
    try {
      await universalAICall({
        contactPhone: phone,
        contactName: `${contact.first_name} ${contact.last_name}`,
        prompt: callPrompt,
        callObjective: "follow_up"
      });
      toast.success("AI call initiated successfully");
      setShowCallDialog(false);
    } catch (error) {
      console.error("Error initiating call:", error);
      toast.error(`Failed to initiate call: ${error.message || "Unknown error"}`);
    } finally {
      setIsCalling(false);
    }
  };

  const handleComposeEmail = () => {
    if (!contact.email) {
      toast.error("No email address available for this contact");
      return;
    }
    setEmailPrompt(`Write a professional follow-up email to ${contact.first_name} ${contact.last_name} from ${accountName || contact.account_name || 'their company'}.`);
    setEmailDraft("");
    setShowEmailDialog(true);
  };

  const handleGenerateEmail = async () => {
    if (!emailPrompt.trim()) {
      toast.error("Please provide email instructions");
      return;
    }

    setIsGeneratingEmail(true);
    try {
      const response = await generateAIEmailDraft({
        recipientEmail: contact.email,
        recipientName: `${contact.first_name} ${contact.last_name}`,
        context: `Contact from ${accountName || contact.account_name || 'company'}, current status: ${contact.status}`,
        prompt: emailPrompt
      });

      if (response.data && response.data.draft) {
        setEmailDraft(response.data.draft);
        toast.success("Email draft generated successfully");
      } else {
        throw new Error("Failed to generate email draft");
      }
    } catch (error) {
      console.error("Error generating email:", error);
      toast.error(`Failed to generate email: ${error.message || "Unknown error"}`);
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailDraft.trim()) {
      toast.error("Please generate an email draft first");
      return;
    }

    setIsSendingEmail(true);
    try {
      await sendAIEmail({
        entityType: "contact",
        entityId: contact.id,
        to: contact.email,
        subject: `Follow-up: ${contact.first_name} ${contact.last_name}`,
        body: emailDraft
      });
      toast.success("Email sent successfully");
      setShowEmailDialog(false);
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error(`Failed to send email: ${error.message || "Unknown error"}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleViewAccount = (e) => {
    if (e) e.preventDefault();
    if (!accountId) {
      console.log("No accountId provided");
      return;
    }
    
    // Navigate to Accounts page with accountId query parameter
    // The Accounts page will automatically open the AccountDetailPanel
    window.location.href = `/Accounts?accountId=${accountId}`;
  };

  const customActions = [];

  if (contact.phone || contact.mobile) {
    customActions.push({
      label: "Make AI Call",
      icon: <Phone className="w-4 h-4" />,
      onClick: handleMakeCall
    });
  }

  if (contact.email) {
    customActions.push({
      label: "Compose AI Email",
      icon: <Mail className="w-4 h-4" />,
      onClick: handleComposeEmail
    });
  }

  customActions.push({
    label: "Convert to Lead",
    icon: <Star className="w-4 h-4" />,
    onClick: (contact) => {
      console.log("Convert to lead:", contact);
    }
  });

  return (
    <>
      <UniversalDetailPanel
        entity={contact}
        entityType="contact"
        open={open}
        onOpenChange={onOpenChange}
        onEdit={onEdit}
        onDelete={onDelete}
        user={user}
        displayData={{
          "Account Name": accountId ? (
            <button
              onClick={handleViewAccount}
              className="text-blue-400 hover:text-blue-300 hover:underline text-left mt-1 cursor-pointer"
            >
              {accountName || contact.account_name || 'Unknown Account'}
            </button>
          ) : accountName || contact.account_name ? (
            <p className="text-slate-200 font-medium mt-1">
              {accountName || contact.account_name}
            </p>
          ) : (
            <p className="text-slate-500 italic mt-1">No account linked</p>
          ),
          "Assigned To": (
            <p className="text-slate-200 font-medium mt-1">
              {assignedUserName || contact.assigned_to_name || contact.assigned_to || 'Unassigned'}
            </p>
          )
        }}
        customActions={customActions}
        showNotes={true}
      />

      <Dialog open={showCallDialog} onOpenChange={setShowCallDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Make AI Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Calling: {contact.first_name} {contact.last_name}</Label>
              <p className="text-sm text-slate-400 mt-1">Phone: {contact.phone || contact.mobile}</p>
            </div>
            <div>
              <Label htmlFor="callPrompt" className="text-slate-300">Call Objective</Label>
              <Textarea
                id="callPrompt"
                value={callPrompt}
                onChange={(e) => setCallPrompt(e.target.value)}
                placeholder="Describe what you want to accomplish in this call..."
                className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCallDialog(false)} className="bg-slate-700 border-slate-600 hover:bg-slate-600">
              Cancel
            </Button>
            <Button onClick={handleInitiateCall} disabled={isCalling || !callPrompt.trim()} className="bg-blue-600 hover:bg-blue-700">
              {isCalling ? "Initiating..." : "Make Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Compose AI Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">To: {contact.first_name} {contact.last_name}</Label>
              <p className="text-sm text-slate-400 mt-1">{contact.email}</p>
            </div>
            <div>
              <Label htmlFor="emailPrompt" className="text-slate-300">Email Instructions</Label>
              <Textarea
                id="emailPrompt"
                value={emailPrompt}
                onChange={(e) => setEmailPrompt(e.target.value)}
                placeholder="Describe what you want to say in this email..."
                className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                rows={3}
              />
              <Button 
                onClick={handleGenerateEmail} 
                disabled={isGeneratingEmail || !emailPrompt.trim()}
                className="mt-2 bg-green-600 hover:bg-green-700"
                size="sm"
              >
                {isGeneratingEmail ? "Generating..." : "Generate Draft"}
              </Button>
            </div>
            {emailDraft && (
              <div>
                <Label htmlFor="emailDraft" className="text-slate-300">Email Draft</Label>
                <Textarea
                  id="emailDraft"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                  rows={8}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)} className="bg-slate-700 border-slate-600 hover:bg-slate-600">
              Cancel
            </Button>
            <Button 
              onClick={handleSendEmail} 
              disabled={isSendingEmail || !emailDraft.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSendingEmail ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
