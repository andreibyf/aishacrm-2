import { useCallback, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CreditCard,
  FileText,
  FolderOpen,
  Upload,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import BusinessCardProcessor from "../components/documents/BusinessCardProcessor";
import DocumentExtractor from "../components/documents/DocumentExtractor";
import ProcessingHistory from "../components/documents/ProcessingHistory";
import CashFlowExtractor from "../components/documents/CashFlowExtractor"; // New import
import { ArrowRightLeft } from "lucide-react"; // New icon import
import { useUser } from "../components/shared/useUser.js";

export default function DocumentProcessing() {
  const [activeProcessor, setActiveProcessor] = useState(null);
  const [, setUploadMode] = useState(null); // 'extract' or 'storage'
  const [isProcessing, setIsProcessing] = useState(false);
  const { user: currentUser } = useUser();

  const handleCancel = useCallback(() => {
    setActiveProcessor(null);
    setUploadMode(null);
    setIsProcessing(false);
  }, []);

  const handleProcessingStateChange = useCallback((processing) => {
    setIsProcessing(processing);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-emerald-900/30 border border-emerald-700/50">
              <FileText className="w-5 h-5 lg:w-7 lg:h-7 text-emerald-400" />
            </div>
            Document Processing
          </h1>
          <p className="text-slate-400 mt-1 text-sm lg:text-base">
            Process business cards and documents with AI, or upload files for
            storage.
          </p>
        </div>

        {(activeProcessor || isProcessing) && (
          <Button
            variant="outline"
            onClick={handleCancel}
            className="bg-red-700 hover:bg-red-600 text-white border-red-600 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancel
          </Button>
        )}
      </div>

      {!activeProcessor && !isProcessing && (
        <>
          <Alert className="bg-blue-900/30 border-blue-700/50">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              Choose between AI-powered extraction (which analyzes and extracts
              data) or simple storage upload (no processing).
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            {/* Business Card Processing */}
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 transition-all cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-slate-100">
                  <div className="p-2 rounded-lg bg-blue-900/30 border border-blue-700/50">
                    <CreditCard className="w-6 h-6 text-blue-400" />
                  </div>
                  Business Card Scanner
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Extract contact information from business cards using AI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => {
                    setActiveProcessor("business-card");
                    setUploadMode("extract");
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Scan Business Card
                </Button>
              </CardContent>
            </Card>

            {/* Document Extraction */}
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 transition-all cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-slate-100">
                  <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
                    <FileText className="w-6 h-6 text-emerald-400" />
                  </div>
                  Document Extractor
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Extract data from receipts, invoices, and other documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => {
                    setActiveProcessor("document-extractor");
                    setUploadMode("extract");
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Process Document
                </Button>
              </CardContent>
            </Card>

            {/* NEW: Cash Flow Extractor */}
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 transition-all cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-slate-100">
                  <div className="p-2 rounded-lg bg-green-900/30 border border-green-700/50">
                    <ArrowRightLeft className="w-6 h-6 text-green-400" />
                  </div>
                  Financial Document Extractor
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Extract income & expenses from spreadsheets, PDFs, etc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => {
                    setActiveProcessor("cash-flow");
                    setUploadMode("extract");
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Extract Transactions
                </Button>
              </CardContent>
            </Card>

            {/* Storage Only Upload */}
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 transition-all cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-slate-100">
                  <div className="p-2 rounded-lg bg-purple-900/30 border border-purple-700/50">
                    <FolderOpen className="w-6 h-6 text-purple-400" />
                  </div>
                  Storage Upload
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Upload documents for storage without AI processing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => {
                    setActiveProcessor("storage-only");
                    setUploadMode("storage");
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload for Storage
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Active Processor */}
      {activeProcessor === "business-card" && (
        <BusinessCardProcessor
          user={currentUser}
          onCancel={handleCancel}
          onProcessingChange={handleProcessingStateChange}
        />
      )}

      {activeProcessor === "document-extractor" && (
        <DocumentExtractor
          onCancel={handleCancel}
          onProcessingChange={handleProcessingStateChange}
        />
      )}

      {activeProcessor === "cash-flow" && (
        <CashFlowExtractor
          user={currentUser}
          onCancel={handleCancel}
          onProcessingChange={handleProcessingStateChange}
        />
      )}

      {activeProcessor === "storage-only" && (
        <StorageUploader
          onCancel={handleCancel}
          onProcessingChange={handleProcessingStateChange}
        />
      )}

      {/* Processing History */}
      {!activeProcessor && !isProcessing && (
        <ProcessingHistory user={currentUser} />
      )}
    </div>
  );
}

// New Storage-Only Upload Component
function StorageUploader({ onCancel, onProcessingChange }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    onProcessingChange(true);

    try {
      const { UploadFile } = await import("@/api/integrations");
      const { DocumentationFile } = await import("@/api/entities");
      const { User } = await import("@/api/entities");

      // Get current user for tenant info
      const currentUser = await User.me();

      // Upload file to storage
      const uploadResult = await UploadFile({ 
        file: selectedFile,
        tenant_id: currentUser.tenant_id 
      });

      if (!uploadResult.file_url) {
        throw new Error("File upload failed - no URL returned");
      }

      // Create document record for storage
      const documentRecord = await DocumentationFile.create({
        title: selectedFile.name,
        filename: selectedFile.name,
        filepath: uploadResult.filename, // Storage path from upload
        file_uri: uploadResult.file_url,  // Public/signed URL
        filesize: selectedFile.size,
        mimetype: selectedFile.type,
        category: "other",
        tenant_id: currentUser.tenant_id,
        tags: ["storage-upload"],
        uploaded_by: currentUser.email || currentUser.username,
      });

      setUploadResult({
        success: true,
        message: "Document uploaded successfully for storage!",
        documentId: documentRecord.id,
      });
    } catch (error) {
      console.error("Storage upload error:", error);
      setUploadResult({
        success: false,
        message: `Upload failed: ${error.message}`,
      });
    } finally {
      setUploading(false);
      onProcessingChange(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-purple-400" />
            Upload for Storage Only
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
          Upload documents to store them without any AI processing or data
          extraction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!uploadResult && (
          <>
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                onChange={handleFileSelect}
                className="hidden"
                id="storage-file-input"
              />
              <label htmlFor="storage-file-input" className="cursor-pointer">
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-300 font-medium mb-2">
                  Click to select a file for storage
                </p>
                <p className="text-slate-500 text-sm">
                  Supports PDF, images, Word documents, and text files
                </p>
              </label>
            </div>

            {selectedFile && (
              <Alert className="bg-slate-700 border-slate-600">
                <FileText className="h-4 w-4 text-slate-400" />
                <AlertDescription className="text-slate-300">
                  Selected: <strong>{selectedFile.name}</strong>{" "}
                  ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {uploading ? "Uploading..." : "Upload for Storage"}
              </Button>
              <Button
                variant="outline"
                onClick={onCancel}
                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
              >
                Cancel
              </Button>
            </div>
          </>
        )}

        {uploadResult && (
          <Alert
            className={uploadResult.success
              ? "bg-green-900/30 border-green-700/50"
              : "bg-red-900/30 border-red-700/50"}
          >
            <AlertCircle
              className={`h-4 w-4 ${
                uploadResult.success ? "text-green-400" : "text-red-400"
              }`}
            />
            <AlertDescription
              className={uploadResult.success
                ? "text-green-300"
                : "text-red-300"}
            >
              {uploadResult.message}
            </AlertDescription>
          </Alert>
        )}

        {uploadResult?.success && (
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setSelectedFile(null);
                setUploadResult(null);
              }}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            >
              Upload Another File
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              Done
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
