import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User } from "@/api/entities";
import { Globe, Loader2, Save } from "lucide-react";

const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export default function TimezoneSettings({ user, onUpdate }) {
  const [settings, setSettings] = useState({
    timezone: "America/New_York",
    date_format: "MM/dd/yyyy",
    time_format: "12h",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      setSettings({
        timezone: user.timezone || "America/New_York",
        date_format: user.date_format || "MM/dd/yyyy",
        time_format: user.time_format || "12h",
      });
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await User.updateMyUserData(settings);
      setMessage("Settings saved successfully!");
      setTimeout(() => setMessage(""), 3000);
      if (onUpdate) onUpdate();
    } catch (error) {
      setMessage("Failed to save settings");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <Alert className="bg-blue-900/30 border-blue-700/50">
          <AlertDescription className="text-blue-300">
            {message}
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Globe className="w-5 h-5 text-blue-400" />
            Regional Settings
          </CardTitle>
          <CardDescription className="text-slate-400">
            Configure your timezone and date/time display preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-200">Timezone</Label>
            <Select
              value={settings.timezone}
              onValueChange={(value) =>
                setSettings({ ...settings, timezone: value })}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem
                    key={tz.value}
                    value={tz.value}
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Date Format</Label>
            <Select
              value={settings.date_format}
              onValueChange={(value) =>
                setSettings({ ...settings, date_format: value })}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem
                  value="MM/dd/yyyy"
                  className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                >
                  MM/dd/yyyy (US)
                </SelectItem>
                <SelectItem
                  value="dd/MM/yyyy"
                  className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                >
                  dd/MM/yyyy (UK/EU)
                </SelectItem>
                <SelectItem
                  value="yyyy-MM-dd"
                  className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                >
                  yyyy-MM-dd (ISO)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Time Format</Label>
            <Select
              value={settings.time_format}
              onValueChange={(value) =>
                setSettings({ ...settings, time_format: value })}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select time format" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem
                  value="12h"
                  className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                >
                  12-hour (1:30 PM)
                </SelectItem>
                <SelectItem
                  value="24h"
                  className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                >
                  24-hour (13:30)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Save className="w-4 h-4 mr-2" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
