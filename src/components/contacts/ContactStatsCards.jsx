import StatusHelper from '../shared/StatusHelper';

const formatNumber = (num) => num.toLocaleString('en-US');

/**
 * ContactStatsCards - Displays status-based stats cards for contacts
 */
export default function ContactStatsCards({
  totalStats,
  statusFilter,
  onStatusFilterClick,
  contactsLabel,
  isCardVisible,
  getCardLabel,
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
      <div
        onClick={() => onStatusFilterClick('all')}
        className={`bg-slate-800 border-slate-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
          statusFilter === 'all' ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-slate-400">Total {contactsLabel}</p>
          <StatusHelper statusKey="total_all" />
        </div>
        <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.total)}</p>
      </div>

      {isCardVisible('contact_active') && (
        <div
          onClick={() => onStatusFilterClick('active')}
          className={`bg-green-900/20 border-green-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
            statusFilter === 'active' ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-400">{getCardLabel('contact_active') || 'Active'}</p>
            <StatusHelper statusKey="contact_active" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.active)}</p>
        </div>
      )}

      {isCardVisible('contact_prospect') && (
        <div
          onClick={() => onStatusFilterClick('prospect')}
          className={`bg-blue-900/20 border-blue-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
            statusFilter === 'prospect' ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-400">{getCardLabel('contact_prospect') || 'Prospects'}</p>
            <StatusHelper statusKey="contact_prospect" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.prospect)}</p>
        </div>
      )}

      {isCardVisible('contact_customer') && (
        <div
          onClick={() => onStatusFilterClick('customer')}
          className={`bg-emerald-900/20 border-emerald-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
            statusFilter === 'customer' ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-400">{getCardLabel('contact_customer') || 'Customers'}</p>
            <StatusHelper statusKey="contact_customer" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.customer)}</p>
        </div>
      )}

      {isCardVisible('contact_inactive') && (
        <div
          onClick={() => onStatusFilterClick('inactive')}
          className={`bg-slate-900/20 border-slate-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
            statusFilter === 'inactive' ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-400">{getCardLabel('contact_inactive') || 'Inactive'}</p>
            <StatusHelper statusKey="contact_inactive" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.inactive)}</p>
        </div>
      )}
    </div>
  );
}
