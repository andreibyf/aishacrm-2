import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { diagnoseActivityVisibility } from '@/api/functions';
import { toast } from 'sonner';

export default function ActivityVisibilityDebug() {
  const [activityId, setActivityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleDiagnose = async () => {
    if (!activityId.trim()) {
      toast.error('Please enter an Activity ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await diagnoseActivityVisibility({ activity_id: activityId.trim() });
      setResult(response.data || response);
    } catch (error) {
      console.error('Diagnosis failed:', error);
      toast.error('Failed to diagnose: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            Activity Visibility Diagnostic
          </CardTitle>
          <CardDescription className="text-slate-400">
            Diagnose why an Activity is not visible to a user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-200">Activity ID</Label>
            <Input
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              placeholder="Enter Activity ID"
              className="bg-slate-700 border-slate-600 text-slate-200"
            />
          </div>

          <Button
            onClick={handleDiagnose}
            disabled={loading || !activityId.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Diagnosing...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Run Diagnosis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <Alert className={result.user_can_see ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
            {result.user_can_see ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-700" />
                <AlertDescription className="text-green-800">
                  <strong>Activity is visible</strong> - User can see this activity
                </AlertDescription>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-700" />
                <AlertDescription className="text-red-800">
                  <strong>Activity is NOT visible</strong> - User cannot see this activity
                </AlertDescription>
              </>
            )}
          </Alert>

          {/* Current User Info */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">Current User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Email</p>
                  <p className="text-slate-200">{result.current_user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Role</p>
                  <p className="text-slate-200">{result.current_user.role}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Employee Role</p>
                  <p className="text-slate-200">{result.current_user.employee_role || 'None'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Tenant ID</p>
                  <p className="text-slate-200">{result.current_user.tenant_id || 'None'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Record */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">Activity Record</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">ID</p>
                  <p className="text-slate-200 font-mono text-xs">{result.activity_record.id}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Subject</p>
                  <p className="text-slate-200">{result.activity_record.subject}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Type</p>
                  <p className="text-slate-200">{result.activity_record.type}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Status</p>
                  <p className="text-slate-200">{result.activity_record.status}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Tenant ID</p>
                  <p className="text-slate-200 font-mono text-xs">{result.activity_record.tenant_id || 'None'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Created By</p>
                  <p className="text-slate-200">{result.activity_record.created_by}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Assigned To</p>
                  <p className="text-slate-200">{result.activity_record.assigned_to || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Test Data</p>
                  <p className="text-slate-200">{result.activity_record.is_test_data ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RLS Evaluation */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">RLS Evaluation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(result.rls_evaluation).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                    <span className="text-sm text-slate-300">{key.replace(/_/g, ' ')}</span>
                    <span className={`text-sm font-medium ${value ? 'text-green-400' : 'text-red-400'}`}>
                      {value ? '✓' : '✗'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tenant Info */}
          {result.tenant_info && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-100">Tenant Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Tenant ID</p>
                    <p className="text-slate-200 font-mono text-xs">{result.tenant_info.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Tenant Name</p>
                    <p className="text-slate-200">{result.tenant_info.name}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Creator Info */}
          {result.creator_info && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-100">Creator Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Email</p>
                    <p className="text-slate-200">{result.creator_info.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Full Name</p>
                    <p className="text-slate-200">{result.creator_info.full_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Role</p>
                    <p className="text-slate-200">{result.creator_info.role}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Tenant ID</p>
                    <p className="text-slate-200 font-mono text-xs">{result.creator_info.tenant_id || 'None'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Diagnosis Result */}
          {!result.user_can_see && result.should_see_by_rls && (
            <Alert className="bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-700" />
              <AlertDescription className="text-red-800">
                <strong>RLS Policy Issue Detected!</strong><br/>
                According to RLS rules, user SHOULD see this activity, but they cannot.
                This indicates a problem with the RLS policy implementation or caching.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}