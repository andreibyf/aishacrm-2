import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Sparkles, ExternalLink, Clock } from "lucide-react";
import AishaEntityChatModal from "@/components/ai/AishaEntityChatModal";
import { formatDistanceToNow } from 'date-fns';

export default function EntityAiSummaryCard({ 
  entityType, 
  entityId, 
  entityLabel, 
  aiSummary, 
  lastUpdated,
  relatedData = {}, // { profile, opportunities, activities, notes }
  profile = null // The full entity profile data
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleBackOfficeClick = () => {
    // Open Office Viz in a new tab with query params
    // Production: backoffice.aishacrm.com (via Cloudflare Tunnel)
    // Local: localhost:4010 (direct)
    let officeVizUrl;
    if (window.location.hostname === 'app.aishacrm.com') {
      officeVizUrl = `https://backoffice.aishacrm.com?entity_type=${entityType}&entity_id=${entityId}`;
    } else if (window.location.hostname === 'localhost') {
      officeVizUrl = `http://localhost:4010?entity_type=${entityType}&entity_id=${entityId}`;
    } else {
      officeVizUrl = `http://${window.location.hostname}:4010?entity_type=${entityType}&entity_id=${entityId}`;
    }
    window.open(officeVizUrl, '_blank');
  };

  return (
    <>
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-5 mb-6 shadow-sm">
        <div className="flex flex-row items-center justify-between pb-2">
          <h3 className="text-lg font-bold flex items-center gap-2 text-indigo-900">
            <Sparkles className="w-5 h-5" />
            AI Summary
          </h3>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsModalOpen(true)}
              className="bg-white border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs h-8"
            >
              Ask AiSHA
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBackOfficeClick}
              className="bg-white border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs h-8"
              title="Open Back Office"
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Visit Office
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          <div className="prose prose-sm max-w-none text-indigo-800 leading-relaxed">
            {aiSummary || "No summary available yet. Ask AiSHA to generate one."}
          </div>
          
          {lastUpdated && (
            <div className="flex items-center gap-2 text-xs text-indigo-400 pt-2 border-t border-indigo-200/50">
              <Clock className="w-3 h-3" />
              <span>Last updated {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}</span>
            </div>
          )}
        </div>
      </div>

      <AishaEntityChatModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entityType={entityType}
        entityId={entityId}
        entityLabel={entityLabel}
        relatedData={{ ...relatedData, profile }}
      />
    </>
  );
}
