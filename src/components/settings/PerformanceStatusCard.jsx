/**
 * Performance Status Card - Unified Health Indicator
 * 
 * Color Coding Guide:
 * 🟢 GREEN (Excellent): System performing optimally
 * 🟡 YELLOW (Warning): Performance degrading, monitor closely  
 * 🔴 RED (Critical): Immediate attention required
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, AlertTriangle, Clock, Activity } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { THRESHOLDS, getHealthStatus, STATUS_CONFIG } from './performanceThresholds';

/**
 * Individual Metric Card
 */
export function MetricCard({ 
  title, 
  value, 
  unit = '', 
  thresholds, 
  isInverse = false,
  icon: Icon,
  subtitle,
  description
}) {
  const status = getHealthStatus(value, thresholds, isInverse);
  const config = STATUS_CONFIG[status];
  
  // Map icon names to actual components
  const iconMap = { CheckCircle, AlertTriangle, AlertCircle };
  const StatusIcon = iconMap[config.iconName];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={`bg-slate-800 border-slate-700 hover:${config.borderColor} transition-colors cursor-help`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">{title}</CardTitle>
              <Icon className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className={`text-2xl font-bold ${config.color}`}>
                  {typeof value === 'number' ? value.toFixed(0) : value}{unit}
                </div>
                <StatusIcon className={`h-5 w-5 ${config.color}`} />
              </div>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
              )}
              <div className="mt-2">
                <Badge variant="outline" className={config.badgeClass}>
                  {config.label}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-semibold">{config.description}</p>
            {description && <p className="text-xs">{description}</p>}
            <div className="text-xs space-y-1 pt-2 border-t border-slate-600">
              <p className="font-medium">Thresholds:</p>
              <p className="text-green-400">🟢 Excellent: {isInverse ? '≤' : '<'} {thresholds.excellent}{unit}</p>
              <p className="text-yellow-400">🟡 Warning: {isInverse ? '≤' : '<'} {thresholds.warning}{unit}</p>
              <p className="text-red-400">🔴 Critical: {isInverse ? '>' : '≥'} {thresholds.critical}{unit}</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Overall System Health Summary
 */
export function SystemHealthSummary({ metrics }) {
  const responseStatus = getHealthStatus(metrics.averageResponseTime, THRESHOLDS.responseTime);
  const errorStatus = getHealthStatus(metrics.errorRate, THRESHOLDS.errorRate, true);
  
  // Overall status is the worst of all statuses
  const overallStatus = 
    responseStatus === 'critical' || errorStatus === 'critical' ? 'critical' :
    responseStatus === 'warning' || errorStatus === 'warning' ? 'warning' :
    'excellent';
  
  const config = STATUS_CONFIG[overallStatus];
  
  // Map icon names to actual components
  const iconMap = { CheckCircle, AlertTriangle, AlertCircle };
  const StatusIcon = iconMap[config.iconName];

  return (
    <Card className={`${config.bgColor} ${config.borderColor} border-2`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <StatusIcon className={`h-6 w-6 ${config.color}`} />
          Overall System Health: {config.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-300">{config.description}</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Clock className={`h-4 w-4 ${STATUS_CONFIG[responseStatus].color}`} />
            <span className="text-sm text-slate-400">Response Time:</span>
            <Badge className={STATUS_CONFIG[responseStatus].badgeClass}>
              {STATUS_CONFIG[responseStatus].label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className={`h-4 w-4 ${STATUS_CONFIG[errorStatus].color}`} />
            <span className="text-sm text-slate-400">Error Rate:</span>
            <Badge className={STATUS_CONFIG[errorStatus].badgeClass}>
              {STATUS_CONFIG[errorStatus].label}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Legend/Guide Card
 */
export function PerformanceGuide() {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Performance Health Guide
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            🟢 Excellent (Green)
          </h4>
          <p className="text-xs text-slate-400">
            System is performing optimally. Response times are fast (&lt;300ms), 
            and error rates are minimal (&lt;1%). No action needed.
          </p>
        </div>
        
        <div>
          <h4 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            🟡 Warning (Yellow)
          </h4>
          <p className="text-xs text-slate-400">
            Performance is degrading. Response times are slowing (300-800ms) or 
            error rates increasing (1-5%). Monitor closely and investigate if sustained.
          </p>
        </div>
        
        <div>
          <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            🔴 Critical (Red)
          </h4>
          <p className="text-xs text-slate-400">
            Serious performance issues detected. Response times are slow (&gt;800ms) or 
            error rates high (&gt;5%). Immediate investigation and action required.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-700">
          <h4 className="text-sm font-semibold text-slate-300 mb-2">Key Metrics:</h4>
          <ul className="text-xs text-slate-400 space-y-1">
            <li><strong>Avg Response Time:</strong> How fast the API responds (lower is better)</li>
            <li><strong>Error Rate:</strong> Percentage of failed requests (lower is better)</li>
            <li><strong>Total API Calls:</strong> Volume indicator (shows system activity)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
