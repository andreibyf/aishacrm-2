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
  steps:
    steps === 1
      ? [
          {
            id: 'name-step',
            prompt: 'What is the record name?',
            required: true,
            fields: [{ name: 'name', label: 'Name' }],
            validate: (answers) => ({
              valid: Boolean(answers.name),
              error: 'Name is required.',
            }),
          },
        ]
      : [
          {
            id: 'name-step',
            prompt: 'What is the record name?',
            required: true,
            fields: [{ name: 'name', label: 'Name' }],
            validate: (answers) => ({
              valid: Boolean(answers.name),
              error: 'Name is required.',
            }),
          },
          {
            id: 'notes-step',
            prompt: 'Any extra details?',
            required: false,
            fields: [{ name: 'notes', label: 'Notes', type: 'textarea' }],
          },
        ],
  previewFields: steps === 1 ? ['name'] : ['name', 'notes'],
  buildPayload: vi.fn((answers) => answers),
});

describe('[AISHA_CHAT] ConversationalForm', () => {
  it('returns null when schema is not provided', () => {
    const { container } = render(<ConversationalForm />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the first step prompt', () => {
    const schema = createTestSchema();
    render(<ConversationalForm schema={schema} tenantId="tenant-123" userId="user-42" />);
    expect(screen.getByText('What is the record name?')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    const schema = createTestSchema();
    render(<ConversationalForm schema={schema} tenantId="tenant-123" userId="user-42" />);
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('renders Preview button on single-step form', () => {
    const schema = createTestSchema(1);
    render(<ConversationalForm schema={schema} tenantId="tenant-123" userId="user-42" />);
    // With only 1 step, the button should say "Preview" not "Next"
    expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
  });

  it('renders Next button on multi-step form', () => {
    const schema = createTestSchema(2);
    render(<ConversationalForm schema={schema} tenantId="tenant-123" userId="user-42" />);
    // With 2 steps, the first step should show "Next"
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
  });

  it('renders input field with correct label', () => {
    const schema = createTestSchema();
    render(<ConversationalForm schema={schema} tenantId="tenant-123" userId="user-42" />);
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
  });

  it('shows step counter', () => {
    const schema = createTestSchema(2);
    render(<ConversationalForm schema={schema} tenantId="tenant-123" userId="user-42" />);
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();
  });

  // ── field-level required asterisk ────────────────────────────────────────

  it('renders * only for fields with required:true, not for required:false fields', () => {
    const schema = {
      id: 'mixed-required-form',
      label: 'Mixed Required Form',
      steps: [
        {
          id: 'mixed-step',
          prompt: 'Fill in the details.',
          required: true,
          fields: [
            { name: 'req_field', label: 'Required Field', required: true },
            { name: 'opt_field', label: 'Optional Field', required: false },
          ],
          validate: (answers) => ({
            valid: Boolean(answers.req_field),
            error: 'Required field missing.',
          }),
        },
      ],
      previewFields: ['req_field'],
      buildPayload: vi.fn((a) => a),
    };

    const { container } = render(
      <ConversationalForm schema={schema} tenantId="tenant-123" userId="user-42" />,
    );

    const labels = container.querySelectorAll('label');
    const reqLabel = [...labels].find((l) => l.textContent.includes('Required Field'));
    const optLabel = [...labels].find((l) => l.textContent.includes('Optional Field'));

    // Required field label must contain an asterisk element
    expect(reqLabel.querySelector('.text-rose-500')).not.toBeNull();
    // Optional field label must NOT contain an asterisk element
    expect(optLabel.querySelector('.text-rose-500')).toBeNull();
  });

  it('falls back to step-level required when a field omits its own required flag', () => {
    // Step is required:true; fields don't carry per-field required metadata.
    // Asterisk should still render — every field gates Next via the step's
    // validate function, so users must see they're required.
    const schema = {
      id: 'step-required-form',
      label: 'Step Required Form',
      steps: [
        {
          id: 'lead-name',
          prompt: "What's the lead's name?",
          required: true,
          fields: [
            { name: 'first_name', label: 'First name' },
            { name: 'last_name', label: 'Last name' },
          ],
          validate: (a) => ({
            valid: Boolean(a.first_name && a.last_name),
            error: 'First and last name are required.',
          }),
        },
      ],
      previewFields: ['first_name', 'last_name'],
      buildPayload: vi.fn((a) => a),
    };

    const { container } = render(
      <ConversationalForm schema={schema} tenantId="t" userId="u" />,
    );

    const labels = container.querySelectorAll('label');
    const firstLabel = [...labels].find((l) => l.textContent.includes('First name'));
    const lastLabel = [...labels].find((l) => l.textContent.includes('Last name'));

    expect(firstLabel.querySelector('.text-rose-500')).not.toBeNull();
    expect(lastLabel.querySelector('.text-rose-500')).not.toBeNull();
  });

  it('does not render * when step is not required and field omits its flag', () => {
    const schema = {
      id: 'optional-step-form',
      label: 'Optional Step Form',
      steps: [
        {
          id: 'extras',
          prompt: 'Any extras?',
          required: false,
          fields: [{ name: 'notes', label: 'Notes' }],
        },
      ],
      previewFields: ['notes'],
      buildPayload: vi.fn((a) => a),
    };

    const { container } = render(
      <ConversationalForm schema={schema} tenantId="t" userId="u" />,
    );

    const labels = container.querySelectorAll('label');
    const notesLabel = [...labels].find((l) => l.textContent.includes('Notes'));
    expect(notesLabel.querySelector('.text-rose-500')).toBeNull();
  });

  it('explicit field-level required:false overrides a required step', () => {
    // DBA/Trade-name pattern: step is required:true, but this specific
    // field is optional and must not display an asterisk.
    const schema = {
      id: 'override-required',
      label: 'Override Required',
      steps: [
        {
          id: 'company',
          prompt: 'Company.',
          required: true,
          fields: [
            { name: 'company_name', label: 'Company name', required: true },
            { name: 'dba_name', label: 'DBA / Trade name', required: false },
          ],
        },
      ],
      previewFields: ['company_name'],
      buildPayload: vi.fn((a) => a),
    };

    const { container } = render(
      <ConversationalForm schema={schema} tenantId="t" userId="u" />,
    );

    const labels = container.querySelectorAll('label');
    const dbaLabel = [...labels].find((l) => l.textContent.includes('DBA'));
    const companyLabel = [...labels].find((l) => l.textContent.includes('Company name'));

    expect(companyLabel.querySelector('.text-rose-500')).not.toBeNull();
    expect(dbaLabel.querySelector('.text-rose-500')).toBeNull();
  });
});
