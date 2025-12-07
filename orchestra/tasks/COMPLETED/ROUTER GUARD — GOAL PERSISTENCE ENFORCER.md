# **ROUTER GUARD — GOAL PERSISTENCE ENFORCER**

## Purpose

This module **prevents intent overwrites, preserves task continuity, and resolves short follow-ups** before your classifier or tool router runs.

It must execute **before**:

- intent classification
    
- tool routing
    
- fallback UI
    
- summaries
    

---

## ✅ 1. **Active Goal Schema**

**File:** `backend/state/activeGoal.ts`

`export type ActiveGoalType =   | "schedule"   | "reschedule"   | "cancel"   | "update"   | "assign"   | "follow_up";  export interface ActiveGoal {   type: ActiveGoalType;   entity?: {     type: "lead" | "contact" | "activity";     id?: string;     name?: string;   };   target?: string;       // e.g., activityId   datetime?: string;   tenantId: string;   status: "pending" | "confirmed" | "completed"; }`

---

## ✅ 2. **High-Priority Continuation Detector**

**File:** `backend/guards/isFollowUpContinuation.ts`

`const CONTINUATION_PATTERNS = [   /^(yes|yep|yeah|confirm|do it|go ahead)$/i,   /^(her|him|them|that one|the appointment)$/i,   /^(reschedule|move it|change it)$/i, ];  export function isFollowUpContinuation(input: string): boolean {   return CONTINUATION_PATTERNS.some((rx) => rx.test(input.trim())); }`

---

## ✅ 3. **Goal Override Guard (LOW-CONFIDENCE PROTECTION)**

**File:** `backend/guards/shouldPreserveGoal.ts`

`export function shouldPreserveGoal(   activeGoal: any,   classifiedIntent: string,   confidence: number ): boolean {   if (!activeGoal) return false;    // If confidence is low, NEVER overwrite an active goal   if (confidence < 0.4) return true;    // If classified intent is read-only but a task is active, preserve   const READ_ONLY = ["summaries", "forecast", "generic_question"];   if (READ_ONLY.includes(classifiedIntent)) return true;    return false; }`

---

## ✅ 4. **CORE ROUTER GUARD (THE ENFORCER)**

**File:** `backend/guards/routerGuard.ts`

`import { isFollowUpContinuation } from "./isFollowUpContinuation"; import { shouldPreserveGoal } from "./shouldPreserveGoal"; import { getActiveGoal } from "../state/goalStore"; // Redis-backed import type { ActiveGoal } from "../state/activeGoal";  export async function routerGuard({   conversationId,   userText,   classification, }: {   conversationId: string;   userText: string;   classification: {     intent: string;     confidence: number;   }; }) {   const activeGoal: ActiveGoal | null = await getActiveGoal(conversationId);    // ✅ RULE 1: SHORT FOLLOW-UPS MUST CONTINUE ACTIVE GOAL   if (activeGoal && isFollowUpContinuation(userText)) {     return {       mode: "CONTINUE_ACTIVE_GOAL",       activeGoal,     };   }    // ✅ RULE 2: LOW CONFIDENCE MAY NOT OVERRIDE ACTIVE GOAL   if (     activeGoal &&     shouldPreserveGoal(       activeGoal,       classification.intent,       classification.confidence     )   ) {     return {       mode: "CONTINUE_ACTIVE_GOAL",       activeGoal,     };   }    // ✅ RULE 3: NEW ACTION OVERRIDES OLD GOAL   const ACTION_INTENTS = [     "schedule",     "reschedule",     "cancel",     "assign",     "update",   ];    if (ACTION_INTENTS.includes(classification.intent)) {     return {       mode: "SET_NEW_GOAL",       newGoalType: classification.intent,     };   }    // ✅ RULE 4: NO ACTIVE GOAL → NORMAL ROUTING   return {     mode: "NORMAL_ROUTING",   }; }`

---

## ✅ 5. **How to Integrate This Guard (MANDATORY)**

**Wherever your intent routing currently happens:**

`const classification = classifyIntent(userText);`

Immediately follow with:

`const guard = await routerGuard({   conversationId,   userText,   classification, });`

Then route based on guard mode:

`switch (guard.mode) {   case "CONTINUE_ACTIVE_GOAL":     return continueGoalFlow(guard.activeGoal, userText);    case "SET_NEW_GOAL":     return initializeNewGoalFlow({       type: guard.newGoalType,       userText,       tenantId,     });    case "NORMAL_ROUTING":   default:     return routeNormally(classification, userText); }`

---

## ✅ 6. **What This Guard Explicitly Prevents**

|Failure Mode|Status|
|---|---|
|“Yes” treated as new question|❌ Blocked|
|Low confidence overwriting reschedule|❌ Blocked|
|Summaries interrupting active task|❌ Blocked|
|“Her / that one” losing reference|❌ Blocked|
|Planner asking “What action?” mid-task|❌ Blocked|

---

## ✅ 7. **What It Guarantees**

✅ Tasks persist across turns  
✅ Follow-ups bind correctly  
✅ Read-only intents cannot hijack active tasks  
✅ Users are never forced to re-state goals  
✅ Planner logic becomes deterministic

---

## ✅ 8. **Developer Enforcement Notes for Copilot**

- This guard **must run before tools**
    
- This guard **must run before prompts**
    
- This guard **must NOT be bypassed by classifier confidence**
    
- This guard **is the enforcement layer for the Core Planner Prompt**