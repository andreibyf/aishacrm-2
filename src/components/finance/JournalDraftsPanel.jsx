/**
 * JournalDraftsPanel (UI Slice 1 / UI-1C)
 *
 * §7.4 Journal drafts tab — gap state only. No GET /journal-drafts endpoint
 * exists today (§8.2.2). Slice 1 deliberately does NOT call POST
 * /journal-drafts; that mutating endpoint is excluded from finance.js.
 */

import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function JournalDraftsPanel() {
  return (
    <div data-testid="finance-journal-drafts-panel">
      <GapStateCard title="Journal drafts" gap={FINANCE_API_GAPS.journalDrafts} />
    </div>
  );
}
