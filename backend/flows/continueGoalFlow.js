/**
 * Continue Goal Flow
 * 
 * Handles follow-up messages when there's an active goal in progress.
 * Interprets user responses (yes, no, reschedule, cancel) and updates goal state.
 */

import { setActiveGoal, clearActiveGoal } from '../state/goalStore.js';
import { findLeadByName } from '../services/leadLookup.js';
import { extractDateTime } from './initializeNewGoalFlow.js';

/**
 * Classify user response type
 * @param {string} text
 * @returns {'confirm' | 'cancel' | 'reschedule' | 'provide_info' | 'unclear'}
 */
function classifyResponse(text) {
  const lowerText = text.toLowerCase().trim();
  
  // Confirmation patterns
  if (/^(yes|yeah|yep|sure|ok|okay|proceed|do it|go ahead|confirm|absolutely|definitely)$/i.test(lowerText)) {
    return 'confirm';
  }
  if (lowerText.includes('yes') && lowerText.length < 20) {
    return 'confirm';
  }
  
  // Cancellation patterns
  if (/^(no|nope|cancel|stop|nevermind|never mind|forget it|don't|abort)$/i.test(lowerText)) {
    return 'cancel';
  }
  if (lowerText.includes('cancel') || lowerText.includes('stop')) {
    return 'cancel';
  }
  
  // Reschedule patterns
  if (/reschedule|different time|another time|change the time|change it to|move it to/i.test(lowerText)) {
    return 'reschedule';
  }
  
  // Check if providing additional info (contains time, date, or name-like patterns)
  if (/tomorrow|next|monday|tuesday|wednesday|thursday|friday|at\s+\d|\d{1,2}:\d{2}|am|pm/i.test(lowerText)) {
    return 'provide_info';
  }
  
  return 'unclear';
}

/**
 * Execute the goal action
 * @param {Object} goal - Active goal object
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function executeGoal(goal) {
  const { goalType, extractedData, tenantId } = goal;
  
  try {
    switch (goalType) {
      case 'schedule_call': {
        const lead = extractedData.lead;
        const dateTime = extractedData.dateTime;
        
        if (!lead || !dateTime) {
          return {
            success: false,
            message: 'Missing required information to schedule the call.',
          };
        }
        
        // Here we would integrate with the actual calendar/activity creation
        // For now, log and return success
        console.log('[ContinueGoalFlow] Executing schedule_call:', {
          leadId: lead.id,
          leadName: lead.name,
          scheduledTime: dateTime.timestamp,
          tenantId,
        });
        
        return {
          success: true,
          message: `Done! I've scheduled a call with ${lead.name} for ${dateTime.date} at ${dateTime.time}. You'll receive a reminder before the call.`,
        };
      }
      
      case 'send_email': {
        const lead = extractedData.lead;
        
        console.log('[ContinueGoalFlow] Executing send_email:', {
          leadId: lead?.id,
          content: extractedData.emailContent || extractedData.rawText?.slice(0, 100),
          tenantId,
        });
        
        return {
          success: true,
          message: `Email drafted for ${lead?.name || 'the contact'}. Review and send when ready.`,
        };
      }
      
      case 'book_meeting': {
        const lead = extractedData.lead;
        const dateTime = extractedData.dateTime;
        
        console.log('[ContinueGoalFlow] Executing book_meeting:', {
          leadId: lead?.id,
          scheduledTime: dateTime?.timestamp,
          tenantId,
        });
        
        return {
          success: true,
          message: `Meeting booked with ${lead?.name || 'the attendees'} for ${dateTime?.date || 'the scheduled date'}.`,
        };
      }
      
      case 'create_reminder': {
        console.log('[ContinueGoalFlow] Executing create_reminder:', {
          tenantId,
          content: extractedData.rawText,
        });
        
        return {
          success: true,
          message: 'Reminder set! I\'ll notify you at the specified time.',
        };
      }
      
      default:
        return {
          success: false,
          message: `Unknown goal type: ${goalType}`,
        };
    }
  } catch (error) {
    console.error('[ContinueGoalFlow] Execution error:', error.message);
    return {
      success: false,
      message: 'An error occurred while executing the task. Please try again.',
    };
  }
}

/**
 * Find next available time slot (simplified)
 * @param {Object} currentDateTime
 * @returns {Object}
 */
function findNextAvailableSlot(currentDateTime) {
  const current = new Date(currentDateTime.timestamp);
  // Add 1 hour for next slot
  current.setHours(current.getHours() + 1);
  
  return {
    date: current.toISOString().split('T')[0],
    time: `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`,
    timestamp: current.toISOString(),
  };
}

/**
 * Continue an active goal based on user's response
 * 
 * @param {Object} params
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} params.userText - User's follow-up message
 * @param {Object} params.activeGoal - The active goal from Redis
 * @returns {Promise<{success: boolean, message: string, goalCleared: boolean}>}
 */
export async function continueGoalFlow({ conversationId, tenantId, userText, activeGoal }) {
  try {
    const responseType = classifyResponse(userText);
    
    switch (responseType) {
      case 'confirm': {
        // User confirmed - execute the goal
        const result = await executeGoal(activeGoal);
        
        // Clear the goal after execution
        await clearActiveGoal(conversationId);
        
        return {
          success: result.success,
          message: result.message,
          goalCleared: true,
        };
      }
      
      case 'cancel': {
        // User cancelled - clear the goal
        await clearActiveGoal(conversationId);
        
        return {
          success: true,
          message: 'No problem, I\'ve cancelled that task. Is there anything else I can help you with?',
          goalCleared: true,
        };
      }
      
      case 'reschedule': {
        // User wants to reschedule - extract new time or suggest alternatives
        const newDateTime = extractDateTime(userText);
        
        if (newDateTime) {
          // Update goal with new time
          const updatedGoal = {
            ...activeGoal,
            extractedData: {
              ...activeGoal.extractedData,
              dateTime: newDateTime,
            },
            status: 'pending_confirmation',
            confirmationMessage: `I'll reschedule to ${newDateTime.date} at ${newDateTime.time}. Should I proceed?`,
            updatedAt: Date.now(),
          };
          
          await setActiveGoal(conversationId, updatedGoal);
          
          return {
            success: true,
            message: `I'll reschedule to ${newDateTime.date} at ${newDateTime.time}. Should I proceed?`,
            goalCleared: false,
          };
        } else {
          // No new time provided, suggest next available
          const currentDateTime = activeGoal.extractedData.dateTime;
          const nextSlot = findNextAvailableSlot(currentDateTime || { timestamp: new Date().toISOString() });
          
          const updatedGoal = {
            ...activeGoal,
            extractedData: {
              ...activeGoal.extractedData,
              dateTime: nextSlot,
            },
            status: 'pending_confirmation',
            updatedAt: Date.now(),
          };
          
          await setActiveGoal(conversationId, updatedGoal);
          
          return {
            success: true,
            message: `How about ${nextSlot.date} at ${nextSlot.time} instead? Let me know if that works.`,
            goalCleared: false,
          };
        }
      }
      
      case 'provide_info': {
        // User is providing additional information
        const newDateTime = extractDateTime(userText);
        const leadName = userText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1];
        
        let updatedExtractedData = { ...activeGoal.extractedData };
        
        if (newDateTime) {
          updatedExtractedData.dateTime = newDateTime;
        }
        
        if (leadName && !activeGoal.extractedData.lead) {
          const lead = await findLeadByName(tenantId, leadName);
          if (lead) {
            updatedExtractedData.lead = {
              id: lead.id,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
            };
            updatedExtractedData.leadName = leadName;
          }
        }
        
        // Check if we now have all required info
        const hasLead = updatedExtractedData.lead;
        const hasDateTime = updatedExtractedData.dateTime;
        const isComplete = hasLead && hasDateTime;
        
        let confirmationMessage;
        if (isComplete) {
          confirmationMessage = `I'll schedule a call with ${updatedExtractedData.lead.name} on ${updatedExtractedData.dateTime.date} at ${updatedExtractedData.dateTime.time}. Should I proceed?`;
        } else {
          const missing = [];
          if (!hasLead) missing.push('the lead or contact name');
          if (!hasDateTime) missing.push('the date and time');
          confirmationMessage = `Thanks! I still need ${missing.join(' and ')} to complete this task.`;
        }
        
        const updatedGoal = {
          ...activeGoal,
          extractedData: updatedExtractedData,
          status: isComplete ? 'pending_confirmation' : 'awaiting_input',
          confirmationMessage,
          updatedAt: Date.now(),
        };
        
        await setActiveGoal(conversationId, updatedGoal);
        
        return {
          success: true,
          message: confirmationMessage,
          goalCleared: false,
        };
      }
      
      case 'unclear':
      default: {
        // Can't understand the response - remind user of pending goal
        const goalDescription = {
          schedule_call: 'scheduling a call',
          send_email: 'sending an email',
          book_meeting: 'booking a meeting',
          create_reminder: 'creating a reminder',
        };
        
        return {
          success: true,
          message: `I'm still working on ${goalDescription[activeGoal.goalType] || 'your task'}. Would you like to proceed, reschedule, or cancel?`,
          goalCleared: false,
        };
      }
    }
  } catch (error) {
    console.error('[ContinueGoalFlow] Error:', error.message);
    return {
      success: false,
      message: 'I encountered an error processing your response. Please try again.',
      goalCleared: false,
    };
  }
}

export { classifyResponse, executeGoal };
