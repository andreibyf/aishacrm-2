/**
 * Friendly messages for the structured `FINANCE_*` error codes the Finance v2
 * write endpoints return (surfaced as `err.code` by the financeWrites client).
 * Mirrors the ChartOfAccountsPanel COA error-mapping pattern, extended for the
 * journal/invoice write flow. Falls back to the server message.
 */

const FINANCE_WRITE_ERROR_MESSAGES = {
  FINANCE_WRITE_FORBIDDEN: 'You need an admin role to post finance transactions.',
  FINANCE_AI_BLOCKED: 'AI assistants cannot approve or post finance actions.',
  FINANCE_UNBALANCED_JOURNAL: 'The entry is not balanced — total debits must equal total credits.',
  FINANCE_COA_ACCOUNT_INACTIVE:
    'One of the accounts is inactive — reactivate it or pick a different account.',
  FINANCE_JOURNAL_NOT_DRAFT: 'This entry is no longer a draft — refresh and try again.',
  FINANCE_INVOICE_NOT_DRAFT: 'This invoice is no longer a draft — refresh and try again.',
  FINANCE_APPROVAL_DUPLICATE: 'This item is already awaiting approval.',
  FINANCE_DATA_MODE_UNRESOLVED: 'The tenant Test/Live mode could not be resolved — try again.',
  FINANCE_TEST_MODE_REQUIRED: 'This action is only available in Test mode.',
};

export function financeWriteErrorMessage(err) {
  if (!err) return 'Something went wrong.';
  return FINANCE_WRITE_ERROR_MESSAGES[err.code] || err.message || 'Something went wrong.';
}

export default financeWriteErrorMessage;
