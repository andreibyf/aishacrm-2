import React from 'react';
import FunnelChart3D from '@/components/dashboard/FunnelChart3D';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';

export default function FunnelDemo() {
  // Get customized entity labels
  const { plural: sourcesLabel } = useEntityLabel('bizdev_sources');
  const { plural: leadsLabel } = useEntityLabel('leads');
  const { plural: contactsLabel } = useEntityLabel('contacts');
  const { plural: accountsLabel } = useEntityLabel('accounts');

  // Sample data using entity labels
  const funnelData = [
    { label: sourcesLabel || 'Sources', count: 2500 },
    { label: leadsLabel || 'Leads', count: 1200 },
    { label: contactsLabel || 'Contacts', count: 800 },
    { label: accountsLabel || 'Accounts', count: 300 },
  ];

  const totalRecords = funnelData.reduce((s, d) => s + d.count, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          Sales Funnel Overview
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Pipeline conversion • Total: {totalRecords.toLocaleString()} records
        </p>

        {/* 3D Circular Cone Funnel - AISHA Brand Colors */}
        <div className="bg-gray-800/40 backdrop-blur rounded-xl p-6 border border-gray-700/40">
          <div className="flex justify-center">
            <FunnelChart3D 
              data={funnelData} 
              width={500} 
              height={420} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
