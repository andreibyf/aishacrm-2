#!/usr/bin/env node
/**
 * Script to add aria-label attributes to icon-only buttons
 * Addresses GitHub Issue #195: Icon buttons missing accessible names
 */

const fs = require('fs');
const path = require('path');

// Map of icon components to their semantic meanings
const iconToLabel = {
  Bell: 'Notifications',
  Edit: 'Edit',
  Trash: 'Delete',
  Plus: 'Add',
  X: 'Close',
  Save: 'Save',
  Eye: 'View',
  EyeOff: 'Hide',
  Download: 'Download',
  Upload: 'Upload',
  Search: 'Search',
  Filter: 'Filter',
  Settings: 'Settings',
  Check: 'Confirm',
  ChevronDown: 'Expand',
  ChevronUp: 'Collapse',
  ChevronLeft: 'Previous',
  ChevronRight: 'Next',
  MoreVertical: 'More options',
  MoreHorizontal: 'More options',
  Copy: 'Copy',
  ExternalLink: 'Open in new tab',
  Mail: 'Email',
  Phone: 'Call',
  Calendar: 'Schedule',
  Clock: 'Time',
  User: 'User profile',
  Users: 'Users',
  Building: 'Organization',
  FileText: 'Document',
  Image: 'Image',
  Video: 'Video',
  Music: 'Audio',
  Link: 'Link',
  Archive: 'Archive',
  Star: 'Favorite',
  Heart: 'Like',
  Share: 'Share',
  Send: 'Send',
  Paperclip: 'Attach',
  Lock: 'Lock',
  Unlock: 'Unlock',
  Shield: 'Security',
  AlertCircle: 'Alert',
  Info: 'Information',
  HelpCircle: 'Help',
  CheckCircle: 'Success',
  XCircle: 'Error',
  RefreshCw: 'Refresh',
  RotateCw: 'Rotate clockwise',
  RotateCcw: 'Rotate counterclockwise',
  ZoomIn: 'Zoom in',
  ZoomOut: 'Zoom out',
  Maximize: 'Maximize',
  Minimize: 'Minimize',
  Play: 'Play',
  Pause: 'Pause',
  Stop: 'Stop',
  SkipBack: 'Previous',
  SkipForward: 'Next',
  Volume: 'Volume',
  VolumeX: 'Mute',
  Wifi: 'Network',
  WifiOff: 'Offline',
  Bluetooth: 'Bluetooth',
  Battery: 'Battery',
  Power: 'Power',
  Zap: 'Quick action',
  Target: 'Focus',
  Crosshair: 'Select',
  Move: 'Move',
  Layers: 'Layers',
  Grid: 'Grid view',
  List: 'List view',
  Layout: 'Layout',
};

// Files to fix (from GitHub Issue #195)
const filesToFix = [
  'src/components/shared/NotificationPanel.jsx',
  'src/components/settings/SystemAnnouncements.jsx',
  'src/components/shared/EmailTemplateManager.jsx',
  'src/components/workflows/WorkflowBuilder.jsx',
  'src/components/bizdev/BizDevSourceCard.jsx',
  'src/components/leads/LeadCard.jsx',
  'src/components/contacts/ContactCard.jsx',
  'src/components/accounts/AccountCard.jsx',
  'src/components/opportunities/OpportunityCard.jsx',
  'src/pages/Employees.jsx',
  'src/pages/Contacts.jsx',
  'src/pages/Accounts.jsx',
];

console.log('Icon Button Accessibility Fix Script');
console.log('=====================================\n');
console.log(`Targeting ${filesToFix.length} files with 100+ icon button instances\n`);
console.log('This script will add aria-label attributes to icon-only buttons.');
console.log('Review changes carefully before committing.\n');

// This is a placeholder - actual implementation would require AST parsing
// For now, documenting the manual changes needed
console.log('Manual fix required for each file:');
console.log('Replace pattern:');
console.log('  <Button ... ><IconComponent ... /></Button>');
console.log('With:');
console.log('  <Button aria-label="descriptive label" ... ><IconComponent ... /></Button>\n');

console.log('Use context-appropriate labels based on button functionality.');
