/**
 * WorkflowNode — PEP Query Node Rendering Tests (Phase 5b)
 *
 * Verifies:
 *  1. PEP Query node renders with correct title
 *  2. Node description shows truncated source when configured
 *  3. Node description shows default text when no source configured
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorkflowNode from '../WorkflowNode.jsx';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowNode — PEP Query', () => {
  const baseProps = {
    isSelected: false,
    isConnecting: false,
    onClick: vi.fn(),
    onDelete: vi.fn(),
    onStartConnect: vi.fn(),
    dragHandleProps: {},
  };

  it('renders PEP Query title', () => {
    const node = { id: 'n1', type: 'pep_query', config: {} };
    render(<WorkflowNode node={node} {...baseProps} />);
    expect(screen.getByText('PEP Query')).toBeTruthy();
  });

  it('renders default description when no source configured', () => {
    const node = { id: 'n2', type: 'pep_query', config: {} };
    render(<WorkflowNode node={node} {...baseProps} />);
    expect(screen.getByText('Run a plain English CRM query')).toBeTruthy();
  });

  it('renders truncated source as description when configured', () => {
    const longSource =
      'show me all activities for lead entity_id in the last 30 days sorted by date';
    const node = { id: 'n3', type: 'pep_query', config: { source: longSource } };
    render(<WorkflowNode node={node} {...baseProps} />);
    // Source is > 50 chars, should be truncated with ...
    expect(
      screen.getByText(/show me all activities for lead entity_id in the l\.\.\./),
    ).toBeTruthy();
  });

  it('renders short source without truncation', () => {
    const shortSource = 'show me open leads';
    const node = { id: 'n4', type: 'pep_query', config: { source: shortSource } };
    render(<WorkflowNode node={node} {...baseProps} />);
    expect(screen.getByText('show me open leads')).toBeTruthy();
  });
});
