import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { useUser } from '@/components/shared/useUser.js';

const CareSettings = lazy(() => import('@/components/settings/CareSettings'));

export default function CareWorkflowsPage() {
  const { user } = useUser();
  const isSuperadmin = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin' || isSuperadmin;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        You don&apos;t have permission to view this page.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">CARE Workflows</h1>
        <p className="text-muted-foreground mt-1">
          Configure AI-driven customer care triggers and playbooks
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading CARE configuration...</span>
          </div>
        }
      >
        <CareSettings isSuperadmin={isSuperadmin} />
      </Suspense>
    </div>
  );
}
