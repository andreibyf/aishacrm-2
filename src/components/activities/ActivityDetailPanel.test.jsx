/**
 * Component tests for src/components/activities/ActivityDetailPanel.jsx
 * Tests the activity detail panel component
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActivityDetailPanel from './ActivityDetailPanel';
import { formatActivityDateTime } from '../shared/timezoneUtils';

// Mock dependencies
vi.mock('../shared/UniversalDetailPanel', () => ({
  default: ({ title, data, actions }) => (
    <div data-testid="universal-detail-panel">
      <h2>{title}</h2>
      {data.map((item, index) => (
        <div key={index} data-testid={`data-item-${item.label}`}>
          <strong>{item.label}:</strong> {item.value}
        </div>
      ))}
      <div data-testid="actions">
        {actions?.map((action, index) => (
          <button key={index} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  ),
}));

vi.mock('../shared/timezoneUtils', () => ({
  getCurrentTimezoneOffset: vi.fn(() => -300), // EST
  getTimezoneDisplayName: vi.fn(() => 'Eastern Time'),
  formatActivityDateTime: vi.fn((activity) => 'Jan 15, 2024 2:00 PM EST'),
}));

vi.mock('../shared/TimezoneContext', () => ({
  useTimezone: vi.fn(() => ({
    selectedTimezone: 'America/New_York',
  })),
}));

const mockActivity = {
  id: '123',
  title: 'Call with John Doe',
  description: 'Discuss project requirements',
  due_date: '2024-01-15T19:00:00Z',
  status: 'pending',
  type: 'call',
  related_to: 'contact',
  related_id: '456',
  assigned_to: '789',
};

const mockUser = {
  id: '789',
  full_name: 'Jane Smith',
};

const mockContacts = [
  {
    id: '456',
    first_name: 'John',
    last_name: 'Doe',
    phone: '555-0123',
    company: 'ABC Corp',
  },
];

describe('ActivityDetailPanel.jsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders activity details correctly', () => {
    render(
      <ActivityDetailPanel
        activity={mockActivity}
        assignedUserName="Jane Smith"
        contacts={mockContacts}
        open={true}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        user={mockUser}
      />
    );

    // Check that UniversalDetailPanel is rendered
    expect(screen.getByTestId('universal-detail-panel')).toBeInTheDocument();

    // Check title
    expect(screen.getByText('Call with John Doe')).toBeInTheDocument();

    // Check formatted date
    expect(screen.getByTestId('data-item-Due Date')).toHaveTextContent('Jan 15, 2024 2:00 PM EST');
  });

  test('computes related record info from contacts', () => {
    render(
      <ActivityDetailPanel
        activity={mockActivity}
        assignedUserName="Jane Smith"
        contacts={mockContacts}
        open={true}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        user={mockUser}
      />
    );

    // Should show related contact info
    expect(screen.getByTestId('data-item-Related To')).toHaveTextContent('John Doe');
  });

  test('handles different related entities', () => {
    const leadActivity = {
      ...mockActivity,
      related_to: 'lead',
      related_id: '999',
    };

    const mockLeads = [
      {
        id: '999',
        first_name: 'Jane',
        last_name: 'Smith',
        company: 'XYZ Inc',
      },
    ];

    render(
      <ActivityDetailPanel
        activity={leadActivity}
        assignedUserName="Jane Smith"
        leads={mockLeads}
        open={true}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        user={mockUser}
      />
    );

    expect(screen.getByTestId('data-item-Related To')).toHaveTextContent('Jane Smith');
  });

  test('shows action buttons', () => {
    const mockOnEdit = vi.fn();
    const mockOnDelete = vi.fn();

    render(
      <ActivityDetailPanel
        activity={mockActivity}
        assignedUserName="Jane Smith"
        contacts={mockContacts}
        open={true}
        onOpenChange={() => {}}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        user={mockUser}
      />
    );

    const actions = screen.getByTestId('actions');

    // Should have Edit and Delete buttons
    expect(actions).toHaveTextContent('Edit');
    expect(actions).toHaveTextContent('Delete');
  });

  test('handles missing activity gracefully', () => {
    render(
      <ActivityDetailPanel
        activity={null}
        assignedUserName="Jane Smith"
        open={true}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        user={mockUser}
      />
    );

    // Should still render without crashing
    expect(screen.getByTestId('universal-detail-panel')).toBeInTheDocument();
  });

  test('formats dates with timezone', () => {
    render(
      <ActivityDetailPanel
        activity={mockActivity}
        assignedUserName="Jane Smith"
        contacts={mockContacts}
        open={true}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        user={mockUser}
      />
    );

    // Should call formatActivityDateTime with correct parameters
    expect(formatActivityDateTime).toHaveBeenCalledWith(mockActivity, -300);
  });
});