import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function FileUploadDiagnostics() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleTestUpload = async () => {
    setLoading(true);
    setResult(null);
    toast.info("Running file upload diagnostics...");
    
    try {
      // Create a dummy file in memory to send for the test
      const testContent = `This is a diagnostic test file generated at ${new Date().toISOString()}. If you see this, the upload was successful.`;
      const blob = new Blob([testContent], { type: 'text/plain' });
      const testFile = new File([blob], "diagnostic-upload-test.txt", { type: "text/plain" });

      // Create FormData and append the file
      const formData = new FormData();
      formData.append('file', testFile);

      // Get authentication headers - check for authorization token in localStorage or sessionStorage
      const headers = {};
      
      // Try to get the token from various possible storage locations
      const authToken = localStorage.getItem('supabase.auth.token') || 
                       sessionStorage.getItem('supabase.auth.token') ||
                       localStorage.getItem('sb-auth-token') ||
                       document.cookie.match(/sb-access-token=([^;]+)/)?.[1];

      if (authToken) {
        try {
          // If it's a JSON string, parse it to get the access_token
          const tokenData = JSON.parse(authToken);
          if (tokenData.access_token) {
            headers['Authorization'] = `Bearer ${tokenData.access_token}`;
          }
        } catch {
          // If parsing fails, assume it's already just the token
          headers['Authorization'] = `Bearer ${authToken}`;
        }
      }

      // Make the fetch request with proper authentication
      const response = await fetch('/api/apps/68ad592dcffacef630b477d2/functions/debugUploadPrivateFile', {
        method: 'POST',
        headers: headers,
        body: formData,
        credentials: 'include', // Include cookies for authentication
      });

      const data = await response.json();
      
      setResult(data);
      if (data.success) {
        toast.success("Diagnostic successful!", { description: data.message });
      } else {
        toast.error("Diagnostic failed.", { description: data.error });
      }
    } catch (error) {
      const errorData = { success: false, error: error.message };
      setResult(errorData);
      toast.error("Diagnostic request failed.", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Click to run an end-to-end test of the private file upload system. This simulates uploading a small text file, verifying its storage, and then deleting it, which helps diagnose permission issues (like 403 errors).
      </p>
      <Button 
        onClick={handleTestUpload} 
        disabled={loading}
        className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Run Private Upload Test
      </Button>
      
      {result && (
        <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
          <h4 className="font-semibold text-slate-200 mb-2 flex items-center gap-2">
            {result.success ? 
                <CheckCircle className="w-5 h-5 text-green-500" /> : 
                <AlertCircle className="w-5 h-5 text-red-500" />
            }
            Test Result:
          </h4>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap overflow-auto max-h-96">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}