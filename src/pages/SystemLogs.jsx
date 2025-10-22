import React from 'react';
import SystemLogsViewer from '../components/settings/SystemLogsViewer';

export default function SystemLogsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-100">System Logs</h1>
        <p className="text-slate-400 mt-2">
          View and manage application logs for debugging and monitoring
        </p>
      </div>
      <SystemLogsViewer />
    </div>
  );
}