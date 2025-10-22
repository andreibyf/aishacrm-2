import React from 'react';
import TenantDataChecker from '../components/shared/TenantDataChecker';

export default function TenantDataDebug() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhook Debugging</h1>
        <p className="text-gray-600">Debug why webhook data isn't appearing in the platform</p>
      </div>
      
      <TenantDataChecker />
    </div>
  );
}