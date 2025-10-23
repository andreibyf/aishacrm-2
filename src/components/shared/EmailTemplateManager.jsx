
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge"; // Added import for Badge
import { EmailTemplate, User } from "@/api/entities";
import { Loader2, Plus, Edit, Trash2, Save, ArrowLeft, Tag } from "lucide-react";
import { toast } from "sonner";
import { getTenantFilter } from './tenantUtils';
import { useTenant } from './tenantContext';
import TagInput from './TagInput';

export default function EmailTemplateManager({ open, onOpenChange, onTemplatesUpdate, initialData = null }) {
  const [view, setView] = useState('list'); // 'list' or 'form'
  const [templates, setTemplates] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({ name: '', subject: '', body: '', tags: [] });

  const { selectedTenantId } = useTenant();

  const loadTemplatesAndTags = useCallback(async () => {
    setLoading(true);
    try {
      const user = await User.me();
      const filter = getTenantFilter(user, selectedTenantId);
      const fetchedTemplates = await EmailTemplate.filter(filter);
      setTemplates(fetchedTemplates);

      const tagCounts = {};
      fetchedTemplates.forEach(t => {
        (t.tags || []).forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });
      setAllTags(Object.entries(tagCounts).map(([name, count]) => ({ name, count })));

    } catch (error) {
      console.error("Failed to load templates:", error);
      toast.error("Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    if (open) {
      loadTemplatesAndTags();
      if (initialData) {
        setFormData({
          name: initialData.name || '',
          subject: initialData.subject || '',
          body: initialData.body || '',
          tags: initialData.tags || [],
        });
        setSelectedTemplate(null);
        setView('form');
      } else {
        setView('list');
      }
    }
  }, [open, initialData, loadTemplatesAndTags]);

  const handleCreate = () => {
    setSelectedTemplate(null);
    setFormData({ name: '', subject: '', body: '', tags: [] });
    setView('form');
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      body: template.body,
      tags: template.tags || [],
    });
    setView('form');
  };

  const handleDelete = async (templateId) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await EmailTemplate.delete(templateId);
      toast.success('Template deleted successfully.');
      loadTemplatesAndTags();
      onTemplatesUpdate(); // Notify parent
    } catch {
      toast.error('Failed to delete template.');
    }
  };
  
  const handleSave = async () => {
    if (!formData.name || !formData.subject || !formData.body) {
      toast.error("Template name, subject, and body are required.");
      return;
    }
    
    setIsSaving(true);
    try {
      const user = await User.me();
      const dataToSave = { ...formData, tenant_id: user.tenant_id };

      if (selectedTemplate) {
        await EmailTemplate.update(selectedTemplate.id, dataToSave);
        toast.success('Template updated successfully.');
      } else {
        await EmailTemplate.create(dataToSave);
        toast.success('Template created successfully.');
      }
      
      setView('list');
      loadTemplatesAndTags();
      onTemplatesUpdate(); // Notify parent
    } catch (error) {
      toast.error(`Failed to save template: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col bg-slate-800 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            {view === 'form' && (
              <Button variant="ghost" size="icon" onClick={() => setView('list')} className="mr-2 h-8 w-8 hover:bg-slate-700">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            Email Template Manager
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Create, edit, and manage your reusable email templates.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto pr-2">
          {view === 'list' && (
            <div className="space-y-4">
              <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Create New Template
              </Button>
              {loading ? (
                <div className="flex justify-center items-center h-48"><Loader2 className="w-8 h-8 animate-spin text-blue-400"/></div>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="p-3 bg-slate-700/50 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-slate-200">{t.name}</p>
                        <p className="text-sm text-slate-400 truncate max-w-md">{t.subject}</p>
                        <div className="flex gap-1 mt-1">
                          {(t.tags || []).map(tag => <Badge key={tag} variant="secondary" className="bg-slate-600 text-slate-300 text-xs">{tag}</Badge>)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(t)} className="hover:bg-slate-600 text-slate-400 h-8 w-8"><Edit className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)} className="hover:bg-red-900/50 text-red-400 h-8 w-8"><Trash2 className="w-4 h-4"/></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'form' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300">Template Name</label>
                <Input value={formData.name} onChange={e => handleChange('name', e.target.value)} className="mt-1 bg-slate-700 border-slate-600"/>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Subject</label>
                <Input value={formData.subject} onChange={e => handleChange('subject', e.target.value)} className="mt-1 bg-slate-700 border-slate-600"/>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Body</label>
                <Textarea value={formData.body} onChange={e => handleChange('body', e.target.value)} className="mt-1 h-48 bg-slate-700 border-slate-600"/>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Tag className="w-4 h-4"/> Categories / Tags</label>
                <TagInput
                  selectedTags={formData.tags}
                  onTagsChange={newTags => handleChange('tags', newTags)}
                  allTags={allTags}
                  placeholder="Add categories like 'Follow-up', 'Sales'"
                  darkMode={true}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>

        {view === 'form' && (
          <DialogFooter className="border-t border-slate-700 pt-4">
            <Button variant="outline" onClick={() => setView('list')} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Save className="w-4 h-4 mr-2"/>}
              {selectedTemplate ? 'Update Template' : 'Save Template'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
