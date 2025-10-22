import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { KeyRound, FileJson, Beaker, CheckCircle } from "lucide-react";

export default function WebhookSetupGuide() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1" className="border-slate-700">
        <AccordionTrigger className="text-slate-200 hover:no-underline">
          <div className="flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-amber-400" />
            <span>Step 1: Authentication</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="text-slate-400 prose prose-sm prose-invert max-w-none">
          <p>Your webhooks must be authenticated using an API key sent as a request header.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Go to <code className="bg-slate-900 rounded px-1.5 py-0.5 font-mono text-cyan-400">Settings → System → API Key Manager</code>.</li>
            <li>Create a new key and copy its value.</li>
            <li>In your external service (like n8n or Zapier), add a request header:</li>
            <li className="ml-4"><strong className="text-slate-300">Header Name:</strong> <code className="bg-slate-900 rounded px-1.5 py-0.5 font-mono text-cyan-400">api_key</code></li>
            <li className="ml-4"><strong className="text-slate-300">Header Value:</strong> Your generated API key.</li>
          </ul>
        </AccordionContent>
      </AccordionItem>
      
      <AccordionItem value="item-2" className="border-slate-700">
        <AccordionTrigger className="text-slate-200 hover:no-underline">
          <div className="flex items-center gap-3">
            <FileJson className="w-5 h-5 text-blue-400" />
            <span>Step 2: Request Body & Payload</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="text-slate-400 prose prose-sm prose-invert max-w-none">
          <p>Your request must be a <code className="bg-slate-900 rounded px-1.5 py-0.5 font-mono text-cyan-400">POST</code> request with a JSON body. The specific fields required depend on the webhook you are calling.</p>
          <p>For example, to create a lead using the <code className="bg-slate-900 rounded px-1.5 py-0.5 font-mono text-cyan-400">n8nCreateLead</code> webhook, your payload should look like this:</p>
          <pre className="bg-slate-900 text-slate-300 p-3 rounded-md text-xs mt-1 font-mono overflow-x-auto">{`{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "company": "Example Inc."
}`}</pre>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-3" className="border-slate-700">
        <AccordionTrigger className="text-slate-200 hover:no-underline">
          <div className="flex items-center gap-3">
            <Beaker className="w-5 h-5 text-green-400" />
            <span>Step 3: Testing</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="text-slate-400 prose prose-sm prose-invert max-w-none">
          <p>Use a tool like Postman or Insomnia to test your webhook before integrating it with your service. This helps you quickly diagnose any issues with authentication or the request body.</p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-4" className="border-b-0 border-slate-700">
        <AccordionTrigger className="text-slate-200 hover:no-underline">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-fuchsia-400" />
            <span>Step 4: Final URL</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="text-slate-400 prose prose-sm prose-invert max-w-none">
          <p>Make sure you are using the full, correct webhook URL provided in the sections above, including the full domain.</p>
          <p>Example URL structure: <code className="bg-slate-900 rounded px-1.5 py-0.5 font-mono text-cyan-400 break-all">https://[your-app-domain].base44.app/api/apps/[app-id]/functions/[function-name]</code></p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}