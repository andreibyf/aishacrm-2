/**
 * Tests for ConversationalForm input interaction
 * Focused test to verify that users can type into form fields
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConversationalForm from '../ConversationalForm.jsx';

const createTestSchema = () => ({
  id: 'test-form',
  label: 'Test Form',
  steps: [
    {
      id: 'name-step',
      prompt: 'What is the record name?',
      required: true,
      fields: [
        { name: 'first_name', label: 'First name', placeholder: 'Enter first name' },
        { name: 'last_name', label: 'Last name', placeholder: 'Enter last name' }
      ],
      validate: (answers) => ({
        valid: Boolean(answers.first_name && answers.last_name),
        error: 'Name is required.'
      })
    }
  ],
  previewFields: ['first_name', 'last_name'],
  buildPayload: vi.fn((answers) => answers)
});

describe('ConversationalForm Input Interaction', () => {
  it('renders input fields that are not disabled or readonly', () => {
    const schema = createTestSchema();
    
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );

    const firstNameInput = screen.getByPlaceholderText('Enter first name');
    
    // Verify input is not disabled or readonly
    expect(firstNameInput).not.toBeDisabled();
    expect(firstNameInput).not.toHaveAttribute('readonly');
    expect(firstNameInput).not.toHaveAttribute('readOnly');
  });

  it('updates input value when onChange is triggered', () => {
    const schema = createTestSchema();
    
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );

    const firstNameInput = screen.getByPlaceholderText('Enter first name');
    
    // Simulate change event
    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });
    
    // Verify the value was updated
    expect(firstNameInput).toHaveValue('Jane');
  });

  it('maintains separate values for multiple input fields', () => {
    const schema = createTestSchema();
    
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );

    const firstNameInput = screen.getByPlaceholderText('Enter first name');
    const lastNameInput = screen.getByPlaceholderText('Enter last name');
    
    // Type into both inputs using fireEvent
    fireEvent.change(firstNameInput, { target: { value: 'John' } });
    fireEvent.change(lastNameInput, { target: { value: 'Doe' } });
    
    // Verify both values are set correctly
    expect(firstNameInput).toHaveValue('John');
    expect(lastNameInput).toHaveValue('Doe');
  });

  it('allows focus on input fields', () => {
    const schema = createTestSchema();
    
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );

    const firstNameInput = screen.getByPlaceholderText('Enter first name');
    
    // Focus the input
    firstNameInput.focus();
    
    // Verify focus
    expect(firstNameInput).toHaveFocus();
  });

  it('has correct input attributes for accessibility', () => {
    const schema = createTestSchema();
    
    render(
      <ConversationalForm
        schema={schema}
        tenantId="tenant-123"
        userId="user-42"
      />
    );

    const firstNameInput = screen.getByPlaceholderText('Enter first name');
    
    // Verify essential attributes
    expect(firstNameInput).toHaveAttribute('type', 'text');
    expect(firstNameInput).toHaveAttribute('id', 'conversational-first_name');
    expect(firstNameInput).toHaveAttribute('placeholder', 'Enter first name');
    expect(firstNameInput).toHaveAttribute('value', '');
  });
});
