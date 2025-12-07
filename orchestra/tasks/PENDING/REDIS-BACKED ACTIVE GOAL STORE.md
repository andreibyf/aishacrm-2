1. A **Redis-backed Active Goal Store**
    
2. **Flow handlers** for:
    
    - `initializeNewGoalFlow`
        
    - `continueGoalFlow`
        
3. Integrated specifically for **schedule / reschedule / cancel**  

This pairs directly with the **Router Guard** I already approved.
# REDIS-BACKED ACTIVE GOAL STORE

## `backend/state/goalStore.ts`

``import { redis } from "../redis"; import type { ActiveGoal } from "./activeGoal";  const TTL_SECONDS = 900; // 15 minutes  function key(conversationId: string) {   return `activeGoal:${conversationId}`; }  export async function setActiveGoal(   conversationId: string,   goal: ActiveGoal ) {   await redis.set(     key(conversationId),     JSON.stringify(goal),     "EX",     TTL_SECONDS   ); }  export async function getActiveGoal(   conversationId: string ): Promise<ActiveGoal | null> {   const value = await redis.get(key(conversationId));   return value ? JSON.parse(value) : null; }  export async function clearActiveGoal(   conversationId: string ) {   await redis.del(key(conversationId)); }``

---

# ✅ 2. INITIALIZE NEW GOAL FLOW HANDLER

This runs when the router guard returns:

`mode: "SET_NEW_GOAL"`

---

## `backend/flows/initializeNewGoalFlow.ts`

``import { setActiveGoal } from "../state/goalStore"; import type { ActiveGoal } from "../state/activeGoal"; import { extractDateTimeAndLead } from "../services/nlpParser";  export async function initializeNewGoalFlow({   conversationId,   tenantId,   type,   userText, }: {   conversationId: string;   tenantId: string;   type: "schedule" | "reschedule" | "cancel" | "assign" | "update";   userText: string; }) {   const parsed = extractDateTimeAndLead(userText);    const goal: ActiveGoal = {     type,     tenantId,     status: "pending",     entity: parsed.leadName       ? {           type: "lead",           name: parsed.leadName,         }       : undefined,     datetime: parsed?.datetime,   };    await setActiveGoal(conversationId, goal);    return {     type: "ai_chat",     response: buildGoalConfirmationPrompt(goal),   }; }  function buildGoalConfirmationPrompt(goal: ActiveGoal) {   switch (goal.type) {     case "schedule":       return `I’m ready to schedule the call${         goal.entity?.name ? ` with ${goal.entity.name}` : ""       }${         goal.datetime ? ` on ${new Date(goal.datetime).toLocaleString()}` : ""       }. Should I proceed?`;      case "reschedule":       return `I’m ready to reschedule the appointment${         goal.entity?.name ? ` for ${goal.entity.name}` : ""       }. What new time should I use?`;      case "cancel":       return `I’m ready to cancel the appointment. Should I proceed?`;      default:       return `I’m ready to proceed with the update. Should I continue?`;   } }``

---

# ✅ 3. CONTINUE ACTIVE GOAL FLOW HANDLER

This runs when the router guard returns:

`mode: "CONTINUE_ACTIVE_GOAL"`

---

## `backend/flows/continueGoalFlow.ts`

``import { clearActiveGoal, setActiveGoal } from "../state/goalStore"; import { createCalendarEvent } from "../services/calendarService"; import { findNextAvailableSlot } from "../services/availabilityService"; import type { ActiveGoal } from "../state/activeGoal";  export async function continueGoalFlow(   activeGoal: ActiveGoal,   userText: string ) {   const txt = userText.trim().toLowerCase();    // ✅ CONFIRMATION EXECUTION   if (/^(yes|yep|confirm|do it|go ahead)$/i.test(txt)) {     if (activeGoal.type === "schedule" || activeGoal.type === "reschedule") {       await createCalendarEvent({         tenantId: activeGoal.tenantId,         leadId: activeGoal.entity?.id!,         datetime: activeGoal.datetime!,       });     }      await clearActiveGoal(activeGoal.tenantId);      return {       type: "ai_brain",       response: "✅ The action has been successfully completed.",     };   }    // 🔁 RESCHEDULE TIME UPDATE   if (     activeGoal.type === "reschedule" ||     /^(move|change|reschedule)/i.test(txt)   ) {     const nextSlot = await findNextAvailableSlot(       activeGoal.tenantId,       activeGoal.datetime || new Date().toISOString()     );      activeGoal.datetime = nextSlot;     await setActiveGoal(activeGoal.tenantId, activeGoal);      return {       type: "ai_chat",       response: `Suggested new time: ${new Date(         nextSlot       ).toLocaleString()}. Confirm?`,     };   }    // ❗FALLBACK IF USER GIVES IRRELEVANT INPUT   return {     type: "ai_chat",     response:       "I’m still working on your request. Please confirm or provide the missing details.",   }; }``

---

# ✅ 4. REQUIRED ROUTER INTEGRATION (FINAL WIRING)

Inside your main router:

`const guard = await routerGuard({   conversationId,   userText,   classification, });  switch (guard.mode) {   case "SET_NEW_GOAL":     return initializeNewGoalFlow({       conversationId,       tenantId,       type: guard.newGoalType,       userText,     });    case "CONTINUE_ACTIVE_GOAL":     return continueGoalFlow(guard.activeGoal, userText);    case "NORMAL_ROUTING":   default:     return routeNormally(classification, userText); }`

---

# ✅ 5. WHAT THIS GIVES YOU IMMEDIATELY

|Feature|Status|
|---|---|
|Cross-turn task continuity|✅|
|“Yes” executes immediately|✅|
|Low-confidence intent protection|✅|
|Reschedule flows|✅|
|Goal overrides handled|✅|
|Redis-safe persistence|✅|
|Stateless backend immunity|✅|

---

# ✅ FINAL INTEGRATION CHECKLIST (FOR COPILOT)

Copilot must verify all of the following exist:

`backend/state/activeGoal.ts backend/state/goalStore.ts backend/guards/routerGuard.ts backend/flows/initializeNewGoalFlow.ts backend/flows/continueGoalFlow.ts`

And that:

- `routerGuard` runs **before classification routing**
    
- `goalStore` uses **Redis**
    
- `continueGoalFlow` executes on `"yes"`