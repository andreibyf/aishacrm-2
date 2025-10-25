import { Card, CardContent } from "@/components/ui/card";
import StatusHelper from "../shared/StatusHelper";

export default function ContactStats({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Total Contacts</span>
            <StatusHelper statusKey="total_all" />
          </div>
          <p className="text-4xl font-bold text-slate-100">{stats.total.toLocaleString('en-US')}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Active</span>
            <StatusHelper statusKey="contact_active" />
          </div>
          <p className="text-4xl font-bold text-slate-100">{stats.active.toLocaleString('en-US')}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Prospects</span>
            <StatusHelper statusKey="contact_prospect" />
          </div>
          <p className="text-4xl font-bold text-slate-100">{stats.prospect.toLocaleString('en-US')}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Customers</span>
            <StatusHelper statusKey="contact_customer" />
          </div>
          <p className="text-4xl font-bold text-slate-100">{stats.customer.toLocaleString('en-US')}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Inactive</span>
            <StatusHelper statusKey="contact_inactive" />
          </div>
          <p className="text-4xl font-bold text-slate-100">{stats.inactive.toLocaleString('en-US')}</p>
        </CardContent>
      </Card>
    </div>
  );
}