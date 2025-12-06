
import { format } from 'date-fns';

// On Save (convert local time + offset -> UTC) 
export function localToUtc(dateString, timeString, offsetMinutes) {
  // Validate inputs
  if (!dateString || !timeString || typeof dateString !== 'string' || typeof timeString !== 'string') {
    throw new Error('dateString and timeString are required and must be strings');
  }

  // Calculate offset string from offsetMinutes
  // getTimezoneOffset returns positive for zones behind UTC (e.g., America), so the sign in the ISO string is negative.
  // Our offsetMinutes are defined such that positive means 'behind UTC' (e.g., EDT is +240 minutes from UTC),
  // so for ISO format, we need to negate it to get the UTC offset.
  // For example, if offsetMinutes is 240 (EDT, 4 hours behind UTC), the ISO offset should be -04:00.
  // So, we use a negative sign if offsetMinutes is positive, and a positive sign if offsetMinutes is negative (e.g., for times ahead of UTC).
  const sign = offsetMinutes > 0 ? '-' : '+';
  const absOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absOffset / 60).toString().padStart(2, '0');
  const minutes = (absOffset % 60).toString().padStart(2, '0');
  const offsetString = `${sign}${hours}:${minutes}`;

  // Construct a full ISO 8601 string with the correct offset
  const isoStringWithOffset = `${dateString}T${timeString}:00${offsetString}`;
  
  // Let the Date object parse this unambiguous string
  const finalDate = new Date(isoStringWithOffset);

  // Check for invalid date
  if (isNaN(finalDate.getTime())) {
    throw new Error(`Failed to parse constructed ISO string: ${isoStringWithOffset}`);
  }
  
  // No console.log here, as it's not in the new implementation outline.
  // The original console.log:
  // console.log('localToUtc conversion:', {
  //   input: `${dateString} ${timeString}`,
  //   offsetMinutes,
  //   timezone: offsetMinutes === 240 ? 'EDT' : offsetMinutes === 300 ? 'EST' : 'Other',
  //   local_datetime: localDate.toISOString(),
  //   utc_datetime: utcDate.toISOString(),
  //   localTime: `${hour}:${minute.toString().padStart(2, '0')}`,
  //   utcTime: utcDate.toISOString().substr(11, 5)
  // });
  
  // Return the standard UTC ISO string (e.g., "2025-09-24T17:30:00.000Z")
  return finalDate.toISOString();
}

// On Display (convert stored UTC time -> user local) 
export function utcToLocal(utcString, offsetMinutes) {
  // Validate inputs
  if (!utcString) {
    throw new Error('utcString is required');
  }
  
  const utcDate = new Date(utcString);
  
  // Check if date is valid
  if (isNaN(utcDate.getTime())) {
    throw new Error(`Invalid UTC string: ${utcString}`);
  }
  
  // Convert UTC to local by subtracting the offset
  const localTimeValue = utcDate.getTime() - (offsetMinutes * 60 * 1000);
  const tempDate = new Date(localTimeValue);
  
  // Create a new date object using UTC methods to prevent the browser from re-applying its own timezone offset.
  // This effectively "tricks" the formatting library into displaying the correct local time.
  const displayDate = new Date(
    tempDate.getUTCFullYear(),
    tempDate.getUTCMonth(),
    tempDate.getUTCDate(),
    tempDate.getUTCHours(),
    tempDate.getUTCMinutes(),
    tempDate.getUTCSeconds()
  );

  return displayDate;
}

