/**
 * PlanSelector
 *
 * Renders a responsive grid of billing plans. Highlights the current plan
 * when provided. Emits the selected plan to onSelect.
 *
 * Props:
 *   plans            -- array of plan objects (from /api/billing/plans)
 *   currentPlanCode  -- plan code of the tenant's active subscription
 *   onSelect         -- callback(plan)
 *   selectLabel      -- CTA label (default "Select plan")
 *   submittingCode   -- plan code currently mid-request; its button shows a spinner
 */

import { Loader2 } from 'lucide-react';
import PlanCard from './PlanCard';

export default function PlanSelector({
  plans,
  currentPlanCode,
  onSelect,
  selectLabel = 'Select plan',
  submittingCode = null,
}) {
  if (!Array.isArray(plans) || plans.length === 0) {
    return (
      <div
        role="status"
        className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center text-sm text-slate-400"
      >
        No plans available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {plans.map((plan) => {
        const isSubmitting = submittingCode === plan.code;
        return (
          <PlanCard
            key={plan.code}
            plan={plan}
            isCurrent={currentPlanCode === plan.code}
            onSelect={onSelect}
            selectLabel={
              isSubmitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing…
                </span>
              ) : (
                selectLabel
              )
            }
            disabled={isSubmitting}
          />
        );
      })}
    </div>
  );
}
