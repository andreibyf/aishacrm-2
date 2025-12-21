// Testing helpers for UI interactions that require React act wrapping
// Focus: Radix UI Select and portal-based components used in forms

import { act } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Open a Radix Select trigger (shadcn/ui Select) safely
export async function openSelectByLabel(labelText) {
  const trigger = screen.getByLabelText(labelText);
  await act(async () => {
    await userEvent.click(trigger);
  });
}

// Choose an option from the open Select content by visible text
export async function chooseSelectOption(optionText) {
  const option = await screen.findByRole('option', { name: optionText });
  await act(async () => {
    await userEvent.click(option);
  });
}

// Convenience: open then select in one call
export async function selectByLabel(labelText, optionText) {
  await openSelectByLabel(labelText);
  await chooseSelectOption(optionText);
}

// Wait for a UI change after select interaction
export async function waitForText(text) {
  await waitFor(() => {
    const element = screen.getByText(text);
    return element !== null;
  });
}

// Generic act wrapper for any async UI interaction
export async function withAct(fn) {
  await act(async () => {
    await fn();
  });
}
