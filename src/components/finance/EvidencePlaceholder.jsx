/**
 * EvidencePlaceholder (UI Slice 1 / UI-1C)
 *
 * §7.11 Evidence / audit pack placeholder tab — gap state only. The
 * auditEvidenceBuilder runtime exists in backend/lib/finance/
 * auditEvidenceBuilder.js but has no HTTP surface yet (§8.2.8). No
 * generate-pack button (would be mutating), no download-pack button
 * (depends on a backend gap), no export / share affordance.
 */

import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function EvidencePlaceholder() {
  return (
    <div data-testid="finance-evidence-placeholder">
      <GapStateCard title="Evidence / audit packs" gap={FINANCE_API_GAPS.evidencePacks} />
    </div>
  );
}
