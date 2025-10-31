import { useState } from "react";
import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Building,
  Edit3,
  RotateCcw,
  Save,
  Star,
  User,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { Account, Contact, Lead, Opportunity } from "@/api/entities";

const entityIcons = {
  Contact: <User className="w-5 h-5 text-blue-400" />,
  Lead: <Star className="w-5 h-5 text-yellow-400" />,
  Account: <Building className="w-5 h-5 text-green-400" />,
  Opportunity: <Briefcase className="w-5 h-5 text-purple-400" />,
};

const DetailRow = ({ label, value, field, editMode, onValueChange }) => {
  if (!value && !editMode) return null;

  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-700/50">
      <dt className="text-sm font-medium text-slate-400">{label}</dt>
      <dd className="col-span-2">
        {editMode
          ? (
            <Input
              value={value || ""}
              onChange={(e) => onValueChange(field, e.target.value)}
              className="h-8 bg-slate-700 border-slate-600 text-slate-200 text-sm"
            />
          )
          : <span className="text-sm text-slate-200">{value}</span>}
      </dd>
    </div>
  );
};

export default function GlobalDetailViewer({ recordInfo, open, onClose }) {
  const [editMode, setEditMode] = useState(false);
  const [editedRecord, setEditedRecord] = useState({});
  const [saving, setSaving] = useState(false);

  if (!open || !recordInfo) return null;

  const { record, entityType } = recordInfo;

  const title = record.name ||
    `${record.first_name || ""} ${record.last_name || ""}`.trim();
  const Icon = entityIcons[entityType] || <User className="w-5 h-5" />;

  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), "PPp");
    } catch {
      return dateString;
    }
  };

  const handleEdit = () => {
    setEditMode(true);
    setEditedRecord({ ...record });
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditedRecord({});
  };

  const handleValueChange = (field, value) => {
    setEditedRecord((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const Model = entityType === "Contact"
        ? Contact
        : entityType === "Lead"
        ? Lead
        : entityType === "Account"
        ? Account
        : Opportunity;

      // Only send changed fields
      const changes = {};
      Object.keys(editedRecord).forEach((key) => {
        if (
          editedRecord[key] !== record[key] && !key.startsWith("_") &&
          key !== "id" && key !== "created_date" && key !== "updated_date"
        ) {
          changes[key] = editedRecord[key];
        }
      });

      if (Object.keys(changes).length > 0) {
        await Model.update(record.id, changes);
        // Update the record in the viewer
        Object.assign(record, changes);
        console.log(`Updated ${entityType}:`, changes);
      }

      setEditMode(false);
    } catch (error) {
      console.error("Failed to update record:", error);
      alert(`Failed to update record: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const currentRecord = editMode ? editedRecord : record;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-slate-800 shadow-2xl border-l border-slate-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-700">
              {Icon}
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">{title}</CardTitle>
              <Badge
                variant="secondary"
                className="mt-1 bg-slate-900 border-slate-700 text-slate-300"
              >
                {entityType}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editMode
              ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEdit}
                  className="text-slate-400 hover:text-slate-100"
                >
                  <Edit3 className="w-4 h-4" />
                </Button>
              )
              : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="text-slate-400 hover:text-slate-100"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="text-green-400 hover:text-green-300"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                </>
              )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 overflow-y-auto flex-1">
          <dl className="space-y-1">
            <DetailRow
              label="First Name"
              value={currentRecord.first_name}
              field="first_name"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Last Name"
              value={currentRecord.last_name}
              field="last_name"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Name"
              value={currentRecord.name}
              field="name"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Email"
              value={currentRecord.email}
              field="email"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Phone"
              value={currentRecord.phone}
              field="phone"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Company"
              value={currentRecord.company}
              field="company"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Job Title"
              value={currentRecord.job_title}
              field="job_title"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Status"
              value={currentRecord.status}
              field="status"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Source"
              value={currentRecord.source}
              field="source"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Score"
              value={currentRecord.score}
              field="score"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            <DetailRow
              label="Amount"
              value={currentRecord.amount
                ? `$${Number(currentRecord.amount).toLocaleString()}`
                : currentRecord.amount}
              field="amount"
              editMode={editMode}
              onValueChange={handleValueChange}
            />
            {currentRecord.close_date && (
              <DetailRow
                label="Close Date"
                value={formatDate(currentRecord.close_date)}
              />
            )}
            {currentRecord.created_date && (
              <DetailRow
                label="Created"
                value={formatDate(currentRecord.created_date)}
              />
            )}
            {currentRecord.updated_date && (
              <DetailRow
                label="Updated"
                value={formatDate(currentRecord.updated_date)}
              />
            )}
          </dl>
        </CardContent>
      </div>
    </div>
  );
}
