
import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generateAIEmailDraft } from "@/api/functions";
import { sendAIEmail } from "@/api/functions";
import { Loader2, Sparkles, Wand2, Send, Paperclip, FileText, Save, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailTemplate } from "@/api/entities";
import { useUser } from '@/components/shared/useUser.js';
import { getTenantFilter } from './tenantUtils';
import { useTenant } from './tenantContext';
import DocumentPicker from './DocumentPicker';
import EmailTemplateManager from './EmailTemplateManager';

// Helper to convert File to base64
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

export default function AIEmailComposer({
  entityType = null,
  entityId = null,
  recipientEmail,
  recipientName,
  context = "",
  className = "",
  buttonText = "AI Email"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [includeSignature, setIncludeSignature] = useState(true);

  const [templates, setTemplates] = useState([]);
  const [attachments, setAttachments] = useState([]); // Local files
  const [crmAttachments, setCrmAttachments] = useState([]); // Docs from CRM
  
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [initialTemplateData, setInitialTemplateData] = useState(null);

  const { selectedTenantId } = useTenant();
  
  const fileInputRef = React.createRef();
  const { user: currentUser } = useUser();

  const loadTemplates = useCallback(async () => {
    try {
      if (!currentUser) return;
      const filter = getTenantFilter(currentUser, selectedTenantId);
      const fetchedTemplates = await EmailTemplate.filter(filter);
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error("Failed to load email templates:", error);
    }
  }, [selectedTenantId, currentUser]);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setAttachments([]);
      setCrmAttachments([]);
    }
  }, [isOpen, loadTemplates]);
  
  const handleTemplateSelect = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setDraft({ subject: template.subject, body: template.body });
      toast.info(`Template "${template.name}" loaded.`);
    }
  };

  const handleGenerateDraft = async () => {
    // ... same as before
    if (!prompt.trim()) {
      toast.error("Please enter a prompt for the email");
      return;
    }

    setGenerating(true);
    setDraft({ subject: "", body: "" });
    try {
      const response = await generateAIEmailDraft({
        entityType,
        entityId,
        userPrompt: prompt.trim(),
        tone: 'professional',
        includeCallToAction: true,
        recipientEmail,
        recipientName,
        context,
      });
      
      if (response.data.success) {
        const draftData = response.data.draft;
        setDraft({
          subject: draftData.subject_lines ? draftData.subject_lines[0] : "Generated Email",
          body: draftData.email_body || "Draft content not available",
        });
        toast.success("AI draft generated successfully!");
      } else {
        throw new Error(response.data.error || "Failed to generate draft");
      }
    } catch (error) {
      console.error("Error generating draft:", error);
      toast.error("Error generating draft: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!draft.subject && !draft.body) {
      toast.error("Please generate a draft before sending.");
      return;
    }

    setSending(true);
    try {
      let finalBody = draft.body;
      if (includeSignature) {
        finalBody += "\n\n--\nBest Regards,\nYour Team";
      }

      // Prepare local attachments
      const base64Attachments = await Promise.all(
        attachments.map(async file => ({
          filename: file.name,
          content: await toBase64(file),
        }))
      );

      // Prepare CRM attachments (URIs)
      const crmAttachmentUris = crmAttachments.map(doc => doc.file_uri);

      const response = await sendAIEmail({
        entityType,
        entityId,
        to: recipientEmail,
        subject: draft.subject,
        body: finalBody,
        attachments: base64Attachments,
        attachment_uris: crmAttachmentUris,
      });

      if (response.data.success) {
        toast.success("Email sent successfully!");
        setIsOpen(false);
        setDraft({ subject: "", body: "" });
        setPrompt("");
      } else {
        throw new Error(response.data.error || "Failed to send email");
      }
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to send email: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (event) => {
    setAttachments(prev => [...prev, ...Array.from(event.target.files)]);
  };

  const handleSaveAsTemplate = () => {
    setInitialTemplateData({ subject: draft.subject, body: draft.body });
    setShowTemplateManager(true);
  };
  
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={`bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 ${className}`}
      >
        <Sparkles className="w-4 h-4 mr-1" />
        {buttonText}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Wand2 className="w-5 h-5 text-purple-400" />
              AI Email Composer
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Draft an email to <span className="font-medium text-slate-300">{recipientName}</span> ({recipientEmail}).
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 flex-grow overflow-y-auto">
            {/* Prompt Section */}
            <div className="space-y-4 flex flex-col">
              <h4 className="font-semibold text-slate-200">Your Instructions</h4>
              <Textarea
                placeholder="e.g., 'Follow up on our last conversation about the new project...'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="flex-grow bg-slate-700 border-slate-600 text-slate-200 focus:border-purple-500"
              />
              <Button onClick={handleGenerateDraft} disabled={generating || !prompt.trim()} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Generate Draft
              </Button>
            </div>

            {/* Draft Section */}
            <div className="space-y-4 flex flex-col">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-slate-200">Generated Draft</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setInitialTemplateData(null); setShowTemplateManager(true); }} className="h-8 bg-slate-700 hover:bg-slate-600 border-slate-600">
                    <FolderOpen className="w-4 h-4 mr-2" /> Templates
                  </Button>
                </div>
              </div>
              <Select onValueChange={handleTemplateSelect} disabled={templates.length === 0}>
                <SelectTrigger className="bg-slate-700 border-slate-600">
                  <SelectValue placeholder="Load a template..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  {templates.map(t => <SelectItem key={t.id} value={t.id} className="hover:bg-slate-700">{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Email Subject"
                value={draft.subject}
                onChange={(e) => setDraft(d => ({ ...d, subject: e.target.value }))}
                className="bg-slate-700 border-slate-600"
              />
              <Textarea
                placeholder="AI will generate the email body here..."
                value={draft.body}
                onChange={(e) => setDraft(d => ({ ...d, body: e.target.value }))}
                className="flex-grow bg-slate-700 border-slate-600"
              />
              <div className="flex items-center space-x-2">
                <Switch id="include-signature" checked={includeSignature} onCheckedChange={setIncludeSignature} />
                <Label htmlFor="include-signature" className="text-sm">Include Signature</Label>
              </div>
              <Button onClick={handleSaveAsTemplate} disabled={!draft.body} variant="outline" className="w-full bg-slate-700 hover:bg-slate-600 border-slate-600">
                <Save className="w-4 h-4 mr-2" />
                Save as Template
              </Button>
            </div>
          </div>
          
          {/* Attachments Section */}
          <div className="space-y-2 pt-4 border-t border-slate-700">
            <Label>Attachments</Label>
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, i) => <Badge key={i} variant="secondary" className="bg-slate-600 text-slate-200">{file.name}</Badge>)}
              {crmAttachments.map(doc => <Badge key={doc.id} variant="secondary" className="bg-blue-900/50 text-blue-300">{doc.title}</Badge>)}
            </div>
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current.click()} className="bg-slate-700 hover:bg-slate-600 border-slate-600">
                <Paperclip className="w-4 h-4 mr-2" /> Attach from Computer
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDocPicker(true)} className="bg-slate-700 hover:bg-slate-600 border-slate-600">
                <FileText className="w-4 h-4 mr-2" /> Attach from CRM
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="bg-slate-700 hover:bg-slate-600 border-slate-600">Cancel</Button>
            <Button onClick={handleSendEmail} disabled={sending || (!draft.subject && !draft.body)} className="bg-blue-600 hover:bg-blue-700 text-white">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DocumentPicker open={showDocPicker} onOpenChange={setShowDocPicker} onSelect={setCrmAttachments} selectedDocs={crmAttachments} />
      <EmailTemplateManager open={showTemplateManager} onOpenChange={setShowTemplateManager} onTemplatesUpdate={loadTemplates} initialData={initialTemplateData} />
    </>
  );
}
