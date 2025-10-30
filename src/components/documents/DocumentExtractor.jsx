import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  FileJson,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react"; // Added X icon
import { ExtractDataFromUploadedFile, UploadFile } from "@/api/integrations";

const entitySchemas = {
  Contact: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name: { type: "string" },
      email: { type: "string", format: "email" },
      phone: { type: "string" },
      company: { type: "string" },
    },
  },
  Lead: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name: { type: "string" },
      email: { type: "string", format: "email" },
      phone: { type: "string" },
      company: { type: "string" },
      source: { type: "string" },
    },
  },
};

export default function DocumentExtractor({ onCancel, onProcessingChange }) {
  const [file, setFile] = useState(null);
  const [entityType, setEntityType] = useState("Contact");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (onProcessingChange) {
      onProcessingChange(isProcessing);
    }
  }, [isProcessing, onProcessingChange]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file) {
      setError("Please select a file first.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const { file_url } = await UploadFile({ file });

      const extractionResult = await ExtractDataFromUploadedFile({
        file_url,
        json_schema: entitySchemas[entityType],
      });

      if (extractionResult.status === "success") {
        setResult(extractionResult.output);
      } else {
        throw new Error(extractionResult.details || "Failed to extract data.");
      }
    } catch (e) {
      setError(e.message || "An unknown error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700 text-slate-300 shadow-lg border-0">
      <CardHeader className="border-b border-slate-700">
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-400" />
            Document Extractor
          </span>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </CardTitle>
        <CardDescription className="text-slate-400">
          Upload documents like receipts, invoices, or contracts to extract
          structured data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label
              htmlFor="document-file"
              className="text-sm font-medium text-slate-200"
            >
              Document File
            </label>
            <Input
              id="document-file"
              type="file"
              accept=".pdf,.txt,.docx,.md"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="bg-slate-700 border-slate-600 text-slate-200 file:bg-slate-600 file:text-slate-200 file:border-slate-500"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="entity-type"
              className="text-sm font-medium text-slate-200"
            >
              Target Entity
            </label>
            <Select
              value={entityType}
              onValueChange={setEntityType}
              disabled={isProcessing}
            >
              <SelectTrigger
                id="entity-type"
                className="bg-slate-700 border-slate-600 text-slate-200"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="Contact" className="focus:bg-slate-700">
                  Contact
                </SelectItem>
                <SelectItem value="Lead" className="focus:bg-slate-700">
                  Lead
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <h3 className="text-md font-semibold flex items-center gap-2 text-slate-100">
              <FileJson className="w-5 h-5 text-green-400" />
              Extracted Data
            </h3>
            <Textarea
              readOnly
              value={JSON.stringify(result, null, 2)}
              className="font-mono text-xs h-48 bg-slate-900 border-slate-700 text-slate-300"
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {/* Changed to flex and gap for buttons */}
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600"
        >
          Cancel
        </Button>
        <Button
          onClick={handleProcess}
          disabled={isProcessing || !file}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {isProcessing
            ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting...
              </>
            )
            : (
              <>
                <UploadCloud className="mr-2 h-4 w-4" />
                Extract Data
              </>
            )}
        </Button>
      </CardFooter>
    </Card>
  );
}