// Get timezone offset in minutes for a given timezone
export function getCurrentTimezoneOffset(timezone) {
  // Define timezone mappings with DST handling
  const timezoneMap = {
    'America/New_York': () => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const isDST = now.getTimezoneOffset() < stdOffset;
      return isDST ? 240 : 300; // EDT: 240, EST: 300
    },
    'America/Chicago': () => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const isDST = now.getTimezoneOffset() < stdOffset;
      return isDST ? 300 : 360; // CDT: 300, CST: 360
    },
    'America/Denver': () => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const isDST = now.getTimezoneOffset() < stdOffset;
      return isDST ? 360 : 420; // MDT: 360, MST: 420
    },
    'America/Los_Angeles': () => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const isDST = now.getTimezoneOffset() < stdOffset;
      return isDST ? 420 : 480; // PDT: 420, PST: 480
    },
    'UTC': () => 0,
    'Europe/London': () => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const isDST = now.getTimezoneOffset() < stdOffset;
      return isDST ? -60 : 0; // BST: -60, GMT: 0
    },
    'Europe/Paris': () => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const isDST = now.getTimezoneOffset() < stdOffset;
      return isDST ? -120 : -60; // CEST: -120, CET: -60
    },
    'Asia/Tokyo': () => -540,
    'Asia/Shanghai': () => -480,
    'Australia/Sydney': () => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      const stdOffset = Math.min(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const isDST = now.getTimezoneOffset() > stdOffset;
      return isDST ? -660 : -600; // AEDT: -660, AEST: -600
    }
  };

  if (!timezone || !timezoneMap[timezone]) {
    // Fallback to system timezone
    return new Date().getTimezoneOffset();
  }

  return timezoneMap[timezone]();
}

// Validate date string format
function isValidDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  // Allow YYYY-MM-DD or full ISO string by just checking the start
  const dateRegex = /^\d{4}-\d{2}-\d{2}/;
  return dateRegex.test(dateStr);
}

// Validate time string format (accepts HH:mm or HH:mm:ss)
function isValidTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
  return timeRegex.test(timeStr);
}

// Normalize time to HH:mm:ss format
function normalizeTimeString(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return `${parts[0]}:${parts[1]}:00`;
  }
  return timeStr; // Already has seconds
}

// Helper function to format activity date/time for display
export function formatActivityDateTime(activity, offsetMinutes = null) {
  // Early validation (quiet)
  if (!activity) {
    return 'Not set';
  }

  if (!activity.due_date) {
    return 'Not set';
  }

  // FIXED: Handle full ISO strings by taking only the date part
  const datePart = activity.due_date.split('T')[0];

  // Validate date format
  if (!isValidDateString(datePart)) {
    return 'Invalid date';
  }

  try {
    // If no offset provided, try to get from system/user settings
    if (offsetMinutes === null) {
      offsetMinutes = new Date().getTimezoneOffset();
    }

    if (activity.due_time) {
      // Validate time format
      if (!isValidTimeString(activity.due_time)) {
        return 'Invalid time';
      }

      // Normalize time to HH:mm:ss and create UTC datetime string
      const normalizedTime = normalizeTimeString(activity.due_time);
      const utcString = `${datePart}T${normalizedTime}.000Z`;
      
      // Convert to local time using user's timezone offset
      const displayDate = utcToLocal(utcString, offsetMinutes);
      
      return format(displayDate, 'PPP p'); // e.g., "September 26, 2025 at 5:00 AM"
    } else {
      // Date only - treat as local date without time conversion
      const dateParts = datePart.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
      const day = parseInt(dateParts[2]);
      
      // Validate parsed date parts
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return 'Invalid date';
      }
      
      const dateOnly = new Date(year, month, day);
      
      // Check if constructed date is valid
      if (isNaN(dateOnly.getTime())) {
        return 'Invalid date';
      }
      
      return format(dateOnly, 'PPP'); // e.g., "September 26, 2025"
    }
  } catch {
    return 'Invalid date/time';
  }
}

// Get timezone display name with offset
export function getTimezoneDisplayName(timezone) {
  const offsetMinutes = getCurrentTimezoneOffset(timezone);
  const hours = Math.abs(Math.floor(offsetMinutes / 60));
  const minutes = Math.abs(offsetMinutes % 60);
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const offsetString = `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  const displayNames = {
    'America/New_York': 'Eastern Time',
    'America/Chicago': 'Central Time', 
    'America/Denver': 'Mountain Time',
    'America/Los_Angeles': 'Pacific Time',
    'UTC': 'Coordinated Universal Time',
    'Europe/London': 'Greenwich Mean Time',
    'Europe/Paris': 'Central European Time',
    'Asia/Tokyo': 'Japan Standard Time',
    'Asia/Shanghai': 'China Standard Time',
    'Australia/Sydney': 'Australian Eastern Time'
  };
  
  return `${displayNames[timezone] || timezone} (${offsetString})`;
}
