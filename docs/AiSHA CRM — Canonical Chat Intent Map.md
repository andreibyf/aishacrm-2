

---

## SYSTEM / TENANT

|Intent Code|Routed Tool|
|---|---|
|`SYSTEM_SNAPSHOT`|fetch_tenant_snapshot|
|`SYSTEM_DEBUG`|debug_probe|

---

## ACCOUNTS

|Intent Code|Routed Tool|
|---|---|
|`ACCOUNT_CREATE`|create_account|
|`ACCOUNT_UPDATE`|update_account|
|`ACCOUNT_GET`|get_account_details|
|`ACCOUNT_LIST`|list_accounts|
|`ACCOUNT_SEARCH`|search_accounts|
|`ACCOUNT_DELETE`|delete_account|

---

## LEADS

|Intent Code|Routed Tool|
|---|---|
|`LEAD_CREATE`|create_lead|
|`LEAD_UPDATE`|update_lead|
|`LEAD_QUALIFY`|qualify_lead|
|`LEAD_CONVERT`|convert_lead_to_account|
|`LEAD_LIST`|list_leads|
|`LEAD_SEARCH`|search_leads|
|`LEAD_GET`|get_lead_details|
|`LEAD_DELETE`|delete_lead|

---

## ACTIVITIES

|Intent Code|Routed Tool|
|---|---|
|`ACTIVITY_CREATE`|create_activity|
|`ACTIVITY_UPDATE`|update_activity|
|`ACTIVITY_COMPLETE`|mark_activity_complete|
|`ACTIVITY_UPCOMING`|get_upcoming_activities|
|`ACTIVITY_LIST`|list_activities|
|`ACTIVITY_SEARCH`|search_activities|
|`ACTIVITY_GET`|get_activity_details|
|`ACTIVITY_SCHEDULE`|schedule_meeting|
|`ACTIVITY_DELETE`|delete_activity|

---

## NOTES

|Intent Code|Routed Tool|
|---|---|
|`NOTE_CREATE`|create_note|
|`NOTE_UPDATE`|update_note|
|`NOTE_SEARCH`|search_notes|
|`NOTE_LIST_FOR_RECORD`|get_notes_for_record|
|`NOTE_GET`|get_note_details|
|`NOTE_DELETE`|delete_note|

---

## OPPORTUNITIES

|Intent Code|Routed Tool|
|---|---|
|`OPPORTUNITY_CREATE`|create_opportunity|
|`OPPORTUNITY_UPDATE`|update_opportunity|
|`OPPORTUNITY_LIST_BY_STAGE`|list_opportunities_by_stage|
|`OPPORTUNITY_SEARCH`|search_opportunities|
|`OPPORTUNITY_GET`|get_opportunity_details|
|`OPPORTUNITY_FORECAST`|get_opportunity_forecast|
|`OPPORTUNITY_MARK_WON`|mark_opportunity_won|
|`OPPORTUNITY_DELETE`|delete_opportunity|

---

## CONTACTS

|Intent Code|Routed Tool|
|---|---|
|`CONTACT_CREATE`|create_contact|
|`CONTACT_UPDATE`|update_contact|
|`CONTACT_LIST_FOR_ACCOUNT`|list_contacts_for_account|
|`CONTACT_GET`|get_contact_details|
|`CONTACT_SEARCH`|search_contacts|
|`CONTACT_DELETE`|delete_contact|

---

## BIZDEV SOURCES

|Intent Code|Routed Tool|
|---|---|
|`BIZDEV_CREATE`|create_bizdev_source|
|`BIZDEV_UPDATE`|update_bizdev_source|
|`BIZDEV_GET`|get_bizdev_source_details|
|`BIZDEV_LIST`|list_bizdev_sources|
|`BIZDEV_SEARCH`|search_bizdev_sources|
|`BIZDEV_PROMOTE`|promote_bizdev_source_to_lead|
|`BIZDEV_DELETE`|delete_bizdev_source|
|`BIZDEV_ARCHIVE`|archive_bizdev_sources|

---

## LIFECYCLE

|Intent Code|Routed Tool|
|---|---|
|`LIFECYCLE_TO_LEAD`|advance_to_lead|
|`LIFECYCLE_TO_QUALIFIED`|advance_to_qualified|
|`LIFECYCLE_TO_ACCOUNT`|advance_to_account|
|`LIFECYCLE_OPPORTUNITY_STAGE`|advance_opportunity_stage|
|`LIFECYCLE_FULL_ADVANCE`|full_lifecycle_advance|

