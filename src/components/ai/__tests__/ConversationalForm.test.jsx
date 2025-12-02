/**
 * Tests for ConversationalForm component
 * Phase 2 Task 2.3 verification - December 2, 2025
 * 
 * KNOWN LIMITATION:
 * fireEvent.click() causes Vitest 4.0.13 worker crashes under jsdom.
 * All click-based interaction tests (Next, Back, Preview, Confirm) are
 * deferred to Playwright E2E tests where DOM events run in a real browser.
 * 
 * This test file covers render-only verification:
 * - Schema handling (null/valid)
 * - Step prompts and labels
 * - Button presence (Cancel, Preview, Next)
 * - Input field rendering
 * - Step counter display
 * 
 * Component logic (validation, navigation, submission) is tested via E2E.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConversationalForm from '../ConversationalForm.jsx';

const createTestSchema = (steps = 1) => ({
  id: 'test-form',
  label: 'Test Form',
  steps: steps === 1 
    ? [
        {
          id: 'name-step',
          prompt: 'What is the record name?',
          required: true,
          fields: [{ name: 'name', label: 'Name' }],
          validate: (answers) => ({
            valid: Boolean(answers.name),
            error: 'Name is required.'
          })
        }
      ]
    : [
        {
          id: 'name-step',
          prompt: 'What is the record name?',
          required: true,
          fields: [{ name: 'name', label: 'Name' }],
          validate: (answers) => ({
            valid: Boolean(answers.name),
            error: 'Name is required.'
          })
        },
        {
          id: 'notes-step',
          prompt: 'Any extra details?',
          required: false,
          fields: [{ name: 'notes', label: 'Notes', type: 'textarea' }]
        }
      ],
  previewFields: steps === 1 ? ['name'] : ['name', 'notes'],
  buildPayload: vi.fn((answers) => answers)
});

describe('ConversationalForm', () => {
  it('returns null when schema is not provided', () => {
    const { container } = render(<ConversationalForm />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the first step prompt', () => {
    const schema = createTestSchema();
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );
    expect(screen.getByText('What is the record name?')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    const schema = createTestSchema();
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('renders Preview button on single-step form', () => {
    const schema = createTestSchema(1);
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );
    // With only 1 step, the button should say "Preview" not "Next"
    expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
  });

  it('renders Next button on multi-step form', () => {
    const schema = createTestSchema(2);
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );
    // With 2 steps, the first step should show "Next"
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
  });

  it('renders input field with correct label', () => {
    const schema = createTestSchema();
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
  });

  it('shows step counter', () => {
    const schema = createTestSchema(2);
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();
  });
});
