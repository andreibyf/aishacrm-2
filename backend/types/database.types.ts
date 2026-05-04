export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string | null
          activity_metadata: Json | null
          ai_action: string | null
          ai_doc_source_type: string | null
          annual_revenue: number | null
          assigned_to: string | null
          assigned_to_team: string | null
          city: string | null
          country: string | null
          created_at: string | null
          created_date: string | null
          description: string | null
          email: string | null
          employee_count: number | null
          health_status: string | null
          id: string
          industry: string | null
          is_placeholder: boolean | null
          is_test_data: boolean | null
          last_activity_date: string | null
          last_synced: string | null
          legacy_id: string | null
          metadata: Json | null
          name: string
          next_action: string | null
          normalized_name: string | null
          notes: string | null
          phone: string | null
          processed_by_ai_doc: boolean | null
          score: number | null
          score_reason: string | null
          state: string | null
          street: string | null
          tags: Json | null
          tenant_id: string | null
          type: string | null
          unique_id: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          account_type?: string | null
          activity_metadata?: Json | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          annual_revenue?: number | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          email?: string | null
          employee_count?: number | null
          health_status?: string | null
          id?: string
          industry?: string | null
          is_placeholder?: boolean | null
          is_test_data?: boolean | null
          last_activity_date?: string | null
          last_synced?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          name: string
          next_action?: string | null
          normalized_name?: string | null
          notes?: string | null
          phone?: string | null
          processed_by_ai_doc?: boolean | null
          score?: number | null
          score_reason?: string | null
          state?: string | null
          street?: string | null
          tags?: Json | null
          tenant_id?: string | null
          type?: string | null
          unique_id?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          account_type?: string | null
          activity_metadata?: Json | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          annual_revenue?: number | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          email?: string | null
          employee_count?: number | null
          health_status?: string | null
          id?: string
          industry?: string | null
          is_placeholder?: boolean | null
          is_test_data?: boolean | null
          last_activity_date?: string | null
          last_synced?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          name?: string
          next_action?: string | null
          normalized_name?: string | null
          notes?: string | null
          phone?: string | null
          processed_by_ai_doc?: boolean | null
          score?: number | null
          score_reason?: string | null
          state?: string | null
          street?: string | null
          tags?: Json | null
          tenant_id?: string | null
          type?: string | null
          unique_id?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "accounts_assigned_to_team_fkey"
            columns: ["assigned_to_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          activity_metadata: Json | null
          ai_action: string | null
          ai_call_config: Json | null
          ai_doc_source_type: string | null
          ai_email_config: Json | null
          ai_priority: string | null
          ai_summary: string | null
          assigned_to: string | null
          assigned_to_employee_id: string | null
          assigned_to_team: string | null
          body: string | null
          competitor: string | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          duration_minutes: number | null
          id: string
          is_test_data: boolean | null
          key_points: Json | null
          last_synced: string | null
          lead_source: string | null
          legacy_id: string | null
          location: string | null
          metadata: Json | null
          outcome: string | null
          priority: Database["public"]["Enums"]["activity_priority"]
          processed_by_ai_doc: boolean | null
          related_email: string | null
          related_id: string | null
          related_name: string | null
          related_to: string | null
          sentiment: string | null
          status: string | null
          subject: string | null
          tags: string[] | null
          tenant_id: string | null
          type: string
          unique_id: string | null
          updated_at: string | null
          updated_date: string | null
          urgency_score: number | null
        }
        Insert: {
          activity_metadata?: Json | null
          ai_action?: string | null
          ai_call_config?: Json | null
          ai_doc_source_type?: string | null
          ai_email_config?: Json | null
          ai_priority?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          assigned_to_employee_id?: string | null
          assigned_to_team?: string | null
          body?: string | null
          competitor?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          id?: string
          is_test_data?: boolean | null
          key_points?: Json | null
          last_synced?: string | null
          lead_source?: string | null
          legacy_id?: string | null
          location?: string | null
          metadata?: Json | null
          outcome?: string | null
          priority?: Database["public"]["Enums"]["activity_priority"]
          processed_by_ai_doc?: boolean | null
          related_email?: string | null
          related_id?: string | null
          related_name?: string | null
          related_to?: string | null
          sentiment?: string | null
          status?: string | null
          subject?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          type: string
          unique_id?: string | null
          updated_at?: string | null
          updated_date?: string | null
          urgency_score?: number | null
        }
        Update: {
          activity_metadata?: Json | null
          ai_action?: string | null
          ai_call_config?: Json | null
          ai_doc_source_type?: string | null
          ai_email_config?: Json | null
          ai_priority?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          assigned_to_employee_id?: string | null
          assigned_to_team?: string | null
          body?: string | null
          competitor?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          id?: string
          is_test_data?: boolean | null
          key_points?: Json | null
          last_synced?: string | null
          lead_source?: string | null
          legacy_id?: string | null
          location?: string | null
          metadata?: Json | null
          outcome?: string | null
          priority?: Database["public"]["Enums"]["activity_priority"]
          processed_by_ai_doc?: boolean | null
          related_email?: string | null
          related_id?: string | null
          related_name?: string | null
          related_to?: string | null
          sentiment?: string | null
          status?: string | null
          subject?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          type?: string
          unique_id?: string | null
          updated_at?: string | null
          updated_date?: string | null
          urgency_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "activities_assigned_to_team_fkey"
            columns: ["assigned_to_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_events_archive: {
        Row: {
          created_at: string
          created_date: string | null
          event: Json
          id: string
          session_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_date?: string | null
          event: Json
          id?: string
          session_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_date?: string | null
          event?: Json
          id?: string
          session_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_sessions_archive: {
        Row: {
          created_at: string
          created_date: string | null
          data: Json
          id: string
          session_id: string
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_date?: string | null
          data?: Json
          id?: string
          session_id: string
          tenant_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_date?: string | null
          data?: Json
          id?: string
          session_id?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_campaign: {
        Row: {
          assigned_to: string | null
          campaign_type: string | null
          content: Json | null
          created_at: string | null
          created_date: string | null
          description: string | null
          id: string
          is_test_data: boolean | null
          metadata: Json | null
          name: string
          performance_metrics: Json | null
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          target_audience: Json | null
          target_contacts: Json | null
          tenant_id: string | null
          type: string | null
          updated_at: string | null
          workflow_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          campaign_type?: string | null
          content?: Json | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_test_data?: boolean | null
          metadata?: Json | null
          name: string
          performance_metrics?: Json | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_audience?: Json | null
          target_contacts?: Json | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          campaign_type?: string | null
          content?: Json | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_test_data?: boolean | null
          metadata?: Json | null
          name?: string
          performance_metrics?: Json | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_audience?: Json | null
          target_contacts?: Json | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_campaign_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_campaign_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_campaign_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_campaign_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_campaign_events: {
        Row: {
          attempt_no: number
          campaign_id: string
          contact_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          status: string
          tenant_id: string
        }
        Insert: {
          attempt_no?: number
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          status?: string
          tenant_id: string
        }
        Update: {
          attempt_no?: number
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      ai_campaign_targets: {
        Row: {
          attempt_count: number
          campaign_id: string
          channel: string | null
          completed_at: string | null
          contact_id: string
          created_at: string
          destination: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          started_at: string | null
          status: string
          target_payload: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          campaign_id: string
          channel?: string | null
          completed_at?: string | null
          contact_id: string
          created_at?: string
          destination?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          started_at?: string | null
          status?: string
          target_payload?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          campaign_id?: string
          channel?: string | null
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          destination?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          started_at?: string | null
          status?: string
          target_payload?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_conversation_summaries: {
        Row: {
          conversation_key: string
          created_at: string
          id: string
          metadata: Json | null
          summary: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conversation_key: string
          created_at?: string
          id?: string
          metadata?: Json | null
          summary: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          conversation_key?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          summary?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_summaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_conversation_summaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_conversation_summaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memory_chunks: {
        Row: {
          content: string
          content_hash: string
          created_at: string
          embedding: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          source_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          content: string
          content_hash: string
          created_at?: string
          embedding: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          source_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_hash?: string
          created_at?: string
          embedding?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          source_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_memory_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_memory_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          agent_role: string | null
          category: string
          created_at: string | null
          description: string | null
          display_name: string | null
          id: string
          setting_key: string
          setting_value: Json
          tenant_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          agent_role?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          agent_role?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestion_feedback: {
        Row: {
          comment: string | null
          correction_data: Json | null
          created_at: string | null
          created_date: string | null
          feedback_type: string
          id: string
          outcome_positive: boolean | null
          rating: number | null
          suggestion_id: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          correction_data?: Json | null
          created_at?: string | null
          created_date?: string | null
          feedback_type: string
          id?: string
          outcome_positive?: boolean | null
          rating?: number | null
          suggestion_id: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          correction_data?: Json | null
          created_at?: string | null
          created_date?: string | null
          feedback_type?: string
          id?: string
          outcome_positive?: boolean | null
          rating?: number | null
          suggestion_id?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_feedback_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "ai_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestion_metrics: {
        Row: {
          avg_confidence: number | null
          avg_execution_time_ms: number | null
          avg_feedback_rating: number | null
          avg_review_time_minutes: number | null
          bucket_size: string
          created_at: string | null
          created_date: string | null
          id: string
          negative_outcomes: number | null
          positive_outcomes: number | null
          suggestions_applied: number | null
          suggestions_approved: number | null
          suggestions_expired: number | null
          suggestions_generated: number | null
          suggestions_rejected: number | null
          tenant_id: string
          time_bucket: string
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          avg_confidence?: number | null
          avg_execution_time_ms?: number | null
          avg_feedback_rating?: number | null
          avg_review_time_minutes?: number | null
          bucket_size?: string
          created_at?: string | null
          created_date?: string | null
          id?: string
          negative_outcomes?: number | null
          positive_outcomes?: number | null
          suggestions_applied?: number | null
          suggestions_approved?: number | null
          suggestions_expired?: number | null
          suggestions_generated?: number | null
          suggestions_rejected?: number | null
          tenant_id: string
          time_bucket: string
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          avg_confidence?: number | null
          avg_execution_time_ms?: number | null
          avg_feedback_rating?: number | null
          avg_review_time_minutes?: number | null
          bucket_size?: string
          created_at?: string | null
          created_date?: string | null
          id?: string
          negative_outcomes?: number | null
          positive_outcomes?: number | null
          suggestions_applied?: number | null
          suggestions_approved?: number | null
          suggestions_expired?: number | null
          suggestions_generated?: number | null
          suggestions_rejected?: number | null
          tenant_id?: string
          time_bucket?: string
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_suggestion_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_suggestion_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          action: Json
          applied_at: string | null
          apply_result: Json | null
          confidence: number | null
          created_at: string | null
          created_date: string | null
          execution_time_ms: number | null
          expires_at: string | null
          feedback_comment: string | null
          feedback_rating: number | null
          id: string
          model_version: string | null
          outcome_measured_at: string | null
          outcome_positive: boolean | null
          outcome_tracked: boolean | null
          outcome_type: string | null
          priority: string | null
          reasoning: string | null
          record_id: string | null
          record_name: string | null
          record_type: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          trigger_context: Json | null
          trigger_id: string
          updated_at: string | null
        }
        Insert: {
          action: Json
          applied_at?: string | null
          apply_result?: Json | null
          confidence?: number | null
          created_at?: string | null
          created_date?: string | null
          execution_time_ms?: number | null
          expires_at?: string | null
          feedback_comment?: string | null
          feedback_rating?: number | null
          id?: string
          model_version?: string | null
          outcome_measured_at?: string | null
          outcome_positive?: boolean | null
          outcome_tracked?: boolean | null
          outcome_type?: string | null
          priority?: string | null
          reasoning?: string | null
          record_id?: string | null
          record_name?: string | null
          record_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          trigger_context?: Json | null
          trigger_id: string
          updated_at?: string | null
        }
        Update: {
          action?: Json
          applied_at?: string | null
          apply_result?: Json | null
          confidence?: number | null
          created_at?: string | null
          created_date?: string | null
          execution_time_ms?: number | null
          expires_at?: string | null
          feedback_comment?: string | null
          feedback_rating?: number | null
          id?: string
          model_version?: string | null
          outcome_measured_at?: string | null
          outcome_positive?: boolean | null
          outcome_tracked?: boolean | null
          outcome_type?: string | null
          priority?: string | null
          reasoning?: string | null
          record_id?: string | null
          record_name?: string | null
          record_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          trigger_context?: Json | null
          trigger_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement: {
        Row: {
          content: string
          created_at: string | null
          created_date: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          start_date: string | null
          target_roles: Json | null
          tenant_id: string | null
          title: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_date?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          start_date?: string | null
          target_roles?: Json | null
          tenant_id?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_date?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          start_date?: string | null
          target_roles?: Json | null
          tenant_id?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "announcement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "announcement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key: {
        Row: {
          created_at: string | null
          created_date: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used: string | null
          metadata: Json | null
          name: string
          scopes: Json | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used?: string | null
          metadata?: Json | null
          name: string
          scopes?: Json | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used?: string | null
          metadata?: Json | null
          name?: string
          scopes?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "api_key_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "api_key_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      apikey: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_date: string | null
          description: string | null
          id: string
          is_active: boolean | null
          key_name: string
          key_value: string
          last_used: string | null
          tenant_id: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          key_name: string
          key_value: string
          last_used?: string | null
          tenant_id?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          key_name?: string
          key_value?: string
          last_used?: string | null
          tenant_id?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apikey_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "apikey_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "apikey_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_index: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          archived_data: Json
          created_at: string | null
          created_date: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          tenant_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          archived_data: Json
          created_at?: string | null
          created_date?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          archived_data?: Json
          created_at?: string | null
          created_date?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_index_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "archive_index_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "archive_index_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_refs: {
        Row: {
          content_type: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          r2_key: string
          sha256: string | null
          size_bytes: number | null
          tenant_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          r2_key: string
          sha256?: string | null
          size_bytes?: number | null
          tenant_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          r2_key?: string
          sha256?: string | null
          size_bytes?: number | null
          tenant_id?: string
        }
        Relationships: []
      }
      assignment_history: {
        Row: {
          action: string
          assigned_by: string | null
          assigned_from: string | null
          assigned_to: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          tenant_id: string
        }
        Insert: {
          action?: string
          assigned_by?: string | null
          assigned_from?: string | null
          assigned_to?: string | null
          created_at?: string
          entity_id: string
          entity_type?: string
          id?: string
          note?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          assigned_by?: string | null
          assigned_from?: string | null
          assigned_to?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          created_date: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          request_id: string | null
          tenant_id: string | null
          user_agent: string | null
          user_email: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          created_date?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          request_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_email: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          created_date?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          request_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          billing_address: Json
          billing_contact_name: string | null
          billing_email: string | null
          billing_exempt: boolean
          billing_mode: string
          company_name: string | null
          created_at: string
          currency: string
          exempt_reason: string | null
          exempt_set_at: string | null
          exempt_set_by: string | null
          id: string
          notes: string | null
          payment_provider: string
          provider_customer_id: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_address?: Json
          billing_contact_name?: string | null
          billing_email?: string | null
          billing_exempt?: boolean
          billing_mode?: string
          company_name?: string | null
          created_at?: string
          currency?: string
          exempt_reason?: string | null
          exempt_set_at?: string | null
          exempt_set_by?: string | null
          id?: string
          notes?: string | null
          payment_provider?: string
          provider_customer_id?: string | null
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_address?: Json
          billing_contact_name?: string | null
          billing_email?: string | null
          billing_exempt?: boolean
          billing_mode?: string
          company_name?: string | null
          created_at?: string
          currency?: string
          exempt_reason?: string | null
          exempt_set_at?: string | null
          exempt_set_by?: string | null
          id?: string
          notes?: string | null
          payment_provider?: string
          provider_customer_id?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "billing_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "billing_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload_json: Json
          request_id: string | null
          source: string
          tenant_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload_json?: Json
          request_id?: string | null
          source: string
          tenant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload_json?: Json
          request_id?: string | null
          source?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          amount_cents: number
          billing_interval: string
          code: string
          created_at: string
          currency: string
          description: string | null
          features_json: Json
          id: string
          included_seats: number
          is_active: boolean
          module_entitlements_json: Json
          name: string
          provider_price_id_base: string | null
          provider_price_id_seat: string | null
          provider_product_id: string | null
          seat_limit: number | null
          seat_unit_amount_cents: number | null
          trial_days: number
          updated_at: string
          usage_rules_json: Json
        }
        Insert: {
          amount_cents: number
          billing_interval: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features_json?: Json
          id?: string
          included_seats?: number
          is_active?: boolean
          module_entitlements_json?: Json
          name: string
          provider_price_id_base?: string | null
          provider_price_id_seat?: string | null
          provider_product_id?: string | null
          seat_limit?: number | null
          seat_unit_amount_cents?: number | null
          trial_days?: number
          updated_at?: string
          usage_rules_json?: Json
        }
        Update: {
          amount_cents?: number
          billing_interval?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features_json?: Json
          id?: string
          included_seats?: number
          is_active?: boolean
          module_entitlements_json?: Json
          name?: string
          provider_price_id_base?: string | null
          provider_price_id_seat?: string | null
          provider_product_id?: string | null
          seat_limit?: number | null
          seat_unit_amount_cents?: number | null
          trial_days?: number
          updated_at?: string
          usage_rules_json?: Json
        }
        Relationships: []
      }
      bizdev_sources: {
        Row: {
          account_id: string | null
          account_name: string | null
          address_line_1: string | null
          address_line_2: string | null
          archived_at: string | null
          assigned_to: string | null
          assigned_to_team: string | null
          batch_id: string | null
          city: string | null
          company_name: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_date: string | null
          dba_name: string | null
          email: string | null
          id: string
          industry: string | null
          industry_license: string | null
          is_test_data: boolean | null
          lead_ids: Json | null
          leads_generated: number | null
          license_expiry_date: string | null
          license_status: string | null
          metadata: Json | null
          notes: string | null
          opportunities_created: number | null
          phone_number: string | null
          postal_code: string | null
          priority: string | null
          revenue_generated: number | null
          source: string
          source_type: string | null
          source_url: string | null
          state_province: string | null
          status: string | null
          tags: Json | null
          tenant_id: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          batch_id?: string | null
          city?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          dba_name?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          industry_license?: string | null
          is_test_data?: boolean | null
          lead_ids?: Json | null
          leads_generated?: number | null
          license_expiry_date?: string | null
          license_status?: string | null
          metadata?: Json | null
          notes?: string | null
          opportunities_created?: number | null
          phone_number?: string | null
          postal_code?: string | null
          priority?: string | null
          revenue_generated?: number | null
          source: string
          source_type?: string | null
          source_url?: string | null
          state_province?: string | null
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          batch_id?: string | null
          city?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          dba_name?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          industry_license?: string | null
          is_test_data?: boolean | null
          lead_ids?: Json | null
          leads_generated?: number | null
          license_expiry_date?: string | null
          license_status?: string | null
          metadata?: Json | null
          notes?: string | null
          opportunities_created?: number | null
          phone_number?: string | null
          postal_code?: string | null
          priority?: string | null
          revenue_generated?: number | null
          source?: string
          source_type?: string | null
          source_url?: string | null
          state_province?: string | null
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bizdev_source_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "bizdev_source_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "bizdev_source_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bizdev_sources_assigned_to_team_fkey"
            columns: ["assigned_to_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bizdev_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "bizdev_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "bizdev_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bizdev_sources_account"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_ips: {
        Row: {
          blocked_at: string
          blocked_by: string
          created_at: string
          expires_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          reason: string
          unblocked_at: string | null
          updated_at: string
        }
        Insert: {
          blocked_at?: string
          blocked_by: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address: unknown
          is_active?: boolean
          reason: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Update: {
          blocked_at?: string
          blocked_by?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          reason?: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      booking_sessions: {
        Row: {
          activity_id: string | null
          calcom_booking_id: string
          calcom_event_type_id: number | null
          cancellation_reason: string | null
          contact_id: string | null
          created_at: string
          credit_id: string | null
          id: string
          lead_id: string | null
          scheduled_end: string
          scheduled_start: string
          status: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          calcom_booking_id: string
          calcom_event_type_id?: number | null
          cancellation_reason?: string | null
          contact_id?: string | null
          created_at?: string
          credit_id?: string | null
          id?: string
          lead_id?: string | null
          scheduled_end: string
          scheduled_start: string
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          calcom_booking_id?: string
          calcom_event_type_id?: number | null
          cancellation_reason?: string | null
          contact_id?: string | null
          created_at?: string
          credit_id?: string | null
          id?: string
          lead_id?: string | null
          scheduled_end?: string
          scheduled_start?: string
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_sessions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_activity_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_calendar_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "session_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_light"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "booking_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "booking_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      braid_audit_log: {
        Row: {
          braid_file: string | null
          braid_function: string
          cache_hit: boolean | null
          confirmation_provided: boolean | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          error_type: string | null
          execution_time_ms: number | null
          id: string
          input_args: Json | null
          ip_address: string | null
          is_dry_run: boolean | null
          policy: string
          rate_limit_remaining: number | null
          rate_limit_window: string | null
          request_id: string | null
          requires_confirmation: boolean | null
          result_tag: string | null
          result_value: Json | null
          tenant_id: string
          tool_class: string | null
          tool_name: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          braid_file?: string | null
          braid_function: string
          cache_hit?: boolean | null
          confirmation_provided?: boolean | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          error_type?: string | null
          execution_time_ms?: number | null
          id?: string
          input_args?: Json | null
          ip_address?: string | null
          is_dry_run?: boolean | null
          policy: string
          rate_limit_remaining?: number | null
          rate_limit_window?: string | null
          request_id?: string | null
          requires_confirmation?: boolean | null
          result_tag?: string | null
          result_value?: Json | null
          tenant_id: string
          tool_class?: string | null
          tool_name: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          braid_file?: string | null
          braid_function?: string
          cache_hit?: boolean | null
          confirmation_provided?: boolean | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          error_type?: string | null
          execution_time_ms?: number | null
          id?: string
          input_args?: Json | null
          ip_address?: string | null
          is_dry_run?: boolean | null
          policy?: string
          rate_limit_remaining?: number | null
          rate_limit_window?: string | null
          request_id?: string | null
          requires_confirmation?: boolean | null
          result_tag?: string | null
          result_value?: Json | null
          tenant_id?: string
          tool_class?: string | null
          tool_name?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "braid_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "braid_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "braid_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      cache: {
        Row: {
          cache_key: string
          cache_value: Json
          created_at: string | null
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          cache_value: Json
          created_at?: string | null
          expires_at: string
          id?: string
        }
        Update: {
          cache_key?: string
          cache_value?: Json
          created_at?: string | null
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      care_playbook: {
        Row: {
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          description: string | null
          execution_mode: string
          id: string
          is_enabled: boolean
          max_executions_per_day: number | null
          name: string
          priority: number
          shadow_mode: boolean
          steps: Json
          tenant_id: string
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_mode?: string
          id?: string
          is_enabled?: boolean
          max_executions_per_day?: number | null
          name: string
          priority?: number
          shadow_mode?: boolean
          steps?: Json
          tenant_id: string
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_mode?: string
          id?: string
          is_enabled?: boolean
          max_executions_per_day?: number | null
          name?: string
          priority?: number
          shadow_mode?: boolean
          steps?: Json
          tenant_id?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_playbook_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "care_playbook_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "care_playbook_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      care_playbook_execution: {
        Row: {
          completed_at: string | null
          current_step: number | null
          entity_id: string
          entity_type: string
          id: string
          next_step_at: string | null
          playbook_id: string
          shadow_mode: boolean
          started_at: string
          status: string
          step_results: Json | null
          stopped_reason: string | null
          tenant_id: string
          tokens_used: number
          total_steps: number
          trigger_type: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: number | null
          entity_id: string
          entity_type: string
          id?: string
          next_step_at?: string | null
          playbook_id: string
          shadow_mode?: boolean
          started_at?: string
          status?: string
          step_results?: Json | null
          stopped_reason?: string | null
          tenant_id: string
          tokens_used?: number
          total_steps: number
          trigger_type: string
        }
        Update: {
          completed_at?: string | null
          current_step?: number | null
          entity_id?: string
          entity_type?: string
          id?: string
          next_step_at?: string | null
          playbook_id?: string
          shadow_mode?: boolean
          started_at?: string
          status?: string
          step_results?: Json | null
          stopped_reason?: string | null
          tenant_id?: string
          tokens_used?: number
          total_steps?: number
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_playbook_execution_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "care_playbook"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_playbook_execution_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "care_playbook_execution_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "care_playbook_execution_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      care_workflow_config: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          name: string | null
          shadow_mode: boolean | null
          state_write_enabled: boolean | null
          tenant_id: string
          updated_at: string | null
          webhook_max_retries: number | null
          webhook_secret: string | null
          webhook_timeout_ms: number | null
          webhook_url: string | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          name?: string | null
          shadow_mode?: boolean | null
          state_write_enabled?: boolean | null
          tenant_id: string
          updated_at?: string | null
          webhook_max_retries?: number | null
          webhook_secret?: string | null
          webhook_timeout_ms?: number | null
          webhook_url?: string | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          name?: string | null
          shadow_mode?: boolean | null
          state_write_enabled?: boolean | null
          tenant_id?: string
          updated_at?: string | null
          webhook_max_retries?: number | null
          webhook_secret?: string | null
          webhook_timeout_ms?: number | null
          webhook_url?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_workflow_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "care_workflow_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "care_workflow_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_workflow_config_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow: {
        Row: {
          account_id: string | null
          amount: number
          category: string | null
          created_at: string | null
          created_date: string | null
          description: string | null
          id: string
          metadata: Json | null
          tenant_id: string | null
          transaction_date: string
          transaction_type: string
          type: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          transaction_date: string
          transaction_type: string
          type?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          transaction_date?: string
          transaction_type?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "cash_flow_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "cash_flow_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint: {
        Row: {
          checkpoint_data: Json
          created_at: string | null
          created_by: string | null
          created_date: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          tenant_id: string | null
          version: number | null
        }
        Insert: {
          checkpoint_data: Json
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          version?: number | null
        }
        Update: {
          checkpoint_data?: Json
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "checkpoint_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "checkpoint_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requirement: {
        Row: {
          assigned_to: string | null
          assigned_to_employee_id: string | null
          created_at: string | null
          created_date: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          priority: string | null
          status: string | null
          tenant_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_employee_id?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string | null
          tenant_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_employee_id?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_requirement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "client_requirement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "client_requirement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      communications_entity_links: {
        Row: {
          confidence: number | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          link_scope: string
          message_id: string | null
          metadata: Json
          source: string
          tenant_id: string
          thread_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          link_scope?: string
          message_id?: string | null
          metadata?: Json
          source?: string
          tenant_id: string
          thread_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          link_scope?: string
          message_id?: string | null
          metadata?: Json
          source?: string
          tenant_id?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_entity_links_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "communications_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_entity_links_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communications_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communications_lead_capture_queue: {
        Row: {
          created_at: string
          id: string
          mailbox_address: string | null
          mailbox_id: string | null
          message_id: string | null
          metadata: Json
          normalized_subject: string | null
          reason: string
          sender_domain: string | null
          sender_email: string
          sender_name: string | null
          status: string
          subject: string | null
          tenant_id: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mailbox_address?: string | null
          mailbox_id?: string | null
          message_id?: string | null
          metadata?: Json
          normalized_subject?: string | null
          reason?: string
          sender_domain?: string | null
          sender_email: string
          sender_name?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mailbox_address?: string | null
          mailbox_id?: string | null
          message_id?: string | null
          metadata?: Json
          normalized_subject?: string | null
          reason?: string
          sender_domain?: string | null
          sender_email?: string
          sender_name?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_lead_capture_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "communications_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_lead_capture_queue_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communications_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communications_messages: {
        Row: {
          activity_id: string | null
          bcc: Json
          cc: Json
          created_at: string
          direction: string
          headers: Json
          html_body: string | null
          id: string
          internet_message_id: string
          metadata: Json
          provider_cursor: string | null
          raw_source: string | null
          received_at: string | null
          recipients: Json
          sender_email: string | null
          sender_name: string | null
          subject: string | null
          tenant_id: string
          text_body: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          bcc?: Json
          cc?: Json
          created_at?: string
          direction?: string
          headers?: Json
          html_body?: string | null
          id?: string
          internet_message_id: string
          metadata?: Json
          provider_cursor?: string | null
          raw_source?: string | null
          received_at?: string | null
          recipients?: Json
          sender_email?: string | null
          sender_name?: string | null
          subject?: string | null
          tenant_id: string
          text_body?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          bcc?: Json
          cc?: Json
          created_at?: string
          direction?: string
          headers?: Json
          html_body?: string | null
          id?: string
          internet_message_id?: string
          metadata?: Json
          provider_cursor?: string | null
          raw_source?: string | null
          received_at?: string | null
          recipients?: Json
          sender_email?: string | null
          sender_name?: string | null
          subject?: string | null
          tenant_id?: string
          text_body?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communications_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communications_threads: {
        Row: {
          created_at: string
          first_message_at: string | null
          id: string
          last_message_at: string | null
          mailbox_address: string | null
          mailbox_id: string
          metadata: Json
          normalized_subject: string | null
          origin: string
          participants: Json
          status: string
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_message_at?: string | null
          id?: string
          last_message_at?: string | null
          mailbox_address?: string | null
          mailbox_id: string
          metadata?: Json
          normalized_subject?: string | null
          origin?: string
          participants?: Json
          status?: string
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_message_at?: string | null
          id?: string
          last_message_at?: string | null
          mailbox_address?: string | null
          mailbox_id?: string
          metadata?: Json
          normalized_subject?: string | null
          origin?: string
          participants?: Json
          status?: string
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_history: {
        Row: {
          changed_by: string | null
          contact_id: string | null
          created_at: string | null
          created_date: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          tenant_id: string | null
        }
        Insert: {
          changed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_date?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string | null
        }
        Update: {
          changed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_date?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "contact_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "contact_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string | null
          account_industry: string | null
          account_name: string | null
          activity_metadata: Json | null
          address_1: string | null
          address_2: string | null
          ai_action: string | null
          ai_doc_source_type: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          assigned_to_team: string | null
          city: string | null
          country: string | null
          created_at: string | null
          created_date: string | null
          department: string | null
          description: string | null
          email: string | null
          first_name: string | null
          id: string
          is_test_data: boolean | null
          job_title: string | null
          last_contacted: string | null
          last_name: string | null
          last_synced: string | null
          lead_source: string | null
          legacy_id: string | null
          metadata: Json | null
          mobile: string | null
          next_action: string | null
          notes: string | null
          phone: string | null
          processed_by_ai_doc: boolean | null
          score: number | null
          score_reason: string | null
          source_id: string | null
          state: string | null
          status: string | null
          tags: string[] | null
          tags_jsonb_old: Json | null
          tenant_id: string | null
          title: string | null
          unique_id: string | null
          updated_at: string | null
          worker_role: string | null
          zip: string | null
        }
        Insert: {
          account_id?: string | null
          account_industry?: string | null
          account_name?: string | null
          activity_metadata?: Json | null
          address_1?: string | null
          address_2?: string | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          assigned_to_team?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          department?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_test_data?: boolean | null
          job_title?: string | null
          last_contacted?: string | null
          last_name?: string | null
          last_synced?: string | null
          lead_source?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          mobile?: string | null
          next_action?: string | null
          notes?: string | null
          phone?: string | null
          processed_by_ai_doc?: boolean | null
          score?: number | null
          score_reason?: string | null
          source_id?: string | null
          state?: string | null
          status?: string | null
          tags?: string[] | null
          tags_jsonb_old?: Json | null
          tenant_id?: string | null
          title?: string | null
          unique_id?: string | null
          updated_at?: string | null
          worker_role?: string | null
          zip?: string | null
        }
        Update: {
          account_id?: string | null
          account_industry?: string | null
          account_name?: string | null
          activity_metadata?: Json | null
          address_1?: string | null
          address_2?: string | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          assigned_to_team?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          department?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_test_data?: boolean | null
          job_title?: string | null
          last_contacted?: string | null
          last_name?: string | null
          last_synced?: string | null
          lead_source?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          mobile?: string | null
          next_action?: string | null
          notes?: string | null
          phone?: string | null
          processed_by_ai_doc?: boolean | null
          score?: number | null
          score_reason?: string | null
          source_id?: string | null
          state?: string | null
          status?: string | null
          tags?: string[] | null
          tags_jsonb_old?: Json | null
          tenant_id?: string | null
          title?: string | null
          unique_id?: string | null
          updated_at?: string | null
          worker_role?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contacts_assigned_to_team_fkey"
            columns: ["assigned_to_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_date: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_date?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_date?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_messages_conversation"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_name: string
          created_date: string | null
          id: string
          metadata: Json | null
          status: string | null
          tenant_id: string
          title: string | null
          topic: string | null
          updated_date: string | null
        }
        Insert: {
          agent_name?: string
          created_date?: string | null
          id?: string
          metadata?: Json | null
          status?: string | null
          tenant_id: string
          title?: string | null
          topic?: string | null
          updated_date?: string | null
        }
        Update: {
          agent_name?: string
          created_date?: string | null
          id?: string
          metadata?: Json | null
          status?: string | null
          tenant_id?: string
          title?: string | null
          topic?: string | null
          updated_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_conversations_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_conversations_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_conversations_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job: {
        Row: {
          created_at: string | null
          created_date: string | null
          function_name: string
          id: string
          is_active: boolean | null
          last_run: string | null
          metadata: Json | null
          name: string
          next_run: string | null
          schedule: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          function_name: string
          id?: string
          is_active?: boolean | null
          last_run?: string | null
          metadata?: Json | null
          name: string
          next_run?: string | null
          schedule: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          function_name?: string
          id?: string
          is_active?: boolean | null
          last_run?: string | null
          metadata?: Json | null
          name?: string
          next_run?: string | null
          schedule?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cron_job_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "cron_job_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "cron_job_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_care_state: {
        Row: {
          care_state: string
          created_at: string
          entity_id: string
          entity_type: string
          escalation_status: string | null
          hands_off_enabled: boolean
          id: string
          last_signal_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          care_state: string
          created_at?: string
          entity_id: string
          entity_type: string
          escalation_status?: string | null
          hands_off_enabled?: boolean
          id?: string
          last_signal_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          care_state?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          escalation_status?: string | null
          hands_off_enabled?: boolean
          id?: string
          last_signal_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_care_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_care_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_care_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_care_state_history: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          from_state: string | null
          id: string
          meta: Json | null
          reason: string
          tenant_id: string
          to_state: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          from_state?: string | null
          id?: string
          meta?: Json | null
          reason: string
          tenant_id: string
          to_state?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          from_state?: string | null
          id?: string
          meta?: Json | null
          reason?: string
          tenant_id?: string
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_care_state_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_care_state_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_care_state_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_metrics: {
        Row: {
          closed_deals: number | null
          created_at: string | null
          created_date: string | null
          id: string
          metadata: Json | null
          metric_date: string
          new_deals: number | null
          pipeline_value: number | null
          tenant_id: string | null
          total_revenue: number | null
        }
        Insert: {
          closed_deals?: number | null
          created_at?: string | null
          created_date?: string | null
          id?: string
          metadata?: Json | null
          metric_date: string
          new_deals?: number | null
          pipeline_value?: number | null
          tenant_id?: string | null
          total_revenue?: number | null
        }
        Update: {
          closed_deals?: number | null
          created_at?: string | null
          created_date?: string | null
          id?: string
          metadata?: Json | null
          metric_date?: string
          new_deals?: number | null
          pipeline_value?: number | null
          tenant_id?: string | null
          total_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_sales_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "daily_sales_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "daily_sales_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      devai_approvals: {
        Row: {
          after_snapshot: Json | null
          approved_at: string | null
          approved_by: string | null
          before_snapshot: Json | null
          changed_files: Json | null
          created_at: string
          diff: string | null
          error: string | null
          executed_at: string | null
          id: string
          note: string | null
          preview: Json | null
          rejected_reason: string | null
          requested_by: string | null
          status: string
          tool_args: Json | null
          tool_name: string
          updated_at: string
        }
        Insert: {
          after_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          before_snapshot?: Json | null
          changed_files?: Json | null
          created_at?: string
          diff?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          note?: string | null
          preview?: Json | null
          rejected_reason?: string | null
          requested_by?: string | null
          status?: string
          tool_args?: Json | null
          tool_name: string
          updated_at?: string
        }
        Update: {
          after_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          before_snapshot?: Json | null
          changed_files?: Json | null
          created_at?: string
          diff?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          note?: string | null
          preview?: Json | null
          rejected_reason?: string | null
          requested_by?: string | null
          status?: string
          tool_args?: Json | null
          tool_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devai_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "devai_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devai_approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "devai_approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      devai_audit: {
        Row: {
          action: string
          actor: string | null
          approval_id: string | null
          created_at: string
          details: Json | null
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          approval_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          approval_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devai_audit_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "devai_audit_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devai_audit_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "devai_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      devai_health_alerts: {
        Row: {
          affected_endpoints: string[] | null
          auto_detected: boolean | null
          category: string
          created_at: string
          details: Json | null
          detected_at: string
          error_count: number | null
          false_positive: boolean | null
          id: string
          recommendation: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          summary: string
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_endpoints?: string[] | null
          auto_detected?: boolean | null
          category: string
          created_at?: string
          details?: Json | null
          detected_at?: string
          error_count?: number | null
          false_positive?: boolean | null
          id?: string
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          summary: string
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_endpoints?: string[] | null
          auto_detected?: boolean | null
          category?: string
          created_at?: string
          details?: Json | null
          detected_at?: string
          error_count?: number | null
          false_positive?: boolean | null
          id?: string
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          summary?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devai_health_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "devai_health_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      documentation: {
        Row: {
          author: string | null
          category: string | null
          content: string
          created_at: string | null
          id: string
          is_published: boolean | null
          metadata: Json | null
          tags: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          metadata?: Json | null
          tags?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          metadata?: Json | null
          tags?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_date: string | null
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          metadata: Json | null
          name: string
          related_id: string | null
          related_type: string | null
          storage_path: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          name: string
          related_id?: string | null
          related_type?: string | null
          storage_path?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          related_id?: string | null
          related_type?: string | null
          storage_path?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      docuseal_submissions: {
        Row: {
          audit_log_url: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          docuseal_submission_id: string
          docuseal_template_id: string
          error_message: string | null
          id: string
          last_event_at: string | null
          last_event_id: string | null
          metadata: Json
          recipient_email: string
          recipient_name: string | null
          related_id: string
          related_to: string
          sent_at: string | null
          signed_document_url: string | null
          status: string
          supabase_storage_path: string | null
          template_name: string | null
          tenant_id: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          audit_log_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          docuseal_submission_id: string
          docuseal_template_id: string
          error_message?: string | null
          id?: string
          last_event_at?: string | null
          last_event_id?: string | null
          metadata?: Json
          recipient_email: string
          recipient_name?: string | null
          related_id: string
          related_to: string
          sent_at?: string | null
          signed_document_url?: string | null
          status?: string
          supabase_storage_path?: string | null
          template_name?: string | null
          tenant_id: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          audit_log_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          docuseal_submission_id?: string
          docuseal_template_id?: string
          error_message?: string | null
          id?: string
          last_event_at?: string | null
          last_event_id?: string | null
          metadata?: Json
          recipient_email?: string
          recipient_name?: string | null
          related_id?: string
          related_to?: string
          sent_at?: string | null
          signed_document_url?: string | null
          status?: string
          supabase_storage_path?: string | null
          template_name?: string | null
          tenant_id?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docuseal_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "docuseal_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "docuseal_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      email_template: {
        Row: {
          body: string
          created_at: string | null
          created_date: string | null
          id: string
          metadata: Json | null
          name: string
          subject: string
          tenant_id: string | null
          type: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body: string
          created_at?: string | null
          created_date?: string | null
          id?: string
          metadata?: Json | null
          name: string
          subject: string
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body?: string
          created_at?: string | null
          created_date?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          subject?: string
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_template_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "email_template_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "email_template_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string | null
          created_date: string | null
          department: string | null
          email: string | null
          first_name: string | null
          id: string
          is_test_data: boolean | null
          last_name: string | null
          metadata: Json | null
          phone: string | null
          reports_to: string | null
          role: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
          whatsapp_enabled: boolean
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          department?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_test_data?: boolean | null
          last_name?: string | null
          metadata?: Json | null
          phone?: string | null
          reports_to?: string | null
          role?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          whatsapp_enabled?: boolean
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          department?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_test_data?: boolean | null
          last_name?: string | null
          metadata?: Json | null
          phone?: string | null
          reports_to?: string | null
          role?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          whatsapp_enabled?: boolean
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_labels: {
        Row: {
          created_at: string | null
          created_date: string | null
          custom_label: string
          custom_label_singular: string | null
          entity_key: string
          id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          custom_label: string
          custom_label_singular?: string | null
          entity_key: string
          id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          custom_label?: string
          custom_label_singular?: string | null
          entity_key?: string
          id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "entity_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "entity_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_transitions: {
        Row: {
          action: string
          from_id: string
          from_table: string
          id: string
          performed_at: string
          performed_by: string | null
          snapshot: Json | null
          tenant_id: string
          to_id: string
          to_table: string
        }
        Insert: {
          action: string
          from_id: string
          from_table: string
          id?: string
          performed_at?: string
          performed_by?: string | null
          snapshot?: Json | null
          tenant_id: string
          to_id: string
          to_table: string
        }
        Update: {
          action?: string
          from_id?: string
          from_table?: string
          id?: string
          performed_at?: string
          performed_by?: string | null
          snapshot?: Json | null
          tenant_id?: string
          to_id?: string
          to_table?: string
        }
        Relationships: []
      }
      field_customization: {
        Row: {
          created_at: string | null
          entity_type: string
          field_name: string
          id: string
          is_required: boolean | null
          is_visible: boolean | null
          label: string
          metadata: Json | null
          options: Json | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          field_name: string
          id?: string
          is_required?: boolean | null
          is_visible?: boolean | null
          label: string
          metadata?: Json | null
          options?: Json | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          field_name?: string
          id?: string
          is_required?: boolean | null
          is_visible?: boolean | null
          label?: string
          metadata?: Json | null
          options?: Json | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_customization_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "field_customization_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "field_customization_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      file: {
        Row: {
          created_at: string | null
          created_date: string | null
          filename: string
          filepath: string
          filesize: number | null
          id: string
          metadata: Json | null
          mimetype: string | null
          related_id: string | null
          related_type: string | null
          tenant_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          filename: string
          filepath: string
          filesize?: number | null
          id?: string
          metadata?: Json | null
          mimetype?: string | null
          related_id?: string | null
          related_type?: string | null
          tenant_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          filename?: string
          filepath?: string
          filesize?: number | null
          id?: string
          metadata?: Json | null
          mimetype?: string | null
          related_id?: string | null
          related_type?: string | null
          tenant_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "file_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "file_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_content: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          id: string
          is_published: boolean | null
          metadata: Json | null
          order_index: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          metadata?: Json | null
          order_index?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          metadata?: Json | null
          order_index?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      import_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_date: string | null
          entity_type: string
          error_count: number | null
          errors: Json | null
          filename: string | null
          id: string
          metadata: Json | null
          status: string | null
          success_count: number | null
          tenant_id: string | null
          total_records: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_date?: string | null
          entity_type: string
          error_count?: number | null
          errors?: Json | null
          filename?: string | null
          id?: string
          metadata?: Json | null
          status?: string | null
          success_count?: number | null
          tenant_id?: string | null
          total_records?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_date?: string | null
          entity_type?: string
          error_count?: number | null
          errors?: Json | null
          filename?: string | null
          id?: string
          metadata?: Json | null
          status?: string | null
          success_count?: number | null
          tenant_id?: string | null
          total_records?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "import_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "import_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          item_type: string
          metadata: Json
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          item_type: string
          metadata?: Json
          quantity?: number
          unit_price_cents: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          item_type?: string
          metadata?: Json
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid_cents: number
          balance_due_cents: number
          created_at: string
          currency: string
          due_date: string
          external_invoice_id: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_number: string
          issue_date: string
          memo: string | null
          metadata: Json
          pdf_url: string | null
          status: string
          subscription_id: string | null
          subtotal_cents: number
          tax_total_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          amount_paid_cents?: number
          balance_due_cents?: number
          created_at?: string
          currency?: string
          due_date: string
          external_invoice_id?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          memo?: string | null
          metadata?: Json
          pdf_url?: string | null
          status?: string
          subscription_id?: string | null
          subtotal_cents?: number
          tax_total_cents?: number
          tenant_id: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          amount_paid_cents?: number
          balance_due_cents?: number
          created_at?: string
          currency?: string
          due_date?: string
          external_invoice_id?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          memo?: string | null
          metadata?: Json
          pdf_url?: string | null
          status?: string
          subscription_id?: string | null
          subtotal_cents?: number
          tax_total_cents?: number
          tenant_id?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          created_date: string | null
          field_name: string
          id: string
          lead_id: string | null
          new_value: string | null
          old_value: string | null
          tenant_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          created_date?: string | null
          field_name: string
          id?: string
          lead_id?: string | null
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          created_date?: string | null
          field_name?: string
          id?: string
          lead_id?: string | null
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_light"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "lead_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "lead_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          account_id: string | null
          activity_metadata: Json | null
          address_1: string | null
          address_2: string | null
          ai_action: string | null
          ai_doc_source_type: string | null
          assigned_to: string | null
          assigned_to_team: string | null
          city: string | null
          company: string | null
          conversion_probability: number | null
          country: string | null
          created_at: string | null
          created_date: string | null
          description: string | null
          do_not_call: boolean | null
          do_not_text: boolean | null
          email: string | null
          estimated_value: number | null
          first_name: string | null
          id: string
          is_test_data: boolean | null
          job_title: string | null
          last_contacted: string | null
          last_name: string | null
          last_synced: string | null
          lead_type: string | null
          legacy_id: string | null
          metadata: Json | null
          next_action: string | null
          person_id: string | null
          phone: string | null
          processed_by_ai_doc: boolean | null
          qualification_status: string | null
          score: number | null
          score_reason: string | null
          source: string | null
          source_id: string | null
          state: string | null
          status: string | null
          tags: string[] | null
          tags_jsonb_old: Json | null
          tenant_id: string
          title: string | null
          unique_id: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          account_id?: string | null
          activity_metadata?: Json | null
          address_1?: string | null
          address_2?: string | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          city?: string | null
          company?: string | null
          conversion_probability?: number | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          do_not_call?: boolean | null
          do_not_text?: boolean | null
          email?: string | null
          estimated_value?: number | null
          first_name?: string | null
          id?: string
          is_test_data?: boolean | null
          job_title?: string | null
          last_contacted?: string | null
          last_name?: string | null
          last_synced?: string | null
          lead_type?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          next_action?: string | null
          person_id?: string | null
          phone?: string | null
          processed_by_ai_doc?: boolean | null
          qualification_status?: string | null
          score?: number | null
          score_reason?: string | null
          source?: string | null
          source_id?: string | null
          state?: string | null
          status?: string | null
          tags?: string[] | null
          tags_jsonb_old?: Json | null
          tenant_id: string
          title?: string | null
          unique_id?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          account_id?: string | null
          activity_metadata?: Json | null
          address_1?: string | null
          address_2?: string | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          city?: string | null
          company?: string | null
          conversion_probability?: number | null
          country?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          do_not_call?: boolean | null
          do_not_text?: boolean | null
          email?: string | null
          estimated_value?: number | null
          first_name?: string | null
          id?: string
          is_test_data?: boolean | null
          job_title?: string | null
          last_contacted?: string | null
          last_name?: string | null
          last_synced?: string | null
          lead_type?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          next_action?: string | null
          person_id?: string | null
          phone?: string | null
          processed_by_ai_doc?: boolean | null
          qualification_status?: string | null
          score?: number | null
          score_reason?: string | null
          source?: string | null
          source_id?: string | null
          state?: string | null
          status?: string | null
          tags?: string[] | null
          tags_jsonb_old?: Json | null
          tenant_id?: string
          title?: string | null
          unique_id?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_team_fkey"
            columns: ["assigned_to_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_activity_logs: {
        Row: {
          attempt: number | null
          capability: string
          container_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          external_id: string | null
          id: string
          intent: string | null
          model: string
          node_id: string | null
          provider: string
          request_id: string | null
          status: string
          task_id: string | null
          tenant_id: string | null
          tools_called: string[]
          total_attempts: number | null
          usage: Json | null
        }
        Insert: {
          attempt?: number | null
          capability: string
          container_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          external_id?: string | null
          id?: string
          intent?: string | null
          model: string
          node_id?: string | null
          provider: string
          request_id?: string | null
          status?: string
          task_id?: string | null
          tenant_id?: string | null
          tools_called?: string[]
          total_attempts?: number | null
          usage?: Json | null
        }
        Update: {
          attempt?: number | null
          capability?: string
          container_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          external_id?: string | null
          id?: string
          intent?: string | null
          model?: string
          node_id?: string | null
          provider?: string
          request_id?: string | null
          status?: string
          task_id?: string | null
          tenant_id?: string | null
          tools_called?: string[]
          total_attempts?: number | null
          usage?: Json | null
        }
        Relationships: []
      }
      modulesettings: {
        Row: {
          created_at: string | null
          created_date: string | null
          id: string
          is_enabled: boolean | null
          module_name: string
          settings: Json | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          is_enabled?: boolean | null
          module_name: string
          settings?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          is_enabled?: boolean | null
          module_name?: string
          settings?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modulesettings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "modulesettings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "modulesettings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      name_to_employee: {
        Row: {
          created_at: string | null
          created_date: string | null
          employee_id: string | null
          employee_name: string | null
          id: string
          name_variation: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          name_variation: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          name_variation?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_name_to_employee_employee"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_name_to_employee_employee"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fk_name_to_employee_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_name_to_employee_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_name_to_employee_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      note: {
        Row: {
          content: string | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          id: string
          metadata: Json | null
          related_id: string | null
          related_type: string | null
          tenant_id: string | null
          title: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          id?: string
          metadata?: Json | null
          related_id?: string | null
          related_type?: string | null
          tenant_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          id?: string
          metadata?: Json | null
          related_id?: string | null
          related_type?: string | null
          tenant_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "note_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "note_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          created_date: string | null
          id: string
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          tenant_id: string | null
          title: string | null
          type: string
          user_email: string
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          title?: string | null
          type: string
          user_email: string
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          title?: string | null
          type?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          account_id: string | null
          activity_metadata: Json | null
          ai_action: string | null
          ai_doc_source_type: string | null
          ai_health: string | null
          amount: number | null
          assigned_to: string | null
          assigned_to_team: string | null
          close_date: string | null
          competitor: string | null
          competitors: Json | null
          contact_id: string | null
          created_at: string | null
          created_date: string | null
          days_in_stage: number | null
          description: string | null
          expected_revenue: number | null
          id: string
          is_test_data: boolean | null
          last_activity_date: string | null
          last_synced: string | null
          lead_id: string | null
          lead_source: string | null
          legacy_id: string | null
          metadata: Json | null
          name: string
          next_action: string | null
          next_step: string | null
          notes: string | null
          probability: number | null
          processed_by_ai_doc: boolean | null
          risk_factors: Json | null
          score: number | null
          score_reason: string | null
          source: string | null
          stage: string | null
          tags: string[] | null
          tags_jsonb_old: Json | null
          tenant_id: string | null
          type: string | null
          unique_id: string | null
          updated_at: string | null
          win_probability: number | null
        }
        Insert: {
          account_id?: string | null
          activity_metadata?: Json | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          ai_health?: string | null
          amount?: number | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          close_date?: string | null
          competitor?: string | null
          competitors?: Json | null
          contact_id?: string | null
          created_at?: string | null
          created_date?: string | null
          days_in_stage?: number | null
          description?: string | null
          expected_revenue?: number | null
          id?: string
          is_test_data?: boolean | null
          last_activity_date?: string | null
          last_synced?: string | null
          lead_id?: string | null
          lead_source?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          name: string
          next_action?: string | null
          next_step?: string | null
          notes?: string | null
          probability?: number | null
          processed_by_ai_doc?: boolean | null
          risk_factors?: Json | null
          score?: number | null
          score_reason?: string | null
          source?: string | null
          stage?: string | null
          tags?: string[] | null
          tags_jsonb_old?: Json | null
          tenant_id?: string | null
          type?: string | null
          unique_id?: string | null
          updated_at?: string | null
          win_probability?: number | null
        }
        Update: {
          account_id?: string | null
          activity_metadata?: Json | null
          ai_action?: string | null
          ai_doc_source_type?: string | null
          ai_health?: string | null
          amount?: number | null
          assigned_to?: string | null
          assigned_to_team?: string | null
          close_date?: string | null
          competitor?: string | null
          competitors?: Json | null
          contact_id?: string | null
          created_at?: string | null
          created_date?: string | null
          days_in_stage?: number | null
          description?: string | null
          expected_revenue?: number | null
          id?: string
          is_test_data?: boolean | null
          last_activity_date?: string | null
          last_synced?: string | null
          lead_id?: string | null
          lead_source?: string | null
          legacy_id?: string | null
          metadata?: Json | null
          name?: string
          next_action?: string | null
          next_step?: string | null
          notes?: string | null
          probability?: number | null
          processed_by_ai_doc?: boolean | null
          risk_factors?: Json | null
          score?: number | null
          score_reason?: string | null
          source?: string | null
          stage?: string | null
          tags?: string[] | null
          tags_jsonb_old?: Json | null
          tenant_id?: string | null
          type?: string | null
          unique_id?: string | null
          updated_at?: string | null
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "opportunities_assigned_to_team_fkey"
            columns: ["assigned_to_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_light"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          invoice_id: string | null
          metadata: Json
          paid_at: string | null
          payment_method_type: string | null
          provider_charge_id: string | null
          provider_payment_intent_id: string | null
          receipt_url: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_method_type?: string | null
          provider_charge_id?: string | null
          provider_payment_intent_id?: string | null
          receipt_url?: string | null
          status: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_method_type?: string | null
          provider_charge_id?: string | null
          provider_payment_intent_id?: string | null
          receipt_url?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      pep_saved_reports: {
        Row: {
          compiled_ir: Json
          created_at: string
          created_by: string
          filename: string
          id: string
          last_run_at: string | null
          plain_english: string
          report_name: string
          run_count: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          compiled_ir: Json
          created_at?: string
          created_by: string
          filename: string
          id?: string
          last_run_at?: string | null
          plain_english: string
          report_name: string
          run_count?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          compiled_ir?: Json
          created_at?: string
          created_by?: string
          filename?: string
          id?: string
          last_run_at?: string | null
          plain_english?: string
          report_name?: string
          run_count?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pep_saved_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "pep_saved_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "pep_saved_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_logs: {
        Row: {
          created_at: string | null
          created_date: string | null
          db_query_time_ms: number | null
          duration_ms: number
          endpoint: string
          error_message: string | null
          error_stack: string | null
          id: string
          ip_address: string | null
          method: string
          response_time_ms: number | null
          status_code: number | null
          tenant_id: string | null
          user_agent: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          db_query_time_ms?: number | null
          duration_ms: number
          endpoint: string
          error_message?: string | null
          error_stack?: string | null
          id?: string
          ip_address?: string | null
          method: string
          response_time_ms?: number | null
          status_code?: number | null
          tenant_id?: string | null
          user_agent?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          db_query_time_ms?: number | null
          duration_ms?: number
          endpoint?: string
          error_message?: string | null
          error_stack?: string | null
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
          tenant_id?: string | null
          user_agent?: string | null
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "performance_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "performance_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      person_profile: {
        Row: {
          account_id: string | null
          account_name: string | null
          activities: Json | null
          ai_summary: string[] | null
          ai_summary_updated_at: string | null
          assigned_to: string | null
          email: string | null
          first_name: string | null
          idx: number | null
          job_title: string | null
          last_activity_at: string | null
          last_name: string | null
          notes: Json | null
          open_opportunity_count: number
          opportunity_last_activity_date: string | null
          opportunity_name: string | null
          opportunity_stage: string[] | null
          person_id: string
          person_type: string
          phone: string | null
          recent_documents: Json
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          activities?: Json | null
          ai_summary?: string[] | null
          ai_summary_updated_at?: string | null
          assigned_to?: string | null
          email?: string | null
          first_name?: string | null
          idx?: number | null
          job_title?: string | null
          last_activity_at?: string | null
          last_name?: string | null
          notes?: Json | null
          open_opportunity_count?: number
          opportunity_last_activity_date?: string | null
          opportunity_name?: string | null
          opportunity_stage?: string[] | null
          person_id: string
          person_type: string
          phone?: string | null
          recent_documents?: Json
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          activities?: Json | null
          ai_summary?: string[] | null
          ai_summary_updated_at?: string | null
          assigned_to?: string | null
          email?: string | null
          first_name?: string | null
          idx?: number | null
          job_title?: string | null
          last_activity_at?: string | null
          last_name?: string | null
          notes?: Json | null
          open_opportunity_count?: number
          opportunity_last_activity_date?: string | null
          opportunity_name?: string | null
          opportunity_stage?: string[] | null
          person_id?: string
          person_type?: string
          phone?: string | null
          recent_documents?: Json
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_assignments: {
        Row: {
          bill_rate: number | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          end_date: string | null
          id: string
          metadata: Json | null
          notes: string | null
          pay_rate: number | null
          project_id: string
          rate_type: string | null
          role: string
          start_date: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          worker_id: string
        }
        Insert: {
          bill_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          pay_rate?: number | null
          project_id: string
          rate_type?: string | null
          role: string
          start_date?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          worker_id: string
        }
        Update: {
          bill_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          pay_rate?: number | null
          project_id?: string
          rate_type?: string | null
          role?: string
          start_date?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "construction_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "construction_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "construction_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          project_id: string
          sort_order: number | null
          status: string | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          project_id: string
          sort_order?: number | null
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string
          sort_order?: number | null
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "project_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_id: string | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          description: string | null
          end_date: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          notes: string | null
          project_manager_contact_id: string | null
          project_name: string
          project_value: number | null
          site_address: string | null
          site_name: string | null
          start_date: string | null
          status: string | null
          supervisor_contact_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          notes?: string | null
          project_manager_contact_id?: string | null
          project_name: string
          project_value?: number | null
          site_address?: string | null
          site_name?: string | null
          start_date?: string | null
          status?: string | null
          supervisor_contact_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          notes?: string | null
          project_manager_contact_id?: string | null
          project_name?: string
          project_value?: number | null
          site_address?: string | null
          site_name?: string | null
          start_date?: string | null
          status?: string | null
          supervisor_contact_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "construction_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_light"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_project_manager_contact_id_fkey"
            columns: ["project_manager_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_supervisor_contact_id_fkey"
            columns: ["supervisor_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "construction_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "construction_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_violations: {
        Row: {
          cloudflare_country: string | null
          cloudflare_ray: string | null
          created_at: string
          endpoint: string
          id: string
          ip_address: unknown
          limit_type: string
          metadata: Json | null
          method: string
          occurred_at: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          cloudflare_country?: string | null
          cloudflare_ray?: string | null
          created_at?: string
          endpoint: string
          id?: string
          ip_address: unknown
          limit_type?: string
          metadata?: Json | null
          method: string
          occurred_at?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          cloudflare_country?: string | null
          cloudflare_ray?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: unknown
          limit_type?: string
          metadata?: Json | null
          method?: string
          occurred_at?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_violations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "rate_limit_violations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "rate_limit_violations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      session_credits: {
        Row: {
          contact_id: string | null
          created_at: string
          credits_purchased: number
          credits_remaining: number
          expiry_date: string
          id: string
          lead_id: string | null
          metadata: Json
          package_id: string
          purchase_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          credits_purchased: number
          credits_remaining: number
          expiry_date: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          package_id: string
          purchase_date?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          credits_purchased?: number
          credits_remaining?: number
          expiry_date?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          package_id?: string
          purchase_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_credits_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_credits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_credits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_detail_light"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_credits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_credits_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "session_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "session_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "session_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      session_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_cents: number
          session_count: number
          tenant_id: string
          updated_at: string
          validity_days: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          session_count: number
          tenant_id: string
          updated_at?: string
          validity_days?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          session_count?: number
          tenant_id?: string
          updated_at?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "session_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "session_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription: {
        Row: {
          created_at: string | null
          created_date: string | null
          end_date: string | null
          id: string
          metadata: Json | null
          plan_id: string | null
          start_date: string | null
          status: string | null
          stripe_subscription_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "subscription_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "subscription_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plan: {
        Row: {
          billing_cycle: string | null
          created_at: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          billing_cycle?: string | null
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          price: number
          updated_at?: string | null
        }
        Update: {
          billing_cycle?: string | null
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      synchealth: {
        Row: {
          created_at: string | null
          created_date: string | null
          error_message: string | null
          id: string
          last_sync: string | null
          metadata: Json | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          error_message?: string | null
          id?: string
          last_sync?: string | null
          metadata?: Json | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          error_message?: string | null
          id?: string
          last_sync?: string | null
          metadata?: Json | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "synchealth_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "synchealth_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "synchealth_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string | null
          created_date: string | null
          id: string
          level: string
          message: string
          metadata: Json | null
          source: string | null
          stack_trace: string | null
          tenant_id: string | null
          url: string | null
          user_agent: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          level: string
          message: string
          metadata?: Json | null
          source?: string | null
          stack_trace?: string | null
          tenant_id?: string | null
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          source?: string | null
          stack_trace?: string | null
          tenant_id?: string | null
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: number
          settings: Json
          updated_at: string | null
        }
        Insert: {
          id: number
          settings: Json
          updated_at?: string | null
        }
        Update: {
          id?: number
          settings?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      systembranding: {
        Row: {
          created_at: string | null
          created_date: string | null
          id: string
          name: string | null
          payload: Json | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          name?: string | null
          payload?: Json | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          id?: string
          name?: string | null
          payload?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "systembranding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "systembranding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "systembranding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          description: string
          entity_id: string | null
          entity_type: string | null
          id: string
          result: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          description: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          result?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          result?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          access_level: string | null
          created_at: string | null
          employee_id: string | null
          id: string
          role: string
          team_id: string
          user_id: string | null
        }
        Insert: {
          access_level?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          role?: string
          team_id: string
          user_id?: string | null
        }
        Update: {
          access_level?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          role?: string
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_team_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_team_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_team_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_parent_team_id_fkey"
            columns: ["parent_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          template_json: Json
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          template_json: Json
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          template_json?: Json
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant: {
        Row: {
          billing_state: string | null
          branding_settings: Json | null
          business_model: string | null
          country: string | null
          created_at: string | null
          display_order: number | null
          domain: string | null
          elevenlabs_agent_id: string | null
          geographic_focus: string | null
          id: string
          industry: string | null
          major_city: string | null
          metadata: Json | null
          name: string
          slug: string
          status: string | null
          subscription_tier: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          billing_state?: string | null
          branding_settings?: Json | null
          business_model?: string | null
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          domain?: string | null
          elevenlabs_agent_id?: string | null
          geographic_focus?: string | null
          id?: string
          industry?: string | null
          major_city?: string | null
          metadata?: Json | null
          name: string
          slug: string
          status?: string | null
          subscription_tier?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          billing_state?: string | null
          branding_settings?: Json | null
          business_model?: string | null
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          domain?: string | null
          elevenlabs_agent_id?: string | null
          geographic_focus?: string | null
          id?: string
          industry?: string | null
          major_city?: string | null
          metadata?: Json | null
          name?: string
          slug?: string
          status?: string | null
          subscription_tier?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_integration: {
        Row: {
          config: Json | null
          created_at: string | null
          created_date: string | null
          id: string
          integration_type: string
          is_active: boolean | null
          last_sync: string | null
          metadata: Json | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          created_date?: string | null
          id?: string
          integration_type: string
          is_active?: boolean | null
          last_sync?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          created_date?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean | null
          last_sync?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integration_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_integration_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_integration_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          api_credentials: Json | null
          config: Json | null
          created_at: string | null
          created_date: string | null
          error_message: string | null
          id: string
          integration_name: string | null
          integration_type: string
          is_active: boolean | null
          last_sync: string | null
          metadata: Json | null
          sync_status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          api_credentials?: Json | null
          config?: Json | null
          created_at?: string | null
          created_date?: string | null
          error_message?: string | null
          id?: string
          integration_name?: string | null
          integration_type: string
          is_active?: boolean | null
          last_sync?: string | null
          metadata?: Json | null
          sync_status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          api_credentials?: Json | null
          config?: Json | null
          created_at?: string | null
          created_date?: string | null
          error_message?: string | null
          id?: string
          integration_name?: string | null
          integration_type?: string
          is_active?: boolean | null
          last_sync?: string | null
          metadata?: Json | null
          sync_status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          billing_plan_id: string
          canceled_at: string | null
          created_at: string
          grace_period_ends_at: string | null
          id: string
          metadata: Json
          provider_subscription_id: string | null
          renewal_date: string | null
          start_date: string
          status: string
          suspended_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_plan_id: string
          canceled_at?: string | null
          created_at?: string
          grace_period_ends_at?: string | null
          id?: string
          metadata?: Json
          provider_subscription_id?: string | null
          renewal_date?: string | null
          start_date?: string
          status?: string
          suspended_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_plan_id?: string
          canceled_at?: string | null
          created_at?: string
          grace_period_ends_at?: string | null
          id?: string
          metadata?: Json
          provider_subscription_id?: string | null
          renewal_date?: string | null
          start_date?: string
          status?: string
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_billing_plan_id_fkey"
            columns: ["billing_plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      test_report: {
        Row: {
          created_at: string | null
          created_date: string | null
          duration: number | null
          id: string
          metadata: Json | null
          results: Json | null
          status: string | null
          tenant_id: string | null
          test_suite: string
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          duration?: number | null
          id?: string
          metadata?: Json | null
          results?: Json | null
          status?: string | null
          tenant_id?: string | null
          test_suite: string
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          duration?: number | null
          id?: string
          metadata?: Json | null
          results?: Json | null
          status?: string | null
          tenant_id?: string | null
          test_suite?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_report_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "test_report_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "test_report_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitation: {
        Row: {
          created_at: string | null
          created_date: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          metadata: Json | null
          role: string | null
          status: string | null
          tenant_id: string | null
          token: string
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          metadata?: Json | null
          role?: string | null
          status?: string | null
          tenant_id?: string | null
          token: string
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          metadata?: Json | null
          role?: string | null
          status?: string | null
          tenant_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "user_invitation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "user_invitation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          employee_role: string | null
          first_name: string | null
          id: string
          last_name: string | null
          metadata: Json | null
          nav_permissions: Json | null
          password_hash: string | null
          perm_all_records: boolean | null
          perm_employees: boolean | null
          perm_notes_anywhere: boolean | null
          perm_reports: boolean | null
          perm_settings: boolean | null
          role: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          employee_role?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json | null
          nav_permissions?: Json | null
          password_hash?: string | null
          perm_all_records?: boolean | null
          perm_employees?: boolean | null
          perm_notes_anywhere?: boolean | null
          perm_reports?: boolean | null
          perm_settings?: boolean | null
          role?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          employee_role?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json | null
          nav_permissions?: Json | null
          password_hash?: string | null
          perm_all_records?: boolean | null
          perm_employees?: boolean | null
          perm_notes_anywhere?: boolean | null
          perm_reports?: boolean | null
          perm_settings?: boolean | null
          role?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook: {
        Row: {
          created_at: string | null
          created_date: string | null
          event_types: Json | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          secret: string | null
          tenant_id: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          created_date?: string | null
          event_types?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          secret?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          created_date?: string | null
          event_types?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          secret?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "webhook_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "webhook_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          available_from: string | null
          available_until: string | null
          certifications: string[] | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          default_pay_rate: number | null
          default_rate_type: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          id: string
          last_name: string
          metadata: Json | null
          notes: string | null
          phone: string | null
          primary_skill: string | null
          skills: string[] | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          worker_type: string | null
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          certifications?: string[] | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          default_pay_rate?: number | null
          default_rate_type?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          id?: string
          last_name: string
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          primary_skill?: string | null
          skills?: string[] | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          worker_type?: string | null
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          certifications?: string[] | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          default_pay_rate?: number | null
          default_rate_type?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          id?: string
          last_name?: string
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          primary_skill?: string | null
          skills?: string[] | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          worker_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "workers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow: {
        Row: {
          actions: Json | null
          created_at: string | null
          created_date: string | null
          description: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          tenant_id: string | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          actions?: Json | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          actions?: Json | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_execution: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_date: string | null
          execution_log: Json | null
          id: string
          metadata: Json | null
          started_at: string | null
          status: string | null
          tenant_id: string | null
          trigger_data: Json | null
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_date?: string | null
          execution_log?: Json | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          trigger_data?: Json | null
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_date?: string | null
          execution_log?: Json | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          trigger_data?: Json | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_execution_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_execution_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_execution_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_execution_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template: {
        Row: {
          category: string | null
          created_at: string | null
          created_date: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          parameters: Json
          template_connections: Json
          template_nodes: Json
          tenant_id: string | null
          trigger_config: Json | null
          trigger_type: string | null
          updated_at: string | null
          use_cases: string[] | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          parameters?: Json
          template_connections?: Json
          template_nodes?: Json
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
          use_cases?: string[] | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          parameters?: Json
          template_connections?: Json
          template_nodes?: Json
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
          use_cases?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_funnel_counts: {
        Row: {
          accounts_real: number | null
          accounts_test: number | null
          accounts_total: number | null
          closed_lost_count_real: number | null
          closed_lost_count_test: number | null
          closed_lost_count_total: number | null
          closed_lost_value_real: number | null
          closed_lost_value_test: number | null
          closed_lost_value_total: number | null
          closed_won_count_real: number | null
          closed_won_count_test: number | null
          closed_won_count_total: number | null
          closed_won_value_real: number | null
          closed_won_value_test: number | null
          closed_won_value_total: number | null
          contacts_real: number | null
          contacts_test: number | null
          contacts_total: number | null
          last_refreshed: string | null
          leads_real: number | null
          leads_test: number | null
          leads_total: number | null
          negotiation_count_real: number | null
          negotiation_count_test: number | null
          negotiation_count_total: number | null
          negotiation_value_real: number | null
          negotiation_value_test: number | null
          negotiation_value_total: number | null
          proposal_count_real: number | null
          proposal_count_test: number | null
          proposal_count_total: number | null
          proposal_value_real: number | null
          proposal_value_test: number | null
          proposal_value_total: number | null
          prospecting_count_real: number | null
          prospecting_count_test: number | null
          prospecting_count_total: number | null
          prospecting_value_real: number | null
          prospecting_value_test: number | null
          prospecting_value_total: number | null
          qualification_count_real: number | null
          qualification_count_test: number | null
          qualification_count_total: number | null
          qualification_value_real: number | null
          qualification_value_test: number | null
          qualification_value_total: number | null
          sources_real: number | null
          sources_test: number | null
          sources_total: number | null
          tenant_id: string | null
          tenant_slug: string | null
        }
        Relationships: []
      }
      dashboard_opps_funnel_mv: {
        Row: {
          accounts_count: number | null
          activities_count: number | null
          closed_opportunities_7d: number | null
          computed_at: string | null
          contacts_count: number | null
          leads_count: number | null
          new_leads_7d: number | null
          new_opportunities_7d: number | null
          opportunities_amount_total: number | null
          opportunities_closed_count: number | null
          opportunities_count: number | null
          opportunities_expected_revenue_total: number | null
          opportunities_open_count: number | null
          opportunities_stage_breakdown: Json | null
          opportunities_win_probability_avg: number | null
          pipeline_today: number | null
          revenue_today: number | null
          tenant_id: string | null
        }
        Relationships: []
      }
      dashboard_stats_mv: {
        Row: {
          activities_last_30_days: number | null
          leads_last_30_days: number | null
          new_leads: number | null
          open_leads: number | null
          open_opportunities: number | null
          pipeline_value: number | null
          tenant_id: string | null
          total_accounts: number | null
          total_contacts: number | null
          total_leads: number | null
          total_opportunities: number | null
          won_opportunities: number | null
          won_value: number | null
        }
        Relationships: []
      }
      devai_health_stats: {
        Row: {
          active_alerts: number | null
          critical_count: number | null
          high_count: number | null
          last_alert_time: string | null
          last_resolved_time: string | null
          low_count: number | null
          medium_count: number | null
          mttr_hours: number | null
          mttr_minutes: number | null
          mttr_seconds: number | null
          tenant_id: string | null
          total_alerts: number | null
        }
        Relationships: []
      }
      lead_detail_full: {
        Row: {
          account_id: string | null
          account_name: string | null
          assigned_to: string | null
          company: string | null
          created_date: string | null
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          phone: string | null
          source: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_detail_light: {
        Row: {
          company: string | null
          created_date: string | null
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          phone: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          company?: string | null
          created_date?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          phone?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          company?: string | null
          created_date?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          phone?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_view: {
        Row: {
          auth_role: string | null
          created_at: string | null
          email: string | null
          employee_id: string | null
          employee_role: string | null
          employee_status: string | null
          first_name: string | null
          has_crm_access: boolean | null
          last_name: string | null
          nav_permissions: Json | null
          perm_all_records: boolean | null
          perm_employees: boolean | null
          perm_notes_anywhere: boolean | null
          perm_reports: boolean | null
          perm_settings: boolean | null
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
          updated_at: string | null
          user_id: string | null
          user_metadata: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      v_account_related_people: {
        Row: {
          account_id: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          last_name: string | null
          person_id: string | null
          person_type: string | null
          phone: string | null
          status: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      v_activity_stream: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          priority: Database["public"]["Enums"]["activity_priority"] | null
          related_id: string | null
          related_name: string | null
          related_to: string | null
          status: string | null
          subject: string | null
          tenant_id: string | null
          type: string | null
          updated_date: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          priority?: Database["public"]["Enums"]["activity_priority"] | null
          related_id?: string | null
          related_name?: string | null
          related_to?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string | null
          type?: string | null
          updated_date?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          priority?: Database["public"]["Enums"]["activity_priority"] | null
          related_id?: string | null
          related_name?: string | null
          related_to?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string | null
          type?: string | null
          updated_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      v_calendar_activities: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          due_at: string | null
          due_date: string | null
          due_time: string | null
          id: string | null
          related_id: string | null
          related_to: string | null
          status: string | null
          subject: string | null
          tenant_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          due_at?: never
          due_date?: string | null
          due_time?: string | null
          id?: string | null
          related_id?: string | null
          related_to?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          due_at?: never
          due_date?: string | null
          due_time?: string | null
          id?: string | null
          related_id?: string | null
          related_to?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profile_view"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      v_crm_records: {
        Row: {
          assigned_to: string | null
          email: string | null
          phone: string | null
          record_id: string | null
          record_type: string | null
          status: string | null
          tenant_id: string | null
          title: string | null
          unique_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_lead_counts_by_status: {
        Row: {
          count: number | null
          status: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      v_opportunity_pipeline_by_stage: {
        Row: {
          count: number | null
          stage: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_funnel_counts"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_opps_funnel_mv"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aggregate_ai_suggestion_metrics: {
        Args: { p_bucket_size?: string; p_tenant_id: string }
        Returns: number
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      cleanup_llm_activity_logs: { Args: never; Returns: number }
      current_tenant_id: { Args: never; Returns: string }
      devai_check_duplicate_alert: {
        Args: {
          p_category: string
          p_time_window_minutes?: number
          p_title: string
        }
        Returns: boolean
      }
      employee_full_name: {
        Args: { emp_record: Database["public"]["Tables"]["employees"]["Row"] }
        Returns: string
      }
      ensure_refresh_dashboard_job: { Args: never; Returns: undefined }
      ensure_refresh_dashboard_job_main: { Args: never; Returns: undefined }
      exec: { Args: { "": string }; Returns: undefined }
      get_columns_for_table: {
        Args: { t_name: string }
        Returns: {
          column_name: string
        }[]
      }
      get_dashboard_bundle: {
        Args: { p_include_test_data?: boolean; p_tenant_id: string }
        Returns: Json
      }
      get_dashboard_stats: { Args: { p_tenant_id: string }; Returns: Json }
      get_top_rate_limit_offenders: {
        Args: { p_limit?: number; p_since: string }
        Returns: {
          count: number
          country: string
          endpoints: string[]
          first_seen: string
          ip: string
          last_seen: string
        }[]
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      leads_delete_definer: {
        Args: { p_lead_id: string; p_tenant_id: string }
        Returns: undefined
      }
      leads_insert_definer: {
        Args: {
          p_activity_metadata?: Json
          p_address_1?: string
          p_address_2?: string
          p_ai_action?: string
          p_assigned_to?: string
          p_city?: string
          p_company?: string
          p_conversion_probability?: number
          p_country?: string
          p_created_date?: string
          p_do_not_call?: boolean
          p_do_not_text?: boolean
          p_email?: string
          p_estimated_value?: number
          p_first_name?: string
          p_is_test_data?: boolean
          p_job_title?: string
          p_last_contacted?: string
          p_last_name?: string
          p_last_synced?: string
          p_lead_type?: string
          p_legacy_id?: string
          p_metadata?: Json
          p_next_action?: string
          p_person_id?: string
          p_phone?: string
          p_qualification_status?: string
          p_score?: number
          p_score_reason?: string
          p_source?: string
          p_source_id?: string
          p_state?: string
          p_status?: string
          p_tags?: string[]
          p_tenant_id: string
          p_unique_id?: string
          p_zip?: string
        }
        Returns: string
      }
      leads_update_definer: {
        Args: { p_lead_id: string; p_payload: Json; p_tenant_id: string }
        Returns: Json
      }
      pep_increment_report_run: {
        Args: { p_id: string; p_tenant_id: string }
        Returns: undefined
      }
      recompute_last_activity_at: {
        Args: { p_person_id: string }
        Returns: undefined
      }
      recompute_open_opportunities: {
        Args: { p_person_id: string; p_person_type: string }
        Returns: undefined
      }
      recompute_open_opportunity_count: {
        Args: { p_person_id: string; p_person_type: string }
        Returns: undefined
      }
      recompute_recent_documents: {
        Args: { p_person_id: string; p_person_type: string }
        Returns: undefined
      }
      refresh_all_person_profiles: { Args: never; Returns: undefined }
      refresh_assigned_to_on_accounts: {
        Args: { emp_id: string }
        Returns: undefined
      }
      refresh_assigned_to_on_activities: {
        Args: { emp_id: string }
        Returns: undefined
      }
      refresh_assigned_to_on_client_requirement: {
        Args: { emp_id: string }
        Returns: undefined
      }
      refresh_dashboard_funnel_counts: { Args: never; Returns: undefined }
      refresh_dashboard_stats: { Args: never; Returns: undefined }
      refresh_person_profile: {
        Args: { p_person_id: string }
        Returns: undefined
      }
      refresh_person_profile_lead: {
        Args: { p_lead_id: string; p_tenant_id: string }
        Returns: undefined
      }
      refresh_person_profile_on_demand: {
        Args: { p_person_id: string }
        Returns: undefined
      }
      rehydrate_person_profiles: { Args: never; Returns: undefined }
      run_dashboard_funnel_refresh_job: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      text_to_bytea: { Args: { data: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      update_phase3_suggestion_telemetry: {
        Args: {
          p_action: string
          p_outcome: string
          p_review_time_seconds?: number
          p_suggestion_id: string
        }
        Returns: number
      }
      upsert_person_profile: {
        Args: {
          p_company?: string
          p_email: string
          p_first_name?: string
          p_last_name?: string
          p_phone?: string
          p_source_id?: string
          p_source_type?: string
          p_tenant_id: string
        }
        Returns: string
      }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      uuid_advisory_key: { Args: { p: string }; Returns: number }
    }
    Enums: {
      activity_priority: "low" | "normal" | "high" | "urgent"
      bizdev_status: "active" | "inactive" | "converted" | "archived"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
      license_status: "active" | "expired" | "suspended" | "pending"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_priority: ["low", "normal", "high", "urgent"],
      bizdev_status: ["active", "inactive", "converted", "archived"],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      license_status: ["active", "expired", "suspended", "pending"],
    },
  },
} as const
