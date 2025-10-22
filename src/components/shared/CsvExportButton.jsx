import React from 'react';
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function CsvExportButton({ data, filename, children, className = "", renderTrigger }) {
  const [isExporting, setIsExporting] = React.useState(false);

  const downloadCsv = () => {
    if (!data || data.length === 0) {
      alert("No data to export.");
      return;
    }
    
    setIsExporting(true);

    try {
      const headers = Object.keys(data[0]);
      const replacer = (key, value) => value === null ? '' : value;
      
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => JSON.stringify(row[header], replacer)).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(url);
      // Safe node removal to prevent NotFoundError
      if (typeof link.remove === 'function') {
        link.remove();
      } else if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      alert("An error occurred during export.");
    } finally {
      setIsExporting(false);
    }
  };

  if (renderTrigger) {
    return renderTrigger(downloadCsv);
  }

  return (
    <Button
      variant="outline"
      onClick={downloadCsv}
      disabled={isExporting || !data || data.length === 0}
      className={className}
    >
      <Download className="w-4 h-4 mr-2" />
      {isExporting ? 'Exporting...' : children || 'Export'}
    </Button>
  );
}