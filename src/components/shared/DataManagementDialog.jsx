import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Upload, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import CsvImportDialog from './CsvImportDialog';
import * as Entities from "@/api/entities";

const EXPORTABLE_ENTITIES = ["Lead", "Contact", "Account", "Opportunity", "Activity", "Employee"];
const IMPORTABLE_ENTITIES = ["Lead", "Contact", "Account", "Opportunity", "Activity", "Employee"];

function ExportTab() {
  const [isExporting, setIsExporting] = useState(null);

  const downloadCsv = async (entityName) => {
    setIsExporting(entityName);
    try {
      const Entity = Entities[entityName];
      if (!Entity) throw new Error(`Invalid entity: ${entityName}`);
      
      const data = await Entity.list();
      
      if (!data || data.length === 0) {
        alert(`No data available to export for ${entityName}.`);
        return;
      }
      
      const headers = Object.keys(data[0]);
      const replacer = (key, value) => value === null ? '' : value;
      
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => JSON.stringify(row[header], replacer).replace(/,/g, '‚')).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${entityName.toLowerCase()}-export.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      alert(`An error occurred during export: ${error.message}`);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Select a data type to download a CSV file of all its records.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORTABLE_ENTITIES.map(entityName => (
          <Button
            key={entityName}
            variant="outline"
            onClick={() => downloadCsv(entityName)}
            disabled={isExporting}
            className="justify-start"
          >
            {isExporting === entityName ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export All {entityName}s
          </Button>
        ))}
      </div>
    </div>
  );
}

function ImportTab() {
  const [selectedEntity, setSelectedEntity] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);

  const handleStartImport = () => {
    if (selectedEntity) {
      setShowImportDialog(true);
    } else {
      alert("Please select a data type to import.");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Select the type of data you want to import, then you will be prompted to upload your CSV file.
      </p>
      <div className="flex items-end gap-4">
        <div className="flex-grow">
          <Label htmlFor="entity-select">Data Type</Label>
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger id="entity-select">
              <SelectValue placeholder="Choose data type..." />
            </SelectTrigger>
            <SelectContent>
              {IMPORTABLE_ENTITIES.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleStartImport} disabled={!selectedEntity}>
          <Upload className="w-4 h-4 mr-2" />
          Start Import
        </Button>
      </div>

      {showImportDialog && selectedEntity && (
        <CsvImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          entity={Entities[selectedEntity]}
          schema={Entities[selectedEntity]?.schema()}
          onSuccess={() => {
            alert(`${selectedEntity}s imported successfully! The page will now refresh to show the new data.`);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

export default function DataManagementDialog({ children }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Data Management</DialogTitle>
          <DialogDescription>
            Import data from a CSV file or export existing data.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="import">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>
          <TabsContent value="import" className="pt-4">
            <ImportTab />
          </TabsContent>
          <TabsContent value="export" className="pt-4">
            <ExportTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}