---

## SUGGESTIONS

|Intent Code|Routed Tool|
|---|---|
|`SUGGESTION_LIST`|list_suggestions|
|`SUGGESTION_GET`|get_suggestion_details|
|`SUGGESTION_STATS`|get_suggestion_stats|
|`SUGGESTION_APPROVE`|approve_suggestion|
|`SUGGESTION_REJECT`|reject_suggestion|
|`SUGGESTION_APPLY`|apply_suggestion|
|`SUGGESTION_TRIGGER`|trigger_suggestion_generation|

---

## WEB RESEARCH

|Intent Code|Routed Tool|
|---|---|
|`WEB_SEARCH`|search_web|
|`WEB_FETCH_PAGE`|fetch_web_page|
|`WEB_LOOKUP_COMPANY`|lookup_company_info|

---

## WORKFLOWS

|Intent Code|Routed Tool|
|---|---|
|`WORKFLOW_LIST_TEMPLATES`|list_workflow_templates|
|`WORKFLOW_GET_TEMPLATE`|get_workflow_template|
|`WORKFLOW_INSTANTIATE`|instantiate_workflow_template|

---

## TELEPHONY

|Intent Code|Routed Tool|
|---|---|
|`TELEPHONY_INITIATE_CALL`|initiate_call|
|`TELEPHONY_CALL_CONTACT`|call_contact|
|`TELEPHONY_CHECK_PROVIDER`|check_calling_provider|
|`TELEPHONY_GET_AGENTS`|get_calling_agents|

---

## NEXT ACTION AI

|Intent Code|Routed Tool|
|---|---|
|`AI_SUGGEST_NEXT_ACTIONS`|suggest_next_actions|

---

## NAVIGATION

|Intent Code|Routed Tool|
|---|---|
|`NAVIGATE_TO_PAGE`|navigate_to_page|
|`NAVIGATE_GET_CURRENT`|get_current_page|

---

## DOCUMENTS

|Intent Code|Routed Tool|
|---|---|
|`DOCUMENT_LIST`|list_documents|
|`DOCUMENT_GET`|get_document_details|
|`DOCUMENT_CREATE`|create_document|
|`DOCUMENT_UPDATE`|update_document|
|`DOCUMENT_DELETE`|delete_document|
|`DOCUMENT_ANALYZE`|analyze_document|
|`DOCUMENT_SEARCH`|search_documents|

---

## EMPLOYEES

|Intent Code|Routed Tool|
|---|---|
|`EMPLOYEE_LIST`|list_employees|
|`EMPLOYEE_GET`|get_employee_details|
|`EMPLOYEE_CREATE`|create_employee|
|`EMPLOYEE_UPDATE`|update_employee|
|`EMPLOYEE_DELETE`|delete_employee|
|`EMPLOYEE_SEARCH`|search_employees|
|`EMPLOYEE_ASSIGNMENTS`|get_employee_assignments|

---

## USERS

|Intent Code|Routed Tool|
|---|---|
|`USER_LIST`|list_users|
|`USER_GET`|get_user_details|
|`USER_SELF_PROFILE`|get_current_user_profile|
|`USER_PROFILE_LIST`|get_user_profiles|
|`USER_CREATE`|create_user|
|`USER_UPDATE`|update_user|
|`USER_DELETE`|delete_user|
|`USER_SEARCH`|search_users|
|`USER_INVITE`|invite_user|

---

## REPORTS

|Intent Code|Routed Tool|
|---|---|
|`REPORT_DASHBOARD`|get_dashboard_bundle|
|`REPORT_HEALTH`|get_health_summary|
|`REPORT_SALES`|get_sales_report|
|`REPORT_PIPELINE`|get_pipeline_report|
|`REPORT_ACTIVITY`|get_activity_report|
|`REPORT_LEAD_CONVERSION`|get_lead_conversion_report|
|`REPORT_REVENUE_FORECAST`|get_revenue_forecasts|
|`REPORT_CACHE_CLEAR`|clear_report_cache|

---

This is now your **LLM routing contract**.

Anything outside of these becomes:

- conversational
    
- informational
    
- or UI-only
    

Everything inside routes deterministically to Braid.