import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function WidgetPickerModal(
  { open, onOpenChange, availableWidgets, currentPreferences, onSave },
) {
  const [internalPreferences, setInternalPreferences] = useState({});

  useEffect(() => {
    // Sync internal state when the modal opens or preferences change
    if (open) {
      setInternalPreferences(currentPreferences || {});
    }
  }, [open, currentPreferences]);

  const handleToggle = (widgetId, isChecked) => {
    setInternalPreferences((prev) => ({
      ...prev,
      [widgetId]: isChecked,
    }));
  };

  const handleSave = () => {
    // Ensure we save a complete map for all widgets,
    // falling back to each widget's defaultVisibility when unset
    const fullPreferences = availableWidgets.reduce((acc, widget) => {
      const value =
        typeof internalPreferences[widget.id] !== 'undefined'
          ? internalPreferences[widget.id]
          : (typeof widget.defaultVisibility !== 'undefined'
              ? widget.defaultVisibility
              : false);
      acc[widget.id] = value;
      return acc;
    }, {});
    onSave(fullPreferences);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
          <DialogDescription className="text-slate-400">
            Choose which widgets to display on your dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {availableWidgets.map((widget) => (
            <div
              key={widget.id}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50"
            >
              <Label
                htmlFor={`widget-toggle-${widget.id}`}
                className="font-medium"
              >
                {widget.name}
              </Label>
              <Switch
                id={`widget-toggle-${widget.id}`}
                checked={(typeof internalPreferences[widget.id] !== 'undefined'
                  ? internalPreferences[widget.id]
                  : (typeof widget.defaultVisibility !== 'undefined'
                    ? widget.defaultVisibility
                    : false))}
                onCheckedChange={(isChecked) => handleToggle(widget.id, isChecked)}
                className="data-[state=checked]:bg-blue-500"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
