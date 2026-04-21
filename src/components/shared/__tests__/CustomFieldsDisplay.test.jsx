/**
 * Tests for CustomFieldsDisplay — the read-only renderer used in detail panels.
 *
 * Covers:
 *  - formatValue() per supported field_type (pure function unit tests)
 *  - Timezone-safe date handling (regression for YYYY-MM-DD shift bug)
 *  - Component renders correctly when values exist
 *  - Component returns null when no definitions OR no values
 *  - showHeader renders the self-contained section header
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomFieldsDisplay, formatValue } from '../CustomFieldsDisplay';

vi.mock('@/hooks/useCustomFields', () => ({
  useCustomFields: vi.fn(),
}));

import { useCustomFields } from '@/hooks/useCustomFields';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── formatValue() unit tests ───────────────────────────────────────────────

describe('formatValue', () => {
  test('text: passes through as string', () => {
    expect(formatValue('hello world', { field_type: 'text' })).toBe('hello world');
  });

  test('number: formats with toLocaleString', () => {
    expect(formatValue(1234567, { field_type: 'number' })).toBe('1,234,567');
    expect(formatValue('4200', { field_type: 'number' })).toBe('4,200');
  });

  test('number: falls back to String(value) for non-numeric input', () => {
    expect(formatValue('not-a-number', { field_type: 'number' })).toBe('not-a-number');
  });

  test('currency: prefixes $ and forces 2 decimals', () => {
    expect(formatValue(1234.5, { field_type: 'currency' })).toBe('$1,234.50');
    expect(formatValue(0, { field_type: 'currency' })).toBe('$0.00');
    expect(formatValue('99', { field_type: 'currency' })).toBe('$99.00');
  });

  test('currency: falls back to String(value) for non-numeric input', () => {
    expect(formatValue('bad', { field_type: 'currency' })).toBe('bad');
  });

  // Regression: prior bug used `new Date("2026-06-01")` which parses as UTC
  // midnight and shifts to the previous day in any UTC-offset-negative zone.
  test('date: YYYY-MM-DD stays on the same calendar day regardless of timezone', () => {
    expect(formatValue('2026-06-01', { field_type: 'date' })).toBe('Jun 1, 2026');
    expect(formatValue('2026-01-01', { field_type: 'date' })).toBe('Jan 1, 2026');
    expect(formatValue('2026-12-31', { field_type: 'date' })).toBe('Dec 31, 2026');
  });

  test('date: falls back to String(value) for unparseable input', () => {
    expect(formatValue('not-a-date', { field_type: 'date' })).toBe('not-a-date');
  });

  test('datetime: formats full timestamp including time', () => {
    const result = formatValue('2026-06-01T14:30:00.000Z', { field_type: 'datetime' });
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/:/);
  });

  test('checkbox: renders Yes/No', () => {
    expect(formatValue(true, { field_type: 'checkbox' })).toBe('Yes');
    expect(formatValue(false, { field_type: 'checkbox' })).toBe('No');
    expect(formatValue('true', { field_type: 'checkbox' })).toBe('Yes');
    expect(formatValue(1, { field_type: 'checkbox' })).toBe('Yes');
    expect(formatValue(0, { field_type: 'checkbox' })).toBe('No');
  });

  test('select: looks up label from options', () => {
    const field = {
      field_type: 'select',
      options: [
        { value: 'hi', label: 'High' },
        { value: 'lo', label: 'Low' },
      ],
    };
    expect(formatValue('hi', field)).toBe('High');
    expect(formatValue('lo', field)).toBe('Low');
  });

  test('select: falls back to raw value when no matching option', () => {
    const field = { field_type: 'select', options: [{ value: 'a', label: 'A' }] };
    expect(formatValue('unknown', field)).toBe('unknown');
  });

  test('multiselect: joins option labels with comma', () => {
    const field = {
      field_type: 'multiselect',
      options: [
        { value: '1', label: 'One' },
        { value: '2', label: 'Two' },
        { value: '3', label: 'Three' },
      ],
    };
    expect(formatValue(['1', '2'], field)).toBe('One, Two');
    expect(formatValue(['1', '3'], field)).toBe('One, Three');
  });

  test('multiselect: handles empty array', () => {
    const field = { field_type: 'multiselect', options: [] };
    expect(formatValue([], field)).toBe('');
  });

  test('unknown field_type defaults to String(value)', () => {
    expect(formatValue('anything', { field_type: 'unknown' })).toBe('anything');
    expect(formatValue('anything', null)).toBe('anything');
  });
});

// ─── Component render tests ──────────────────────────────────────────────────

describe('CustomFieldsDisplay', () => {
  test('returns null when no custom field definitions exist', () => {
    useCustomFields.mockReturnValue({ customFields: [], loading: false });

    const { container } = render(
      <CustomFieldsDisplay entityType="Opportunity" metadata={{ custom: { foo: 'bar' } }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('returns null when definitions exist but metadata has no stored values', () => {
    useCustomFields.mockReturnValue({
      customFields: [{ field_name: 'custom_budget', label: 'Budget', field_type: 'currency' }],
      loading: false,
    });

    const { container } = render(<CustomFieldsDisplay entityType="Opportunity" metadata={{}} />);
    expect(container.firstChild).toBeNull();
  });

  test('returns null when metadata.custom value is empty string', () => {
    useCustomFields.mockReturnValue({
      customFields: [{ field_name: 'custom_note', label: 'Note', field_type: 'text' }],
      loading: false,
    });

    const { container } = render(
      <CustomFieldsDisplay entityType="Opportunity" metadata={{ custom: { custom_note: '' } }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders label and formatted value when a value is stored', () => {
    useCustomFields.mockReturnValue({
      customFields: [{ field_name: 'custom_budget', label: 'Budget', field_type: 'currency' }],
      loading: false,
    });

    render(
      <CustomFieldsDisplay
        entityType="Opportunity"
        metadata={{ custom: { custom_budget: 1500 } }}
      />,
    );
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  test('renders multiple fields with correct formatting per type', () => {
    useCustomFields.mockReturnValue({
      customFields: [
        { field_name: 'custom_budget', label: 'Budget', field_type: 'currency' },
        { field_name: 'custom_due', label: 'Due Date', field_type: 'date' },
        { field_name: 'custom_notes', label: 'Notes', field_type: 'text' },
      ],
      loading: false,
    });

    render(
      <CustomFieldsDisplay
        entityType="Opportunity"
        metadata={{
          custom: {
            custom_budget: 2500.5,
            custom_due: '2026-09-15',
            custom_notes: 'Follow up next week',
          },
        }}
      />,
    );

    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('$2,500.50')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Sep 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Follow up next week')).toBeInTheDocument();
  });

  test('omits fields with no stored value even when other fields have values', () => {
    useCustomFields.mockReturnValue({
      customFields: [
        { field_name: 'custom_a', label: 'Alpha', field_type: 'text' },
        { field_name: 'custom_b', label: 'Beta', field_type: 'text' },
      ],
      loading: false,
    });

    render(
      <CustomFieldsDisplay
        entityType="Opportunity"
        metadata={{ custom: { custom_a: 'present' } }}
      />,
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  test('showHeader=true renders the section header', () => {
    useCustomFields.mockReturnValue({
      customFields: [{ field_name: 'custom_x', label: 'X', field_type: 'text' }],
      loading: false,
    });

    render(
      <CustomFieldsDisplay
        entityType="Opportunity"
        metadata={{ custom: { custom_x: 'value' } }}
        showHeader
      />,
    );

    expect(screen.getByText('Additional Information')).toBeInTheDocument();
  });

  test('showHeader=false (default) omits the section header', () => {
    useCustomFields.mockReturnValue({
      customFields: [{ field_name: 'custom_x', label: 'X', field_type: 'text' }],
      loading: false,
    });

    render(
      <CustomFieldsDisplay entityType="Opportunity" metadata={{ custom: { custom_x: 'value' } }} />,
    );

    expect(screen.queryByText('Additional Information')).not.toBeInTheDocument();
  });

  test('returns null while definitions are loading', () => {
    useCustomFields.mockReturnValue({ customFields: [], loading: true });

    const { container } = render(
      <CustomFieldsDisplay entityType="Opportunity" metadata={{ custom: { custom_x: 'value' } }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
