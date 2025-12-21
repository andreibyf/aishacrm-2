

_Use this to formally finalize Phase 4 and close out development tasks._

---

# 1. **Final Deliverables Checklist (Must Be True Before Closeout)**

### **A. Branding + Avatar Integration**

-  New executive AiSHA portrait renders correctly in:
    
    -  AiSidebar.jsx
        
    -  AiAssistantLauncher.jsx
        
    -  AvatarWidget.jsx
        
    -  FloatingAIWidget.jsx
        
    -  Any legacy widgets still active
        
-  Old avatar assets removed or flagged as deprecated
    
-  Light + dark theme variants show correct contrast and clarity
    

### **B. Header Pill Alignment**

-  Avatar + “Ask AiSHA anything / Voice ready” text aligned vertically
    
-  Tenant selector and managing-client badge properly spaced
    
-  Interactive states (hover, focus) preserved
    
-  No layout shifts at sm/md/lg breakpoints
    

### **C. Sidebar & Panel Finalization**

-  Hero block spacing finalized
    
-  AI controls (voice toggle, guided actions, suggestions) aligned
    
-  Message history container scrolls correctly
    
-  Composer and mic button alignment verified
    

---

# 2. **Technical Acceptance Checklist**

### **Real-time system must remain stable**

-  No changes introduced to Braid, Realtime SDK, or WebRTC logic
    
-  No API regressions from styling updates
    
-  Sidebar still initializes after Realtime connection
    
-  Voice-ready state still detected correctly
    

### **Performance + Accessibility**

-  New assets optimized (<300kb)
    
-  Alt text applied for avatar images
    
-  No layout thrashing impacting FPS
    
-  No console warnings introduced
    

---

# 3. **UI/UX Acceptance Checklist**

### Consistency

-  Avatar sizing consistent across all components
    
-  Shadows, border radii, and backgrounds follow design tokens
    
-  Buttons for voice & text input line up with grid system
    

### Responsiveness

-  Works correctly at 1280w, 1440w, 1920w
    
-  Sidebar opens and closes without jitter or compression
    

### Visual QA

-  Portrait not distorted
    
-  Text not clipped
    
-  Icons properly centered
    

---

# 4. **Documentation Close-Out Checklist**

Create/update the following files:

-  `PHASE_4_FULL_CUTOVER.md` – Mark all tasks complete
    
-  `CHANGELOG.md` – Add Phase 4 release notes
    
-  `BRANDING_GUIDE.md` – Document new avatar assets + placement rules
    
-  `UI_STANDARDS.md` – Update spacing, alignment, and avatar sizing rules
    
-  `ASSET_LICENSES.md` – Verify portrait usage rights
    

---

# 5. **Post-Cutover Monitoring Checklist (72 hours)**

-  Confirm no new console errors appear in production
    
-  Confirm first-time load of sidebar < 150ms after hydration
    
-  Confirm avatar loads correctly for all tenants
    
-  Confirm no mismatches in light/dark mode behavior
    
-  Confirm mic button + voice status labels display correctly
    

Optional but recommended:

-  Collect user feedback from 3–5 testers
    
-  Capture screenshots of updated panels for archives