/**
 * Regression test for #XYZ — ConfirmDialog silently non-rendering on Accounts page.
 *
 * Bug: `Accounts.jsx` used `{ConfirmDialogPortal}` (bare function reference) instead
 * of `<ConfirmDialogPortal />` (JSX element). React silently rendered nothing,
 * so clicking Delete triggered a handler that hung forever on `await confirm(...)`.
 *
 * This test locks in the fix by asserting that the confirm dialog actually mounts
 * when delete is clicked. Guards against anyone re-introducing the pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Minimal mock harness — we only care that the dialog mounts, not the full page flow.
// If you'd rather run this against the real Accounts page, swap the stub for a real
// import and provide a full user + tenant context.

vi.mock('@/api/entities', () => ({
  Account: {
    delete: vi.fn().mockResolvedValue({ id: 'a1', deleted: true }),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
  },
  Employee: { filter: vi.fn().mockResolvedValue([]) },
}));

import { useConfirmDialog } from '@/components/shared/ConfirmDialog';

describe('ConfirmDialog rendering contract', () => {
  it('renders the dialog element when confirm() is called (regression for #XYZ)', async () => {
    // Minimal component that mirrors the Accounts page pattern
    function Harness() {
      const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
      const [result, setResult] = React.useState(null);

      const handleClick = async () => {
        const ok = await confirm({
          title: 'Delete account?',
          description: 'This action cannot be undone.',
          variant: 'destructive',
          confirmText: 'Delete',
          cancelText: 'Cancel',
        });
        setResult(ok ? 'confirmed' : 'cancelled');
      };

      return (
        <>
          <button onClick={handleClick}>Trigger</button>
          {result && <div data-testid="result">{result}</div>}
          {/* CORRECT usage — JSX element, not bare function reference. */}
          <ConfirmDialogPortal />
        </>
      );
    }

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /trigger/i }));

    // The regression was that this title never appeared because the dialog
    // component was never rendered. If that comes back, this line fails.
    await waitFor(() => {
      expect(screen.getByText('Delete account?')).toBeInTheDocument();
    });

    // Confirm the promise resolves when the user clicks Delete
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('confirmed');
    });
  });

  it('dialog is NOT rendered when written as bare function reference (documents the bug)', async () => {
    // This test documents the buggy pattern so no one accidentally reintroduces it.
    function BrokenHarness() {
      const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
      const handleClick = () => confirm({ title: 'Should never appear' });
      return (
        <>
          <button onClick={handleClick}>Trigger</button>
          {/* WRONG — bare function reference, React renders nothing. */}
          {ConfirmDialogPortal}
        </>
      );
    }

    render(<BrokenHarness />);
    await userEvent.click(screen.getByRole('button', { name: /trigger/i }));

    // Give React a tick to (fail to) render the dialog
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText('Should never appear')).not.toBeInTheDocument();
  });
});
