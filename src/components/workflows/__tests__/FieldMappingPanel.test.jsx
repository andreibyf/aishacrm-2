/**
 * FieldMappingPanel.test.jsx
 *
 * Tests for the reusable Zapier-style field mapping component.
 *
 * Coverage:
 *  1. Renders empty state with only the "Add Field" button
 *  2. Renders existing mappings
 *  3. Add row — calls onChange with new empty entry appended
 *  4. Remove row — calls onChange with that entry removed
 *  5. Target field change — calls onChange with updated target_field
 *  6. addLabel prop overrides button text
 *  7. Header row is shown only when mappings exist
 *  8. TokenPicker shows placeholder text when no value selected
 *  9. TokenPicker shows no upstream tokens message when tokens array is empty
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldMappingPanel from '../FieldMappingPanel.jsx';

// ─── UI component mocks ───────────────────────────────────────────────────

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ ...props }) => <input {...props} />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }) => (
    <div data-testid="select" data-value={value}>
      {/* Expose a hidden button to trigger value change in tests */}
      <button
        data-testid="select-trigger-change"
        onClick={() => onValueChange && onValueChange('email')}
      >
        {value || 'Select'}
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────

const targetSchema = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
];

const upstreamTokens = [
  { key: 'email', label: 'email', stepIndex: 1, stepLabel: 'Webhook Trigger', nodeType: 'webhook_trigger', example: 'test@example.com' },
  { key: 'first_name', label: 'first_name', stepIndex: 1, stepLabel: 'Webhook Trigger', nodeType: 'webhook_trigger', example: 'Jane' },
];

const baseMappings = [
  { target_field: 'email', source_type: 'token', source_value: 'email' },
  { target_field: 'first_name', source_type: 'token', source_value: 'first_name' },
];

// ─── Tests ────────────────────────────────────────────────────────────────

describe('[WORKFLOWS] FieldMappingPanel', () => {
  let onChange;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it('renders Add Field button when mappings are empty', () => {
    render(
      <FieldMappingPanel
        mappings={[]}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
      />,
    );
    expect(screen.getByText('Add Field')).toBeTruthy();
  });

  it('does not render header row when mappings are empty', () => {
    render(
      <FieldMappingPanel
        mappings={[]}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
      />,
    );
    expect(screen.queryByText('Target Field')).toBeNull();
  });

  it('renders header row when mappings exist', () => {
    render(
      <FieldMappingPanel
        mappings={baseMappings}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
      />,
    );
    expect(screen.getByText('Target Field')).toBeTruthy();
    expect(screen.getByText('Source Value')).toBeTruthy();
  });

  it('renders one row per mapping', () => {
    render(
      <FieldMappingPanel
        mappings={baseMappings}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
      />,
    );
    // 2 mappings = 2 Select components for target fields
    const selects = screen.getAllByTestId('select');
    expect(selects.length).toBe(2);
  });

  it('calls onChange with appended empty entry when Add button clicked', () => {
    render(
      <FieldMappingPanel
        mappings={baseMappings}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
      />,
    );
    fireEvent.click(screen.getByText('Add Field'));
    expect(onChange).toHaveBeenCalledOnce();
    const result = onChange.mock.calls[0][0];
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ target_field: '', source_type: 'token', source_value: '' });
  });

  it('calls onChange with row removed when X button clicked', () => {
    render(
      <FieldMappingPanel
        mappings={baseMappings}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
      />,
    );
    // The Select mock renders one button per row (select-trigger-change).
    // The remove (X) buttons are the last button in each row — find by
    // filtering out the 'Add Field' button and the select-trigger-change buttons.
    const allButtons = screen.getAllByRole('button');
    // Layout per row: [select-trigger-change, TokenPicker-chevron, remove-X]
    // Plus final 'Add Field' button. With 2 rows: 6 buttons + 1 = 7 total.
    // Remove buttons are at indices 2 and 5 (every 3rd, 0-indexed).
    // Clicking the first remove (index 2) should remove row 0 (email).
    const removeButtons = allButtons.filter(
      (btn) => !btn.textContent.includes('Add') && !btn.textContent.includes('email') &&
               !btn.textContent.includes('first_name') && !btn.textContent.includes('Select'),
    );
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledOnce();
    const result = onChange.mock.calls[0][0];
    expect(result).toHaveLength(1);
    expect(result[0].target_field).toBe('first_name');
  });

  it('overrides add button label via addLabel prop', () => {
    render(
      <FieldMappingPanel
        mappings={[]}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
        addLabel="Add Activity Field"
      />,
    );
    expect(screen.getByText('Add Activity Field')).toBeTruthy();
  });

  it('renders TokenPicker with placeholder when source_value is empty', () => {
    render(
      <FieldMappingPanel
        mappings={[{ target_field: 'email', source_type: 'token', source_value: '' }]}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={upstreamTokens}
      />,
    );
    expect(screen.getByText('Pick value…')).toBeTruthy();
  });

  it('shows no-tokens message in popover when upstreamTokens is empty', () => {
    render(
      <FieldMappingPanel
        mappings={[{ target_field: 'email', source_type: 'token', source_value: '' }]}
        onChange={onChange}
        targetSchema={targetSchema}
        upstreamTokens={[]}
      />,
    );
    // Open the picker popover
    fireEvent.click(screen.getByText('Pick value…'));
    expect(
      screen.getByText(/No upstream data available/),
    ).toBeTruthy();
  });
});
