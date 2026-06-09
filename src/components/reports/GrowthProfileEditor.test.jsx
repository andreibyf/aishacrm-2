/**
 * Component tests for src/components/reports/GrowthProfileEditor.jsx
 *
 * Covers: loading the profile when opened, editing a field, and Save calling
 * saveProfile with the edited patch.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/growth', () => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
}));

import GrowthProfileEditor from './GrowthProfileEditor';
import { getProfile, saveProfile } from '@/api/growth';

const tenant = { id: 'tenant-123', name: 'Acme Corp' };

const sampleProfile = {
  service_catalog: [{ name: 'Consulting', slug: 'consulting', keywords: ['advisory'] }],
  target_regions: [{ type: 'city', name: 'Austin' }],
  tracked_keywords: ['crm'],
  competitors: [{ name: 'Globex', website: 'globex.com' }],
  settings: {},
};

describe('[CRM] GrowthProfileEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProfile.mockResolvedValue(sampleProfile);
    saveProfile.mockResolvedValue(sampleProfile);
  });

  test('loads the profile when opened and pre-fills fields', async () => {
    render(<GrowthProfileEditor tenant={tenant} open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(getProfile).toHaveBeenCalledWith('tenant-123');
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue('Consulting')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Austin')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Globex')).toBeInTheDocument();
  });

  test('does not load when closed', () => {
    render(<GrowthProfileEditor tenant={tenant} open={false} onClose={() => {}} />);
    expect(getProfile).not.toHaveBeenCalled();
  });

  test('editing a field and Save calls saveProfile with the patch', async () => {
    const onClose = vi.fn();
    render(<GrowthProfileEditor tenant={tenant} open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Consulting')).toBeInTheDocument();
    });

    // Edit the first service catalog name field.
    const serviceInput = screen.getByDisplayValue('Consulting');
    fireEvent.change(serviceInput, { target: { value: 'Managed Services' } });

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(saveProfile).toHaveBeenCalledTimes(1);
    });
    const [calledTenant, patch] = saveProfile.mock.calls[0];
    expect(calledTenant).toBe('tenant-123');
    expect(patch.service_catalog).toEqual([{ name: 'Managed Services' }]);
    expect(patch.target_regions).toEqual([{ type: 'city', name: 'Austin' }]);
    expect(patch.competitors).toEqual([{ name: 'Globex', website: 'globex.com' }]);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
