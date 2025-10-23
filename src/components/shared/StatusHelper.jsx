
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

// Comprehensive status descriptions for all entities with more detail
const statusDescriptions = {
  // Activities
  activity_scheduled: "Activities that are planned for a future date and time. These tasks are on your calendar and awaiting action at their scheduled time.",
  activity_in_progress: "Activities that are currently being worked on or are actively in process. These require immediate attention and completion.",
  activity_overdue: "Activities that have passed their due date without being completed. These should be prioritized or rescheduled to keep your pipeline moving.",
  activity_completed: "Activities that have been successfully completed and closed. These contribute to your productivity metrics and activity history.",
  activity_cancelled: "Activities that were cancelled and will not be completed. These might represent changed priorities or circumstances.",
  
  // Contacts
  contact_active: "Contacts who are actively engaged with your business, responding to communications, and participating in your sales process.",
  contact_inactive: "Contacts who are not currently engaged or responsive to outreach. Consider re-engagement campaigns or archiving if permanently inactive.",
  contact_prospect: "Potential contacts who haven't made a purchase yet but show interest. These are in your pipeline for conversion to customers.",
  contact_customer: "Contacts who have become paying customers. These represent successful conversions and should be nurtured for retention and upsells.",
  
  // Accounts
  account_prospect: "Companies that are potential customers but haven't purchased yet. These are target accounts in your sales pipeline awaiting conversion.",
  account_customer: "Companies that are active paying customers with current or recent purchases. Focus on retention, satisfaction, and expansion opportunities.",
  account_partner: "Companies that have a partnership or collaboration agreement with your business. These relationships are strategic and mutually beneficial.",
  account_competitor: "Companies that compete in the same market or for the same customers. Track these for competitive intelligence and market positioning.",
  account_vendor: "Companies that provide products or services to your business. These are your suppliers and service providers.",
  
  // Leads
  lead_new: "Recently created leads that haven't been contacted yet. These should be qualified and reached out to promptly while interest is fresh.",
  lead_contacted: "Leads that have been reached out to at least once. Track response rates and follow up appropriately based on engagement level.",
  lead_qualified: "Leads that meet your criteria and show genuine potential for conversion. These should be prioritized for deeper engagement and conversion efforts.",
  lead_unqualified: "Leads that don't meet your criteria or aren't a good fit for your offering. Consider nurturing for future opportunities or archiving.",
  lead_converted: "Leads that have been successfully converted to contacts and/or opportunities. These represent successful pipeline progression.",
  lead_lost: "Leads that were lost to competitors or are no longer interested. Analyze these for insights into win/loss patterns and improvement opportunities.",
  
  // Opportunities
  opportunity_prospecting: "Initial stage - identifying and researching potential opportunities. Gather information and assess fit before deeper engagement.",
  opportunity_qualification: "Evaluating if the opportunity is worth pursuing based on budget, authority, need, and timeline (BANT) criteria.",
  opportunity_proposal: "Formal proposal or quote has been submitted to the prospect. Monitor closely for questions and be ready to negotiate terms.",
  opportunity_negotiation: "Terms, pricing, and contract details are being finalized. Work closely with stakeholders to address objections and close the deal.",
  opportunity_closed_won: "Successfully closed deals that resulted in revenue. Celebrate wins and ensure smooth handoff to delivery/success teams.",
  opportunity_closed_lost: "Opportunities that didn't result in a sale. Conduct win/loss analysis to understand why and improve future approach.",
  
  // BizDev Sources
  bizdev_total: "Total number of business development sources in your database. These are potential prospects from various sources like directories, trade shows, and research.",
  bizdev_active: "Active BizDev sources that are being pursued or evaluated. These companies haven't been promoted to accounts yet but show potential for business development.",
  bizdev_promoted: "BizDev sources that have been successfully promoted to full Account records. This happens when you win their business and they become customers.",
  bizdev_archived: "BizDev sources that have been archived to cloud storage (Cloudflare R2). Archive sources that are no longer being pursued to keep your active database clean and performant.",
  
  // General totals
  total_all: "Total number of records in the system across all statuses. This gives you a complete view of your database size and growth over time."
};

export default function StatusHelper({ statusKey, className = "" }) {
  const description = statusDescriptions[statusKey];
  
  if (!description) {
    return null;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span 
            className={`inline-flex items-center justify-center cursor-help ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-300 transition-colors" />
          </span>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-xs bg-slate-800 border-slate-700 text-slate-200 p-3"
        >
          <p className="text-sm leading-relaxed">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
