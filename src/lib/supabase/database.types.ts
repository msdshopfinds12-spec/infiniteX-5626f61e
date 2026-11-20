// Generated from the connected Ashaa-INX Supabase schema.
// Read-only schema snapshot; regenerate after any approved schema change.
// Do not edit manually.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      billing_webhook_events: {
        Row: {
          event_type: string
          id: string
          last_error: string | null
          processed_at: string | null
          processing_status: string
          provider: string
          provider_event_id: string
          received_at: string
          retry_count: number
        }
        Insert: {
          event_type: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          processing_status?: string
          provider: string
          provider_event_id: string
          received_at?: string
          retry_count?: number
        }
        Update: {
          event_type?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_event_id?: string
          received_at?: string
          retry_count?: number
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          idempotency_key: string
          metadata: Json
          owner_id: string
          reason: string
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          idempotency_key: string
          metadata?: Json
          owner_id: string
          reason: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          idempotency_key?: string
          metadata?: Json
          owner_id?: string
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          provider: string
          provider_payment_id: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          id?: string
          paid_at?: string | null
          provider: string
          provider_payment_id?: string | null
          status?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: string
          provider_payment_id?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          owner_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          owner_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          owner_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_code: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_code?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_code?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          public_config: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          public_config?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          public_config?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          request_id: string | null
          status: string
          tool_id: string | null
          units: number
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          request_id?: string | null
          status?: string
          tool_id?: string | null
          units?: number
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          request_id?: string | null
          status?: string
          tool_id?: string | null
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_projects: {
        Row: {
          content: Json
          created_at: string
          id: string
          project_type: string
          title: string
          tool_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          project_type?: string
          title: string
          tool_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          project_type?: string
          title?: string
          tool_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_projects_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_logs: {
        Row: {
          created_at: string
          details: Json
          event: string
          id: number
          level: string
          owner_id: string
          run_id: string | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          event: string
          id?: never
          level?: string
          owner_id: string
          run_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          event?: string
          id?: never
          level?: string
          owner_id?: string
          run_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_logs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          attempt: number
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          input: Json
          output: Json | null
          owner_id: string
          scheduled_for: string | null
          started_at: string | null
          status: string
          workflow_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          owner_id: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          workflow_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          owner_id?: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step_runs: {
        Row: {
          attempt: number
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          input: Json
          output: Json | null
          owner_id: string
          run_id: string
          started_at: string | null
          status: string
          step_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          owner_id: string
          run_id: string
          started_at?: string | null
          status?: string
          step_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          owner_id?: string
          run_id?: string
          started_at?: string | null
          status?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_step_runs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          action_type: string
          config: Json
          created_at: string
          id: string
          name: string
          retry_limit: number
          step_order: number
          timeout_seconds: number
          workflow_id: string
        }
        Insert: {
          action_type: string
          config?: Json
          created_at?: string
          id?: string
          name: string
          retry_limit?: number
          step_order: number
          timeout_seconds?: number
          workflow_id: string
        }
        Update: {
          action_type?: string
          config?: Json
          created_at?: string
          id?: string
          name?: string
          retry_limit?: number
          step_order?: number
          timeout_seconds?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          next_run_at: string | null
          owner_id: string
          settings: Json
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          next_run_at?: string | null
          owner_id: string
          settings?: Json
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          next_run_at?: string | null
          owner_id?: string
          settings?: Json
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      simula_enqueue_workflow_run: {
        Args: { p_input?: Json; p_request_id: string; p_workflow_id: string }
        Returns: {
          created_at: string
          id: string
          replayed: boolean
          status: string
        }[]
      }
      simula_claim_workflow_runs: {
        Args: { p_limit?: number }
        Returns: {
          attempt: number
          id: string
          input: Json
          owner_id: string
          workflow_id: string
        }[]
      }
      simula_claim_workflow_runs_internal: {
        Args: { p_limit?: number }
        Returns: {
          attempt: number
          id: string
          input: Json
          owner_id: string
          workflow_id: string
        }[]
      }
      simula_verify_worker_secret: {
        Args: { p_secret: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
