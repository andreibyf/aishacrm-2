/**
 * Initialize New Goal Flow
 * 
 * Handles the creation of new goals when the router detects a goal-triggering intent.
 * Extracts parameters from user input and stores the goal in Redis.
 */

import { randomUUID } from 'node:crypto';
import { setActiveGoal } from '../state/goalStore.js';
import { findLeadByName } from '../services/leadLookup.js';
import logger from '../lib/logger.js';

/**
 * Extract lead name from user text
 * Looks for patterns like "with John Smith" or "for John Smith"
 * 
 * @param {string} text
 * @returns {string | null}
 */
function extractLeadName(text) {
  const skipWords = ['me', 'them', 'him', 'her', 'tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'next', 'at', 'about', 'the'];
  
  // Pattern: "with [Name]" or "for [Name]" or "call [Name]" etc.
  const patterns = [
    /(?:with|for|to)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i,
    /call\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i,
    /email\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Get first name
      const firstName = match[1].trim();
      
      // Skip if first word is a common non-name word
      if (skipWords.includes(firstName.toLowerCase())) {
        continue;
      }
      
      // Check if there's a valid second name
      const secondName = match[2]?.trim();
      if (secondName && !skipWords.includes(secondName.toLowerCase())) {
        return `${firstName} ${secondName}`;
      }
      
      return firstName;
    }
  }
  
  return null;
}

/**
 * Extract datetime from user text
 * Handles relative dates like "tomorrow at 2pm", "next Monday at 3pm"
 * 
 * @param {string} text
 * @returns {{date: string, time: string} | null}
 */
function extractDateTime(text) {
  const now = new Date();
  const lowerText = text.toLowerCase();
  
  // Time extraction (e.g., "at 2pm", "at 3:30pm", "at 14:00")
  const timeMatch = lowerText.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hours = null;
  let minutes = 0;
  
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();
    
    if (meridiem === 'pm' && hours < 12) {
      hours += 12;
    } else if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }
  }
  
  // Date extraction
  let targetDate = new Date(now);
  
  if (lowerText.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (lowerText.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
  } else if (lowerText.includes('next monday')) {
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    targetDate.setDate(targetDate.getDate() + daysUntilMonday);
  } else if (lowerText.includes('next tuesday')) {
    const daysUntilTuesday = (9 - now.getDay()) % 7 || 7;
    targetDate.setDate(targetDate.getDate() + daysUntilTuesday);
  } else if (lowerText.includes('next wednesday')) {
    const daysUntilWednesday = (10 - now.getDay()) % 7 || 7;
    targetDate.setDate(targetDate.getDate() + daysUntilWednesday);
  } else if (lowerText.includes('next thursday')) {
    const daysUntilThursday = (11 - now.getDay()) % 7 || 7;
    targetDate.setDate(targetDate.getDate() + daysUntilThursday);
  } else if (lowerText.includes('next friday')) {
    const daysUntilFriday = (12 - now.getDay()) % 7 || 7;
    targetDate.setDate(targetDate.getDate() + daysUntilFriday);
  }
  
  if (hours === null) {
    // Default to 10 AM if no time specified
    hours = 10;
    minutes = 0;
  }
  
  targetDate.setHours(hours, minutes, 0, 0);
  
  // Only return if we found some date/time indication
  const hasDateIndicator = /tomorrow|next|monday|tuesday|wednesday|thursday|friday|today|at\s+\d/i.test(text);
  if (!hasDateIndicator) {
    return null;
  }
  
  return {
    date: targetDate.toISOString().split('T')[0],
    time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    timestamp: targetDate.toISOString(),
  };
}

/**
 * Initialize a new goal from user intent
 * 
 * @param {Object} params
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} params.userText - User's message
 * @param {string} params.goalType - Detected goal type (from router guard)
 * @returns {Promise<{success: boolean, message: string, goal?: Object}>}
 */
export async function initializeNewGoalFlow({ conversationId, tenantId, userText, goalType }) {
  try {
    // Extract parameters from user text
    const leadName = extractLeadName(userText);
    const dateTime = extractDateTime(userText);
    
    // Look up lead if name was extracted
    let lead = null;
    if (leadName) {
      lead = await findLeadByName(tenantId, leadName);
    }
    
    const goalId = randomUUID();
    const now = Date.now();
    
    // Build extracted data based on goal type
    const extractedData = {
      rawText: userText,
      leadName: leadName,
      lead: lead ? { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone } : null,
      dateTime: dateTime,
    };
    
    // Determine what info is missing
    const missingInfo = [];
    if (!lead && goalType === 'schedule_call') {
      if (!leadName) {
        missingInfo.push('the lead or contact name');
      } else {
        missingInfo.push(`a matching lead for "${leadName}"`);
      }
    }
    if (!dateTime && ['schedule_call', 'book_meeting'].includes(goalType)) {
      missingInfo.push('the date and time');
    }
    
    // Build confirmation message
    let confirmationMessage;
    if (missingInfo.length > 0) {
      confirmationMessage = `I need a bit more information. Please provide ${missingInfo.join(' and ')}.`;
    } else if (goalType === 'schedule_call') {
      confirmationMessage = `I'll schedule a call with ${lead.name} on ${dateTime.date} at ${dateTime.time}. Should I proceed?`;
    } else if (goalType === 'send_email') {
      confirmationMessage = `I'll draft an email to ${lead?.name || leadName || 'the specified contact'}. What would you like to say?`;
    } else if (goalType === 'book_meeting') {
      confirmationMessage = `I'll book a meeting with ${lead?.name || leadName || 'the specified contact'} on ${dateTime?.date || 'the specified date'}. Should I proceed?`;
    } else {
      confirmationMessage = `I understand you want to ${goalType.replace('_', ' ')}. Please confirm or provide more details.`;
    }
    
    // Create the goal object
    const goal = {
      goalId,
      goalType,
      conversationId,
      tenantId,
      extractedData,
      status: missingInfo.length > 0 ? 'awaiting_input' : 'pending_confirmation',
      confirmationMessage,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + (15 * 60 * 1000), // 15 minutes
    };
    
    // Store in Redis
    await setActiveGoal(conversationId, goal);
    
    return {
      success: true,
      message: confirmationMessage,
      goal,
      needsMoreInfo: missingInfo.length > 0,
    };
  } catch (error) {
    logger.error('[InitializeGoalFlow] Error:', error.message);
    return {
      success: false,
      message: 'I encountered an error setting up that task. Please try again.',
      error: error.message,
    };
  }
}

export { extractLeadName, extractDateTime };
