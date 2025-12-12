# Fix for Activity Overdue Filter and Totals Stability

## Problem
1. **Overdue Filter Empty**: Clicking "Overdue" showed no records.
2. **Totals Changing**: The counts (Scheduled, Overdue, etc.) in the header were being recalculated based on the *current page of filtered results*.
3. **Docker Updates**: Code changes weren't applying due to missing bind mounts.
4. **Scheduled Showing Overdue**: The "Scheduled" filter included items that were technically "Scheduled" status but effectively Overdue, confusing the view.

## Solution

### 1. Backend Overdue Logic
Updated `backend/routes/activities.v2.js` to natively handle `?status=overdue`.
- `Overdue` = Status (Scheduled/In Progress) AND Due Date < Today.

### 2. Backend Partitioning
Refined `?status=scheduled` and `?status=in_progress` logic.
- `Scheduled` = Status (Scheduled) AND (Due Date >= Today OR Null).
- `In Progress` = Status (In Progress) AND (Due Date >= Today OR Null).
- This ensures items strictly appear in *either* Overdue *or* Scheduled/In Progress, not both.

### 3. Frontend Simplification
Reverted `Activities.jsx` to send simple filters like `status='overdue'` or `status='scheduled'`, relying on the robust backend partitioning.

### 4. Independent Stats Loading
Preserved the new `loadStats` function in `Activities.jsx` to maintain stable header counts.

### 5. Deployment
Rebuilt the Docker containers to apply the backend logic changes.
