import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DocumentationFile } from "@/api/entities";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, Check } from "lucide-react";
import { useTenant, getTenantFilter } from './tenantContext';
import { User } from '@/api/entities';

export default function DocumentPicker({ open, onOpenChange, onSelect, selectedDocs = [] }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localSelection, setLocalSelection] = useState(selectedDocs);
  const { selectedTenantId } = useTenant();

  useEffect(() => {
    if (open) {
      const loadDocs = async () => {
        setLoading(true);
        try {
          const user = await User.me();
          const filter = getTenantFilter(user, selectedTenantId);
          const docs = await DocumentationFile.filter(filter);
          setDocuments(docs);
          setLocalSelection(selectedDocs);
        } catch (error) {
          console.error("Failed to load documents:", error);
        } finally {
          setLoading(false);
        }
      };
      loadDocs();
    }
  }, [open, selectedTenantId, selectedDocs]);

  const handleSelect = (doc) => {
    setLocalSelection(prev => 
      prev.some(d => d.id === doc.id)
        ? prev.filter(d => d.id !== doc.id)
        : [...prev, doc]
    );
  };

  const handleConfirm = () => {
    onSelect(localSelection);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle>Attach Document from CRM</DialogTitle>
          <DialogDescription>Select one or more documents to attach to your email.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto my-4">
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-slate-700">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Document Title</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(doc => (
                  <TableRow key={doc.id} className="border-b-slate-700/50 hover:bg-slate-700/30">
                    <TableCell>
                      <Checkbox
                        checked={localSelection.some(d => d.id === doc.id)}
                        onCheckedChange={() => handleSelect(doc)}
                        className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                      />
                    </TableCell>
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      {doc.title}
                    </TableCell>
                    <TableCell className="capitalize text-slate-400">{doc.category?.replace(/_/g, ' ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && documents.length === 0 && (
            <p className="text-center text-slate-500 py-8">No documents found in CRM.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">Cancel</Button>
          <Button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Check className="w-4 h-4 mr-2" />
            Attach Selected ({localSelection.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}