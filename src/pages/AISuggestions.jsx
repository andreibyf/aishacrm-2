import { useCallback, useEffect, useState } from 'react';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser.js';
import SuggestionQueue from '@/components/ai/SuggestionQueue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function getFocusedSuggestionFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get('suggestion') || null;
}

export default function AISuggestionsPage() {
  const { selectedTenantId } = useTenant();
  const { user } = useUser();

  const tenantId = selectedTenantId || user?.tenant_id || null;
  const [focusSuggestionId, setFocusSuggestionId] = useState(() => getFocusedSuggestionFromLocation());

  useEffect(() => {
    const handlePopState = () => {
      setFocusSuggestionId(getFocusedSuggestionFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleClearFocus = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('suggestion');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    window.history.pushState({}, '', nextUrl);
    setFocusSuggestionId(null);
  }, []);

  if (!tenantId) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold">Select a tenant to review AI suggestions</h2>
            <p className="mt-2 text-sm text-slate-400">
              Suggestions are tenant-scoped and need an active tenant context.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-slate-100">
      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader>
          <CardTitle>AI Suggestions</CardTitle>
          <p className="text-sm text-slate-400">
            Review pending AI-generated suggestions before they are applied.
          </p>
        </CardHeader>
      </Card>

      <SuggestionQueue
        tenantId={tenantId}
        focusSuggestionId={focusSuggestionId}
        onClearFocus={handleClearFocus}
      />
    </div>
  );
}