import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { ExternalLink } from "lucide-react";

export default function ResearchDialog({ open, onOpenChange, query, data }) {
  const answer = data?.answer || data?.summary || "";
  const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
  const sources = Array.isArray(data?.sources) ? data.sources : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-slate-900 border border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Web Research</DialogTitle>
          <DialogDescription className="text-slate-400">
            Results for: <span className="text-slate-200 font-medium">{query || "Your question"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(answer || bullets.length > 0) && (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                {answer && (
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown>{answer}</ReactMarkdown>
                  </div>
                )}
                {bullets.length > 0 && (
                  <ul className="list-disc pl-5 mt-3 space-y-1 text-slate-200">
                    {bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <div>
            <div className="text-sm font-semibold text-slate-300 mb-2">Sources</div>
            {sources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sources.slice(0, 8).map((src, i) => (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1"
                    title={src}
                  >
                    <Badge variant="outline" className="bg-slate-800 border-slate-600 text-blue-300 hover:bg-slate-700">
                      Source {i + 1}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Badge>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">No explicit sources returned.</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}