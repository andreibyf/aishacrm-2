
import React from "react";
import { Globe, ExternalLink, Building2, User, Link as LinkIcon, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InternetSearchResults({ results = [], onAddLead, onAddContact }) {
  if (!results || results.length === 0) {
    return (
      <div className="text-slate-400 text-sm">No web results yet. Try another query.</div>
    );
  }

  return (
    <div className="space-y-3">
      {results.map((item, idx) => {
        const isCompany = (item.type || "").toLowerCase().includes("company");
        const hasUrl = !!item.website || !!item.domain || !!item.linkedin;
        const primaryUrl = item.website || (item.domain ? `https://${item.domain}` : item.linkedin);

        return (
          <div
            key={idx}
            className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {isCompany ? (
                    <Building2 className="w-4 h-4 text-blue-400" />
                  ) : (
                    <User className="w-4 h-4 text-purple-400" />
                  )}
                  <h4 className="text-slate-100 font-medium truncate">{item.name || item.title || "Unknown"}</h4>
                </div>
                {item.summary && (
                  <p className="mt-1 text-sm text-slate-300 line-clamp-3">{item.summary}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                  {item.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {item.location}
                    </span>
                  )}
                  {item.domain && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {item.domain}
                    </span>
                  )}
                  {item.linkedin && (
                    <span className="inline-flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />
                      LinkedIn
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-2">
                {hasUrl && primaryUrl && (
                  <a
                    href={primaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-slate-200 hover:text-white"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <div className="flex gap-2">
                  {onAddLead && (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 h-7 px-2 text-xs"
                      onClick={() => onAddLead(item)}
                      title="Create a Lead from this result"
                    >
                      Save as Lead
                    </Button>
                  )}
                  {onAddContact && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs"
                      onClick={() => onAddContact(item)}
                      title="Create a Contact from this result"
                    >
                      Save as Contact
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
