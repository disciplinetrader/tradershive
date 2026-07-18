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
      account_statistics: {
        Row: {
          account_id: string
          best_trade: number
          breakevens: number
          gross_loss: number
          gross_profit: number
          losses: number
          net_pnl: number
          total_trades: number
          updated_at: string
          user_id: string
          win_rate: number
          wins: number
          worst_trade: number
        }
        Insert: {
          account_id: string
          best_trade?: number
          breakevens?: number
          gross_loss?: number
          gross_profit?: number
          losses?: number
          net_pnl?: number
          total_trades?: number
          updated_at?: string
          user_id: string
          win_rate?: number
          wins?: number
          worst_trade?: number
        }
        Update: {
          account_id?: string
          best_trade?: number
          breakevens?: number
          gross_loss?: number
          gross_profit?: number
          losses?: number
          net_pnl?: number
          total_trades?: number
          updated_at?: string
          user_id?: string
          win_rate?: number
          wins?: number
          worst_trade?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_statistics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["achievement_category"]
          coin_reward: number
          created_at: string
          description: string
          icon: string | null
          id: string
          metric: string
          secret: boolean
          slug: string
          sort_order: number
          target: number
          title: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          active?: boolean
          category?: Database["public"]["Enums"]["achievement_category"]
          coin_reward?: number
          created_at?: string
          description: string
          icon?: string | null
          id?: string
          metric: string
          secret?: boolean
          slug: string
          sort_order?: number
          target?: number
          title: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["achievement_category"]
          coin_reward?: number
          created_at?: string
          description?: string
          icon?: string | null
          id?: string
          metric?: string
          secret?: boolean
          slug?: string
          sort_order?: number
          target?: number
          title?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          ip: string | null
          meta: Json
          resource: string
          resource_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          meta?: Json
          resource: string
          resource_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          meta?: Json
          resource?: string
          resource_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          created_at: string
          description: string | null
          group_name: string
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_name: string
          key: string
          label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_name?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      ai_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          created_at: string
          id: string
          kind: string
          message: string | null
          metadata: Json | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          kind: string
          message?: string | null
          metadata?: Json | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          metadata?: Json | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_analysis_queue: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string | null
          error: string | null
          finished_at: string | null
          id: string
          kind: Database["public"]["Enums"]["ai_analysis_kind"]
          max_attempts: number
          payload: Json
          priority: number
          result_id: string | null
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["ai_analysis_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ai_analysis_kind"]
          max_attempts?: number
          payload?: Json
          priority?: number
          result_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_analysis_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_analysis_kind"]
          max_attempts?: number
          payload?: Json
          priority?: number
          result_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_analysis_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message_ref: string | null
          model_key: string | null
          parts: Json
          provider_key: string | null
          role: Database["public"]["Enums"]["ai_chat_role"]
          session_id: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          message_ref?: string | null
          model_key?: string | null
          parts?: Json
          provider_key?: string | null
          role: Database["public"]["Enums"]["ai_chat_role"]
          session_id: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_ref?: string | null
          model_key?: string | null
          parts?: Json
          provider_key?: string | null
          role?: Database["public"]["Enums"]["ai_chat_role"]
          session_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          archived: boolean
          context: Json
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          model_key: string | null
          pinned: boolean
          provider_key: string | null
          system_hint: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          context?: Json
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          model_key?: string | null
          pinned?: boolean
          provider_key?: string | null
          system_hint?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          context?: Json
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          model_key?: string | null
          pinned?: boolean
          provider_key?: string | null
          system_hint?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_habit_logs: {
        Row: {
          challenge_completion: number | null
          created_at: string
          daily_login: boolean
          day: string
          exercise_minutes: number | null
          id: string
          journal_consistency: number | null
          overall_score: number | null
          risk_discipline: number | null
          sleep_hours: number | null
          trading_consistency: number | null
          trading_hours_within_target: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_completion?: number | null
          created_at?: string
          daily_login?: boolean
          day: string
          exercise_minutes?: number | null
          id?: string
          journal_consistency?: number | null
          overall_score?: number | null
          risk_discipline?: number | null
          sleep_hours?: number | null
          trading_consistency?: number | null
          trading_hours_within_target?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_completion?: number | null
          created_at?: string
          daily_login?: boolean
          day?: string
          exercise_minutes?: number | null
          id?: string
          journal_consistency?: number | null
          overall_score?: number | null
          risk_discipline?: number | null
          sleep_hours?: number | null
          trading_consistency?: number | null
          trading_hours_within_target?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_journal_reviews: {
        Row: {
          better_reflection: string | null
          completeness: number | null
          consistency_score: number | null
          created_at: string
          emotion_score: number | null
          id: string
          journal_id: string
          missing_information: Json | null
          model_key: string
          notes_quality: number | null
          provider_key: string
          psychology_score: number | null
          quality_score: number | null
          raw: Json | null
          risk_score: number | null
          suggested_questions: Json | null
          summary: string | null
          superseded_by: string | null
          tokens_in: number | null
          tokens_out: number | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          better_reflection?: string | null
          completeness?: number | null
          consistency_score?: number | null
          created_at?: string
          emotion_score?: number | null
          id?: string
          journal_id: string
          missing_information?: Json | null
          model_key: string
          notes_quality?: number | null
          provider_key: string
          psychology_score?: number | null
          quality_score?: number | null
          raw?: Json | null
          risk_score?: number | null
          suggested_questions?: Json | null
          summary?: string | null
          superseded_by?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          better_reflection?: string | null
          completeness?: number | null
          consistency_score?: number | null
          created_at?: string
          emotion_score?: number | null
          id?: string
          journal_id?: string
          missing_information?: Json | null
          model_key?: string
          notes_quality?: number | null
          provider_key?: string
          psychology_score?: number | null
          quality_score?: number | null
          raw?: Json | null
          risk_score?: number | null
          suggested_questions?: Json | null
          summary?: string | null
          superseded_by?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_journal_reviews_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_journal_reviews_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "ai_journal_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          capabilities: Json
          context_window: number | null
          created_at: string
          description: string | null
          enabled: boolean
          experimental: boolean
          id: string
          input_cost_credits: number | null
          is_default: boolean
          model_key: string
          name: string
          output_cost_credits: number | null
          provider_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          context_window?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          experimental?: boolean
          id?: string
          input_cost_credits?: number | null
          is_default?: boolean
          model_key: string
          name: string
          output_cost_credits?: number | null
          provider_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          context_window?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          experimental?: boolean
          id?: string
          input_cost_credits?: number | null
          is_default?: boolean
          model_key?: string
          name?: string
          output_cost_credits?: number | null
          provider_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_performance_reviews: {
        Row: {
          best_day: string | null
          best_pair: string | null
          best_session: string | null
          best_strategy: string | null
          best_time: string | null
          created_at: string
          id: string
          model_key: string
          period_end: string
          period_start: string
          provider_key: string
          raw: Json | null
          suggestions: Json | null
          summary: string | null
          tokens_in: number | null
          tokens_out: number | null
          updated_at: string
          user_id: string
          worst_day: string | null
          worst_pair: string | null
          worst_session: string | null
          worst_strategy: string | null
          worst_time: string | null
        }
        Insert: {
          best_day?: string | null
          best_pair?: string | null
          best_session?: string | null
          best_strategy?: string | null
          best_time?: string | null
          created_at?: string
          id?: string
          model_key: string
          period_end: string
          period_start: string
          provider_key: string
          raw?: Json | null
          suggestions?: Json | null
          summary?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id: string
          worst_day?: string | null
          worst_pair?: string | null
          worst_session?: string | null
          worst_strategy?: string | null
          worst_time?: string | null
        }
        Update: {
          best_day?: string | null
          best_pair?: string | null
          best_session?: string | null
          best_strategy?: string | null
          best_time?: string | null
          created_at?: string
          id?: string
          model_key?: string
          period_end?: string
          period_start?: string
          provider_key?: string
          raw?: Json | null
          suggestions?: Json | null
          summary?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id?: string
          worst_day?: string | null
          worst_pair?: string | null
          worst_session?: string | null
          worst_strategy?: string | null
          worst_time?: string | null
        }
        Relationships: []
      }
      ai_playbooks: {
        Row: {
          archived: boolean
          category: string | null
          checklist: Json | null
          created_at: string
          description: string | null
          examples: Json | null
          id: string
          mistakes_to_avoid: Json | null
          model_key: string | null
          pinned: boolean
          provider_key: string | null
          raw: Json | null
          review_frequency: string | null
          rules: Json | null
          source: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          category?: string | null
          checklist?: Json | null
          created_at?: string
          description?: string | null
          examples?: Json | null
          id?: string
          mistakes_to_avoid?: Json | null
          model_key?: string | null
          pinned?: boolean
          provider_key?: string | null
          raw?: Json | null
          review_frequency?: string | null
          rules?: Json | null
          source?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          category?: string | null
          checklist?: Json | null
          created_at?: string
          description?: string | null
          examples?: Json | null
          id?: string
          mistakes_to_avoid?: Json | null
          model_key?: string | null
          pinned?: boolean
          provider_key?: string | null
          raw?: Json | null
          review_frequency?: string | null
          rules?: Json | null
          source?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_prompt_templates: {
        Row: {
          active_version: number
          category: string
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          active_version?: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          active_version?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompt_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          params: Json
          system_prompt: string
          template_id: string
          user_prompt: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          params?: Json
          system_prompt: string
          template_id: string
          user_prompt: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          params?: Json
          system_prompt?: string
          template_id?: string
          user_prompt?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          auth_header: string | null
          base_url: string | null
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          experimental: boolean
          id: string
          key: string
          name: string
          secret_key_ref: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          auth_header?: string | null
          base_url?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          experimental?: boolean
          id?: string
          key: string
          name: string
          secret_key_ref?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          auth_header?: string | null
          base_url?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          experimental?: boolean
          id?: string
          key?: string
          name?: string
          secret_key_ref?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_psychology_reviews: {
        Row: {
          created_at: string
          emotion_vs_profit: Json | null
          emotions: Json | null
          heatmap: Json | null
          id: string
          model_key: string
          patterns: Json | null
          period_end: string
          period_start: string
          provider_key: string
          raw: Json | null
          summary: string | null
          timeline: Json | null
          tokens_in: number | null
          tokens_out: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emotion_vs_profit?: Json | null
          emotions?: Json | null
          heatmap?: Json | null
          id?: string
          model_key: string
          patterns?: Json | null
          period_end: string
          period_start: string
          provider_key: string
          raw?: Json | null
          summary?: string | null
          timeline?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emotion_vs_profit?: Json | null
          emotions?: Json | null
          heatmap?: Json | null
          id?: string
          model_key?: string
          patterns?: Json | null
          period_end?: string
          period_start?: string
          provider_key?: string
          raw?: Json | null
          summary?: string | null
          timeline?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          bucket: string
          count: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      ai_recommendations: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          difficulty: number
          dismissed_at: string | null
          expires_at: string | null
          id: string
          impact: number
          metadata: Json | null
          model_key: string | null
          priority: Database["public"]["Enums"]["ai_recommendation_priority"]
          provider_key: string | null
          source: string | null
          status: Database["public"]["Enums"]["ai_recommendation_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          difficulty?: number
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          impact?: number
          metadata?: Json | null
          model_key?: string | null
          priority?: Database["public"]["Enums"]["ai_recommendation_priority"]
          provider_key?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["ai_recommendation_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          difficulty?: number
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          impact?: number
          metadata?: Json | null
          model_key?: string | null
          priority?: Database["public"]["Enums"]["ai_recommendation_priority"]
          provider_key?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["ai_recommendation_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_reports: {
        Row: {
          biggest_improvement: string | null
          biggest_weakness: string | null
          created_at: string
          id: string
          losses: Json | null
          metrics: Json | null
          model_key: string
          period: Database["public"]["Enums"]["ai_report_period"]
          period_end: string
          period_start: string
          provider_key: string
          raw: Json | null
          recommended_goals: Json | null
          summary: string | null
          title: string | null
          tokens_in: number | null
          tokens_out: number | null
          updated_at: string
          user_id: string
          wins: Json | null
        }
        Insert: {
          biggest_improvement?: string | null
          biggest_weakness?: string | null
          created_at?: string
          id?: string
          losses?: Json | null
          metrics?: Json | null
          model_key: string
          period: Database["public"]["Enums"]["ai_report_period"]
          period_end: string
          period_start: string
          provider_key: string
          raw?: Json | null
          recommended_goals?: Json | null
          summary?: string | null
          title?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id: string
          wins?: Json | null
        }
        Update: {
          biggest_improvement?: string | null
          biggest_weakness?: string | null
          created_at?: string
          id?: string
          losses?: Json | null
          metrics?: Json | null
          model_key?: string
          period?: Database["public"]["Enums"]["ai_report_period"]
          period_end?: string
          period_start?: string
          provider_key?: string
          raw?: Json | null
          recommended_goals?: Json | null
          summary?: string | null
          title?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id?: string
          wins?: Json | null
        }
        Relationships: []
      }
      ai_score_snapshots: {
        Row: {
          breakdown: Json | null
          challenge_completion: number
          computed_at: string
          consistency: number
          discipline: number
          execution: number
          id: string
          journal_quality: number
          overall: number
          performance: number
          psychology: number
          risk_management: number
          user_id: string
        }
        Insert: {
          breakdown?: Json | null
          challenge_completion?: number
          computed_at?: string
          consistency?: number
          discipline?: number
          execution?: number
          id?: string
          journal_quality?: number
          overall?: number
          performance?: number
          psychology?: number
          risk_management?: number
          user_id: string
        }
        Update: {
          breakdown?: Json | null
          challenge_completion?: number
          computed_at?: string
          consistency?: number
          discipline?: number
          execution?: number
          id?: string
          journal_quality?: number
          overall?: number
          performance?: number
          psychology?: number
          risk_management?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          analysis_depth: string
          auto_analyze_trades: boolean
          auto_journal_review: boolean
          auto_monthly_report: boolean
          auto_weekly_report: boolean
          created_at: string
          extras: Json
          opt_out: boolean
          preferred_model: string | null
          preferred_provider: string | null
          share_data_with_ai: boolean
          smart_alerts: boolean
          updated_at: string
          user_id: string
          voice_coach: boolean
        }
        Insert: {
          analysis_depth?: string
          auto_analyze_trades?: boolean
          auto_journal_review?: boolean
          auto_monthly_report?: boolean
          auto_weekly_report?: boolean
          created_at?: string
          extras?: Json
          opt_out?: boolean
          preferred_model?: string | null
          preferred_provider?: string | null
          share_data_with_ai?: boolean
          smart_alerts?: boolean
          updated_at?: string
          user_id: string
          voice_coach?: boolean
        }
        Update: {
          analysis_depth?: string
          auto_analyze_trades?: boolean
          auto_journal_review?: boolean
          auto_monthly_report?: boolean
          auto_weekly_report?: boolean
          created_at?: string
          extras?: Json
          opt_out?: boolean
          preferred_model?: string | null
          preferred_provider?: string | null
          share_data_with_ai?: boolean
          smart_alerts?: boolean
          updated_at?: string
          user_id?: string
          voice_coach?: boolean
        }
        Relationships: []
      }
      ai_trade_reviews: {
        Row: {
          alternative_entries: Json | null
          alternative_exits: Json | null
          better_stop: string | null
          confidence: number | null
          created_at: string
          execution_review: string | null
          grade: Database["public"]["Enums"]["ai_trade_grade"] | null
          id: string
          latency_ms: number | null
          missed_opportunities: Json | null
          mistakes: Json | null
          model_key: string
          prompt_template_key: string | null
          prompt_version: number | null
          provider_key: string
          psychology_review: string | null
          raw: Json | null
          risk_review: string | null
          strengths: Json | null
          suggested_take_profit: string | null
          summary: string | null
          superseded_by: string | null
          tokens_in: number | null
          tokens_out: number | null
          trade_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          alternative_entries?: Json | null
          alternative_exits?: Json | null
          better_stop?: string | null
          confidence?: number | null
          created_at?: string
          execution_review?: string | null
          grade?: Database["public"]["Enums"]["ai_trade_grade"] | null
          id?: string
          latency_ms?: number | null
          missed_opportunities?: Json | null
          mistakes?: Json | null
          model_key: string
          prompt_template_key?: string | null
          prompt_version?: number | null
          provider_key: string
          psychology_review?: string | null
          raw?: Json | null
          risk_review?: string | null
          strengths?: Json | null
          suggested_take_profit?: string | null
          summary?: string | null
          superseded_by?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          trade_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          alternative_entries?: Json | null
          alternative_exits?: Json | null
          better_stop?: string | null
          confidence?: number | null
          created_at?: string
          execution_review?: string | null
          grade?: Database["public"]["Enums"]["ai_trade_grade"] | null
          id?: string
          latency_ms?: number | null
          missed_opportunities?: Json | null
          mistakes?: Json | null
          model_key?: string
          prompt_template_key?: string | null
          prompt_version?: number | null
          provider_key?: string
          psychology_review?: string | null
          raw?: Json | null
          risk_review?: string | null
          strengths?: Json | null
          suggested_take_profit?: string | null
          summary?: string | null
          superseded_by?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          trade_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_trade_reviews_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "ai_trade_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_trade_reviews_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          correlation_id: string | null
          cost_credits: number | null
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["ai_analysis_kind"] | null
          latency_ms: number | null
          model_key: string
          ok: boolean
          provider_key: string
          run_id: string | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          cost_credits?: number | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_analysis_kind"] | null
          latency_ms?: number | null
          model_key: string
          ok?: boolean
          provider_key: string
          run_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          cost_credits?: number | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_analysis_kind"] | null
          latency_ms?: number | null
          model_key?: string
          ok?: boolean
          provider_key?: string
          run_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: Json
          body: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          ends_at: string | null
          id: string
          kind: string
          published: boolean
          severity: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          body?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          kind: string
          published?: boolean
          severity?: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          body?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          published?: boolean
          severity?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          icon: string | null
          id: string
          slug: string
          tier: Database["public"]["Enums"]["badge_tier"]
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          slug: string
          tier?: Database["public"]["Enums"]["badge_tier"]
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          slug?: string
          tier?: Database["public"]["Enums"]["badge_tier"]
          title?: string
        }
        Relationships: []
      }
      battle_activity: {
        Row: {
          battle_id: string
          created_at: string
          id: string
          kind: string
          message: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          battle_id: string
          created_at?: string
          id?: string
          kind: string
          message: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          battle_id?: string
          created_at?: string
          id?: string
          kind?: string
          message?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battle_activity_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_chat: {
        Row: {
          battle_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          kind: string
          mentions: string[]
          message: string
          reactions: Json
          user_id: string | null
        }
        Insert: {
          battle_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          kind?: string
          mentions?: string[]
          message: string
          reactions?: Json
          user_id?: string | null
        }
        Update: {
          battle_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          kind?: string
          mentions?: string[]
          message?: string
          reactions?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battle_chat_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_events: {
        Row: {
          battle_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["battle_event_type"]
          id: string
          message: string
          metadata: Json
          severity: string
          user_id: string | null
        }
        Insert: {
          battle_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["battle_event_type"]
          id?: string
          message: string
          metadata?: Json
          severity?: string
          user_id?: string | null
        }
        Update: {
          battle_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["battle_event_type"]
          id?: string
          message?: string
          metadata?: Json
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battle_events_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_logs: {
        Row: {
          battle_id: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          metadata: Json
          user_id: string | null
        }
        Insert: {
          battle_id: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          battle_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battle_logs_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_notifications: {
        Row: {
          battle_id: string
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          battle_id: string
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          battle_id?: string
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_notifications_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_participants: {
        Row: {
          battle_id: string
          id: string
          joined_at: string
          left_at: string | null
          paper_account_id: string | null
          status: Database["public"]["Enums"]["battle_participant_status"]
          team: string | null
          user_id: string
        }
        Insert: {
          battle_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          paper_account_id?: string | null
          status?: Database["public"]["Enums"]["battle_participant_status"]
          team?: string | null
          user_id: string
        }
        Update: {
          battle_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          paper_account_id?: string | null
          status?: Database["public"]["Enums"]["battle_participant_status"]
          team?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_participants_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_participants_paper_account_id_fkey"
            columns: ["paper_account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_presence: {
        Row: {
          battle_id: string
          last_seen_at: string
          metadata: Json
          role: string
          status: Database["public"]["Enums"]["battle_presence_status"]
          user_id: string
        }
        Insert: {
          battle_id: string
          last_seen_at?: string
          metadata?: Json
          role?: string
          status?: Database["public"]["Enums"]["battle_presence_status"]
          user_id: string
        }
        Update: {
          battle_id?: string
          last_seen_at?: string
          metadata?: Json
          role?: string
          status?: Database["public"]["Enums"]["battle_presence_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_presence_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_rankings: {
        Row: {
          battle_id: string
          id: string
          max_drawdown: number
          pnl: number
          r_multiple: number
          rank: number
          score: number
          trades_count: number
          updated_at: string
          user_id: string
          win_rate: number
        }
        Insert: {
          battle_id: string
          id?: string
          max_drawdown?: number
          pnl?: number
          r_multiple?: number
          rank?: number
          score?: number
          trades_count?: number
          updated_at?: string
          user_id: string
          win_rate?: number
        }
        Update: {
          battle_id?: string
          id?: string
          max_drawdown?: number
          pnl?: number
          r_multiple?: number
          rank?: number
          score?: number
          trades_count?: number
          updated_at?: string
          user_id?: string
          win_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_rankings_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_results: {
        Row: {
          battle_id: string
          coins_awarded: number
          created_at: string
          final_rank: number
          id: string
          max_drawdown: number
          pnl: number
          r_multiple: number
          trades_count: number
          user_id: string
          win_rate: number
          xp_awarded: number
        }
        Insert: {
          battle_id: string
          coins_awarded?: number
          created_at?: string
          final_rank: number
          id?: string
          max_drawdown?: number
          pnl?: number
          r_multiple?: number
          trades_count?: number
          user_id: string
          win_rate?: number
          xp_awarded?: number
        }
        Update: {
          battle_id?: string
          coins_awarded?: number
          created_at?: string
          final_rank?: number
          id?: string
          max_drawdown?: number
          pnl?: number
          r_multiple?: number
          trades_count?: number
          user_id?: string
          win_rate?: number
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_results_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_statistics_live: {
        Row: {
          active_positions: number
          avg_drawdown: number
          avg_pnl: number
          avg_rr: number
          avg_win_rate: number
          battle_id: string
          best_avg_rr: number
          best_win_rate: number
          highest_pnl: number
          highest_r: number
          leader_pnl: number
          leader_user_id: string | null
          lowest_drawdown: number
          most_trades: number
          trades_closed: number
          trades_open: number
          updated_at: string
          win_percentage: number
        }
        Insert: {
          active_positions?: number
          avg_drawdown?: number
          avg_pnl?: number
          avg_rr?: number
          avg_win_rate?: number
          battle_id: string
          best_avg_rr?: number
          best_win_rate?: number
          highest_pnl?: number
          highest_r?: number
          leader_pnl?: number
          leader_user_id?: string | null
          lowest_drawdown?: number
          most_trades?: number
          trades_closed?: number
          trades_open?: number
          updated_at?: string
          win_percentage?: number
        }
        Update: {
          active_positions?: number
          avg_drawdown?: number
          avg_pnl?: number
          avg_rr?: number
          avg_win_rate?: number
          battle_id?: string
          best_avg_rr?: number
          best_win_rate?: number
          highest_pnl?: number
          highest_r?: number
          leader_pnl?: number
          leader_user_id?: string | null
          lowest_drawdown?: number
          most_trades?: number
          trades_closed?: number
          trades_open?: number
          updated_at?: string
          win_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_statistics_live_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: true
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_templates: {
        Row: {
          allowed_symbols: string[]
          battle_type: Database["public"]["Enums"]["battle_type_kind"]
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_official: boolean
          is_public: boolean
          market: Database["public"]["Enums"]["battle_market"]
          max_daily_loss_pct: number
          max_drawdown_pct: number
          max_risk_pct: number
          max_trades: number | null
          name: string
          owner_id: string | null
          starting_balance: number
          updated_at: string
          win_condition: Database["public"]["Enums"]["battle_win_condition"]
        }
        Insert: {
          allowed_symbols?: string[]
          battle_type?: Database["public"]["Enums"]["battle_type_kind"]
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_official?: boolean
          is_public?: boolean
          market?: Database["public"]["Enums"]["battle_market"]
          max_daily_loss_pct?: number
          max_drawdown_pct?: number
          max_risk_pct?: number
          max_trades?: number | null
          name: string
          owner_id?: string | null
          starting_balance?: number
          updated_at?: string
          win_condition?: Database["public"]["Enums"]["battle_win_condition"]
        }
        Update: {
          allowed_symbols?: string[]
          battle_type?: Database["public"]["Enums"]["battle_type_kind"]
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_official?: boolean
          is_public?: boolean
          market?: Database["public"]["Enums"]["battle_market"]
          max_daily_loss_pct?: number
          max_drawdown_pct?: number
          max_risk_pct?: number
          max_trades?: number | null
          name?: string
          owner_id?: string | null
          starting_balance?: number
          updated_at?: string
          win_condition?: Database["public"]["Enums"]["battle_win_condition"]
        }
        Relationships: []
      }
      battles: {
        Row: {
          allowed_symbols: string[]
          battle_type: Database["public"]["Enums"]["battle_type_kind"]
          created_at: string
          description: string | null
          end_at: string
          featured: boolean
          host_id: string
          id: string
          invite_code: string | null
          market: Database["public"]["Enums"]["battle_market"]
          max_daily_loss_pct: number
          max_drawdown_pct: number
          max_participants: number
          max_risk_pct: number
          max_trades: number | null
          name: string
          start_at: string
          starting_balance: number
          status: Database["public"]["Enums"]["battle_status"]
          target_value: number | null
          timezone: string
          updated_at: string
          visibility: Database["public"]["Enums"]["battle_visibility"]
          win_condition: Database["public"]["Enums"]["battle_win_condition"]
          winner_user_id: string | null
        }
        Insert: {
          allowed_symbols?: string[]
          battle_type?: Database["public"]["Enums"]["battle_type_kind"]
          created_at?: string
          description?: string | null
          end_at: string
          featured?: boolean
          host_id: string
          id?: string
          invite_code?: string | null
          market?: Database["public"]["Enums"]["battle_market"]
          max_daily_loss_pct?: number
          max_drawdown_pct?: number
          max_participants?: number
          max_risk_pct?: number
          max_trades?: number | null
          name: string
          start_at: string
          starting_balance?: number
          status?: Database["public"]["Enums"]["battle_status"]
          target_value?: number | null
          timezone?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["battle_visibility"]
          win_condition?: Database["public"]["Enums"]["battle_win_condition"]
          winner_user_id?: string | null
        }
        Update: {
          allowed_symbols?: string[]
          battle_type?: Database["public"]["Enums"]["battle_type_kind"]
          created_at?: string
          description?: string | null
          end_at?: string
          featured?: boolean
          host_id?: string
          id?: string
          invite_code?: string | null
          market?: Database["public"]["Enums"]["battle_market"]
          max_daily_loss_pct?: number
          max_drawdown_pct?: number
          max_participants?: number
          max_risk_pct?: number
          max_trades?: number | null
          name?: string
          start_at?: string
          starting_balance?: number
          status?: Database["public"]["Enums"]["battle_status"]
          target_value?: number | null
          timezone?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["battle_visibility"]
          win_condition?: Database["public"]["Enums"]["battle_win_condition"]
          winner_user_id?: string | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["challenge_category"]
          coin_reward: number
          created_at: string
          criteria: Json
          description: string
          difficulty: Database["public"]["Enums"]["challenge_difficulty"]
          ends_at: string | null
          estimated_minutes: number | null
          icon: string | null
          id: string
          metric: string
          scope: Database["public"]["Enums"]["challenge_scope"]
          slug: string
          sort_order: number
          starts_at: string | null
          target: number
          title: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          active?: boolean
          category?: Database["public"]["Enums"]["challenge_category"]
          coin_reward?: number
          created_at?: string
          criteria?: Json
          description: string
          difficulty?: Database["public"]["Enums"]["challenge_difficulty"]
          ends_at?: string | null
          estimated_minutes?: number | null
          icon?: string | null
          id?: string
          metric: string
          scope?: Database["public"]["Enums"]["challenge_scope"]
          slug: string
          sort_order?: number
          starts_at?: string | null
          target?: number
          title: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["challenge_category"]
          coin_reward?: number
          created_at?: string
          criteria?: Json
          description?: string
          difficulty?: Database["public"]["Enums"]["challenge_difficulty"]
          ends_at?: string | null
          estimated_minutes?: number | null
          icon?: string | null
          id?: string
          metric?: string
          scope?: Database["public"]["Enums"]["challenge_scope"]
          slug?: string
          sort_order?: number
          starts_at?: string | null
          target?: number
          title?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: []
      }
      chart_alerts: {
        Row: {
          alert_type: string
          condition: string
          created_at: string
          id: string
          indicator: string | null
          is_active: boolean
          message: string | null
          notify_channels: Json
          params: Json
          symbol: string
          target_price: number | null
          triggered_at: string | null
          triggered_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type?: string
          condition?: string
          created_at?: string
          id?: string
          indicator?: string | null
          is_active?: boolean
          message?: string | null
          notify_channels?: Json
          params?: Json
          symbol: string
          target_price?: number | null
          triggered_at?: string | null
          triggered_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          condition?: string
          created_at?: string
          id?: string
          indicator?: string | null
          is_active?: boolean
          message?: string | null
          notify_channels?: Json
          params?: Json
          symbol?: string
          target_price?: number | null
          triggered_at?: string | null
          triggered_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_drawings: {
        Row: {
          created_at: string
          id: string
          layout_id: string | null
          locked: boolean
          points: Json
          style: Json
          symbol: string
          text: string | null
          timeframe: string | null
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          layout_id?: string | null
          locked?: boolean
          points?: Json
          style?: Json
          symbol: string
          text?: string | null
          timeframe?: string | null
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          layout_id?: string | null
          locked?: boolean
          points?: Json
          style?: Json
          symbol?: string
          text?: string | null
          timeframe?: string | null
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_drawings_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "chart_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_history: {
        Row: {
          id: string
          symbol: string
          timeframe: string | null
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          symbol: string
          timeframe?: string | null
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          symbol?: string
          timeframe?: string | null
          user_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      chart_indicator_sets: {
        Row: {
          created_at: string
          id: string
          indicators: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          indicators?: Json
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          indicators?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_layouts: {
        Row: {
          auto_save: boolean
          created_at: string
          drawings: Json
          grid: string
          id: string
          indicators: Json
          is_default: boolean
          name: string
          settings: Json
          symbols: Json
          timeframes: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_save?: boolean
          created_at?: string
          drawings?: Json
          grid?: string
          id?: string
          indicators?: Json
          is_default?: boolean
          name: string
          settings?: Json
          symbols?: Json
          timeframes?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_save?: boolean
          created_at?: string
          drawings?: Json
          grid?: string
          id?: string
          indicators?: Json
          is_default?: boolean
          name?: string
          settings?: Json
          symbols?: Json
          timeframes?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_notes: {
        Row: {
          bar_time: number | null
          color: string | null
          content: string
          created_at: string
          id: string
          price: number | null
          symbol: string
          timeframe: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bar_time?: number | null
          color?: string | null
          content: string
          created_at?: string
          id?: string
          price?: number | null
          symbol: string
          timeframe?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bar_time?: number | null
          color?: string | null
          content?: string
          created_at?: string
          id?: string
          price?: number | null
          symbol?: string
          timeframe?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_preferences: {
        Row: {
          auto_scale: boolean
          created_at: string
          crosshair: string
          default_chart_type: string
          default_symbol: string
          default_timeframe: string
          log_scale: boolean
          price_format: string
          session_shading: boolean
          settings: Json
          show_grid: boolean
          theme: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_scale?: boolean
          created_at?: string
          crosshair?: string
          default_chart_type?: string
          default_symbol?: string
          default_timeframe?: string
          log_scale?: boolean
          price_format?: string
          session_shading?: boolean
          settings?: Json
          show_grid?: boolean
          theme?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_scale?: boolean
          created_at?: string
          crosshair?: string
          default_chart_type?: string
          default_symbol?: string
          default_timeframe?: string
          log_scale?: boolean
          price_format?: string
          session_shading?: boolean
          settings?: Json
          show_grid?: boolean
          theme?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_templates: {
        Row: {
          chart_type: string
          colors: Json
          created_at: string
          drawings: Json
          id: string
          indicators: Json
          name: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          chart_type?: string
          colors?: Json
          created_at?: string
          drawings?: Json
          id?: string
          indicators?: Json
          name: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          chart_type?: string
          colors?: Json
          created_at?: string
          drawings?: Json
          id?: string
          indicators?: Json
          name?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coin_transactions: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          reason: string
          source: string
          source_id: string | null
          user_id: string
        }
        Insert: {
          balance_after?: number
          created_at?: string
          delta: number
          id?: string
          reason: string
          source: string
          source_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          source?: string
          source_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      community_bookmarks: {
        Row: {
          created_at: string
          id: string
          note: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          post_count: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          post_count?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          post_count?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      community_comments: {
        Row: {
          author_id: string
          body_html: string | null
          body_md: string
          created_at: string
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_edited: boolean
          like_count: number
          mentions: string[]
          parent_id: string | null
          post_id: string
          reply_count: number
          updated_at: string
        }
        Insert: {
          author_id: string
          body_html?: string | null
          body_md: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          like_count?: number
          mentions?: string[]
          parent_id?: string | null
          post_id: string
          reply_count?: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          body_html?: string | null
          body_md?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          like_count?: number
          mentions?: string[]
          parent_id?: string | null
          post_id?: string
          reply_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_followers: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
          is_blocked: boolean
          is_muted: boolean
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          is_blocked?: boolean
          is_muted?: boolean
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          is_blocked?: boolean
          is_muted?: boolean
        }
        Relationships: []
      }
      community_notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: Database["public"]["Enums"]["community_notification_kind"]
          message: string | null
          post_id: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind: Database["public"]["Enums"]["community_notification_kind"]
          message?: string | null
          post_id?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: Database["public"]["Enums"]["community_notification_kind"]
          message?: string | null
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          attachments: Json
          author_id: string
          body_html: string | null
          body_md: string | null
          bookmark_count: number
          category_id: string | null
          comment_count: number
          created_at: string
          direction: string | null
          edited_at: string | null
          excerpt: string | null
          hashtags: string[]
          helpful_count: number
          id: string
          is_deleted: boolean
          is_draft: boolean
          is_featured: boolean
          is_locked: boolean
          is_pinned: boolean
          is_published: boolean
          like_count: number
          linked_battle_id: string | null
          linked_journal_id: string | null
          linked_replay_id: string | null
          linked_strategy_id: string | null
          linked_trade_id: string | null
          market: string | null
          media: Json
          mentions: string[]
          poll: Json | null
          post_type: Database["public"]["Enums"]["community_post_type"]
          published_at: string | null
          share_count: number
          symbol: string | null
          title: string | null
          trending_score: number
          updated_at: string
          view_count: number
          visibility: string
        }
        Insert: {
          attachments?: Json
          author_id: string
          body_html?: string | null
          body_md?: string | null
          bookmark_count?: number
          category_id?: string | null
          comment_count?: number
          created_at?: string
          direction?: string | null
          edited_at?: string | null
          excerpt?: string | null
          hashtags?: string[]
          helpful_count?: number
          id?: string
          is_deleted?: boolean
          is_draft?: boolean
          is_featured?: boolean
          is_locked?: boolean
          is_pinned?: boolean
          is_published?: boolean
          like_count?: number
          linked_battle_id?: string | null
          linked_journal_id?: string | null
          linked_replay_id?: string | null
          linked_strategy_id?: string | null
          linked_trade_id?: string | null
          market?: string | null
          media?: Json
          mentions?: string[]
          poll?: Json | null
          post_type?: Database["public"]["Enums"]["community_post_type"]
          published_at?: string | null
          share_count?: number
          symbol?: string | null
          title?: string | null
          trending_score?: number
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Update: {
          attachments?: Json
          author_id?: string
          body_html?: string | null
          body_md?: string | null
          bookmark_count?: number
          category_id?: string | null
          comment_count?: number
          created_at?: string
          direction?: string | null
          edited_at?: string | null
          excerpt?: string | null
          hashtags?: string[]
          helpful_count?: number
          id?: string
          is_deleted?: boolean
          is_draft?: boolean
          is_featured?: boolean
          is_locked?: boolean
          is_pinned?: boolean
          is_published?: boolean
          like_count?: number
          linked_battle_id?: string | null
          linked_journal_id?: string | null
          linked_replay_id?: string | null
          linked_strategy_id?: string | null
          linked_trade_id?: string | null
          market?: string | null
          media?: Json
          mentions?: string[]
          poll?: Json | null
          post_type?: Database["public"]["Enums"]["community_post_type"]
          published_at?: string | null
          share_count?: number
          symbol?: string | null
          title?: string | null
          trending_score?: number
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "community_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_linked_battle_id_fkey"
            columns: ["linked_battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_linked_journal_id_fkey"
            columns: ["linked_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_linked_replay_id_fkey"
            columns: ["linked_replay_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_linked_strategy_id_fkey"
            columns: ["linked_strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_linked_trade_id_fkey"
            columns: ["linked_trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["community_reaction_kind"]
          post_id: string | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["community_reaction_kind"]
          post_id?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["community_reaction_kind"]
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          comment_id: string | null
          created_at: string
          details: string | null
          id: string
          post_id: string | null
          reason: string
          reporter_id: string
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["community_report_status"]
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          reason: string
          reporter_id: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["community_report_status"]
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["community_report_status"]
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reputation: {
        Row: {
          comments_count: number
          helpful_received: number
          insightful_received: number
          is_battle_champion: boolean
          is_educator: boolean
          is_mentor: boolean
          is_monthly_champion: boolean
          is_top_contributor: boolean
          is_verified: boolean
          likes_received: number
          posts_count: number
          reputation_score: number
          strategies_shared: number
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          comments_count?: number
          helpful_received?: number
          insightful_received?: number
          is_battle_champion?: boolean
          is_educator?: boolean
          is_mentor?: boolean
          is_monthly_champion?: boolean
          is_top_contributor?: boolean
          is_verified?: boolean
          likes_received?: number
          posts_count?: number
          reputation_score?: number
          strategies_shared?: number
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          comments_count?: number
          helpful_received?: number
          insightful_received?: number
          is_battle_champion?: boolean
          is_educator?: boolean
          is_mentor?: boolean
          is_monthly_champion?: boolean
          is_top_contributor?: boolean
          is_verified?: boolean
          likes_received?: number
          posts_count?: number
          reputation_score?: number
          strategies_shared?: number
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_tags: {
        Row: {
          created_at: string
          id: string
          is_trending: boolean
          name: string
          post_count: number
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_trending?: boolean
          name: string
          post_count?: number
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_trending?: boolean
          name?: string
          post_count?: number
          slug?: string
        }
        Relationships: []
      }
      content_pages: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          published: boolean
          slug: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          published?: boolean
          slug: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          published?: boolean
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      daily_claims: {
        Row: {
          claim_date: string
          coin_reward: number
          created_at: string
          day_index: number
          id: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          claim_date: string
          coin_reward?: number
          created_at?: string
          day_index?: number
          id?: string
          user_id: string
          xp_reward?: number
        }
        Update: {
          claim_date?: string
          coin_reward?: number
          created_at?: string
          day_index?: number
          id?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: []
      }
      dashboard_layouts: {
        Row: {
          created_at: string
          id: string
          layout: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_symbols: {
        Row: {
          created_at: string
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          audience: Json
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          label: string
          rollout_percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          label: string
          rollout_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          label?: string
          rollout_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      gamification_stats: {
        Row: {
          best_login_streak: number
          challenge_streak: number
          journal_streak: number
          last_journal_date: string | null
          last_login_date: string | null
          last_trade_date: string | null
          login_streak: number
          total_challenges_completed: number
          trading_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_login_streak?: number
          challenge_streak?: number
          journal_streak?: number
          last_journal_date?: string | null
          last_login_date?: string | null
          last_trade_date?: string | null
          login_streak?: number
          total_challenges_completed?: number
          trading_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_login_streak?: number
          challenge_streak?: number
          journal_streak?: number
          last_journal_date?: string | null
          last_login_date?: string | null
          last_trade_date?: string | null
          login_streak?: number
          total_challenges_completed?: number
          trading_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_tracking: {
        Row: {
          active: boolean
          created_at: string
          end_date: string | null
          id: string
          kind: string
          name: string
          period: string
          start_date: string | null
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          kind: string
          name: string
          period?: string
          start_date?: string | null
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          kind?: string
          name?: string
          period?: string
          start_date?: string | null
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historical_cache: {
        Row: {
          candle_count: number
          created_at: string
          expires_at: string | null
          fetched_at: string
          id: string
          provider_code: string
          range_end: string
          range_start: string
          symbol: string
          timeframe: Database["public"]["Enums"]["timeframe_kind"]
          updated_at: string
        }
        Insert: {
          candle_count?: number
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          provider_code: string
          range_end: string
          range_start: string
          symbol: string
          timeframe: Database["public"]["Enums"]["timeframe_kind"]
          updated_at?: string
        }
        Update: {
          candle_count?: number
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          provider_code?: string
          range_end?: string
          range_start?: string
          symbol?: string
          timeframe?: Database["public"]["Enums"]["timeframe_kind"]
          updated_at?: string
        }
        Relationships: []
      }
      historical_candles: {
        Row: {
          close: number
          created_at: string
          high: number
          id: number
          low: number
          open: number
          provider_code: string
          symbol: string
          timeframe: Database["public"]["Enums"]["timeframe_kind"]
          ts: string
          volume: number
        }
        Insert: {
          close: number
          created_at?: string
          high: number
          id?: number
          low: number
          open: number
          provider_code?: string
          symbol: string
          timeframe: Database["public"]["Enums"]["timeframe_kind"]
          ts: string
          volume?: number
        }
        Update: {
          close?: number
          created_at?: string
          high?: number
          id?: number
          low?: number
          open?: number
          provider_code?: string
          symbol?: string
          timeframe?: Database["public"]["Enums"]["timeframe_kind"]
          ts?: string
          volume?: number
        }
        Relationships: []
      }
      journal_attachments: {
        Row: {
          bucket: string
          content_type: string | null
          created_at: string
          entry_id: string
          id: string
          kind: string
          name: string | null
          path: string
          size_bytes: number | null
          user_id: string
        }
        Insert: {
          bucket: string
          content_type?: string | null
          created_at?: string
          entry_id: string
          id?: string
          kind: string
          name?: string | null
          path: string
          size_bytes?: number | null
          user_id: string
        }
        Update: {
          bucket?: string
          content_type?: string | null
          created_at?: string
          entry_id?: string
          id?: string
          kind?: string
          name?: string | null
          path?: string
          size_bytes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          account_id: string | null
          ai_mistake_detection: Json | null
          ai_psychology: Json | null
          ai_review: Json | null
          ai_suggestions: Json | null
          checklist: Json
          closed_at: string | null
          commission: number | null
          created_at: string
          deleted_at: string | null
          direction: string | null
          discipline: number | null
          duration_seconds: number | null
          emotions: string[]
          entry_price: number | null
          entry_quality: number | null
          execution: number | null
          exit_price: number | null
          exit_quality: number | null
          grade: Database["public"]["Enums"]["journal_grade"] | null
          id: string
          is_favorite: boolean
          is_public: boolean
          lot_size: number | null
          market: string | null
          mistakes: string[]
          moderation_status: string | null
          notes_html: string | null
          notes_text: string | null
          opened_at: string | null
          patience: number | null
          pnl: number | null
          reward_pct: number | null
          risk_mgmt: number | null
          risk_pct: number | null
          rr: number | null
          screenshots: string[]
          session: Database["public"]["Enums"]["journal_session"] | null
          setup: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["journal_status"]
          stop_loss: number | null
          strategy: string | null
          strategy_id: string | null
          swap: number | null
          symbol: string | null
          take_profit: number | null
          trade_id: string | null
          updated_at: string
          user_id: string
          word_count: number
        }
        Insert: {
          account_id?: string | null
          ai_mistake_detection?: Json | null
          ai_psychology?: Json | null
          ai_review?: Json | null
          ai_suggestions?: Json | null
          checklist?: Json
          closed_at?: string | null
          commission?: number | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          discipline?: number | null
          duration_seconds?: number | null
          emotions?: string[]
          entry_price?: number | null
          entry_quality?: number | null
          execution?: number | null
          exit_price?: number | null
          exit_quality?: number | null
          grade?: Database["public"]["Enums"]["journal_grade"] | null
          id?: string
          is_favorite?: boolean
          is_public?: boolean
          lot_size?: number | null
          market?: string | null
          mistakes?: string[]
          moderation_status?: string | null
          notes_html?: string | null
          notes_text?: string | null
          opened_at?: string | null
          patience?: number | null
          pnl?: number | null
          reward_pct?: number | null
          risk_mgmt?: number | null
          risk_pct?: number | null
          rr?: number | null
          screenshots?: string[]
          session?: Database["public"]["Enums"]["journal_session"] | null
          setup?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          stop_loss?: number | null
          strategy?: string | null
          strategy_id?: string | null
          swap?: number | null
          symbol?: string | null
          take_profit?: number | null
          trade_id?: string | null
          updated_at?: string
          user_id: string
          word_count?: number
        }
        Update: {
          account_id?: string | null
          ai_mistake_detection?: Json | null
          ai_psychology?: Json | null
          ai_review?: Json | null
          ai_suggestions?: Json | null
          checklist?: Json
          closed_at?: string | null
          commission?: number | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          discipline?: number | null
          duration_seconds?: number | null
          emotions?: string[]
          entry_price?: number | null
          entry_quality?: number | null
          execution?: number | null
          exit_price?: number | null
          exit_quality?: number | null
          grade?: Database["public"]["Enums"]["journal_grade"] | null
          id?: string
          is_favorite?: boolean
          is_public?: boolean
          lot_size?: number | null
          market?: string | null
          mistakes?: string[]
          moderation_status?: string | null
          notes_html?: string | null
          notes_text?: string | null
          opened_at?: string | null
          patience?: number | null
          pnl?: number | null
          reward_pct?: number | null
          risk_mgmt?: number | null
          risk_pct?: number | null
          rr?: number | null
          screenshots?: string[]
          session?: Database["public"]["Enums"]["journal_session"] | null
          setup?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          stop_loss?: number | null
          strategy?: string | null
          strategy_id?: string | null
          swap?: number | null
          symbol?: string | null
          take_profit?: number | null
          trade_id?: string | null
          updated_at?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_tags: {
        Row: {
          created_at: string
          entry_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_tags_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "journal_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_history: {
        Row: {
          action: string
          created_at: string
          entry_id: string
          id: string
          snapshot: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entry_id: string
          id?: string
          snapshot?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entry_id?: string
          id?: string
          snapshot?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_taxonomy: {
        Row: {
          color: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["journal_taxonomy_kind"]
          label: string
          user_id: string
          value: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["journal_taxonomy_kind"]
          label: string
          user_id: string
          value: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["journal_taxonomy_kind"]
          label?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      leaderboard_snapshots: {
        Row: {
          category: string
          id: string
          period: string
          period_key: string
          rank: number
          scope: string
          taken_at: string
          user_id: string
          value: number
        }
        Insert: {
          category: string
          id?: string
          period: string
          period_key: string
          rank: number
          scope?: string
          taken_at?: string
          user_id: string
          value?: number
        }
        Update: {
          category?: string
          id?: string
          period?: string
          period_key?: string
          rank?: number
          scope?: string
          taken_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      live_quotes: {
        Row: {
          ask: number | null
          bid: number | null
          change_pct: number | null
          close: number | null
          high: number | null
          id: string
          last: number | null
          low: number | null
          open: number | null
          provider_code: string
          spread: number | null
          symbol: string
          ts: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          ask?: number | null
          bid?: number | null
          change_pct?: number | null
          close?: number | null
          high?: number | null
          id?: string
          last?: number | null
          low?: number | null
          open?: number | null
          provider_code?: string
          spread?: number | null
          symbol: string
          ts?: string
          updated_at?: string
          volume?: number | null
        }
        Update: {
          ask?: number | null
          bid?: number | null
          change_pct?: number | null
          close?: number | null
          high?: number | null
          id?: string
          last?: number | null
          low?: number | null
          open?: number | null
          provider_code?: string
          spread?: number | null
          symbol?: string
          ts?: string
          updated_at?: string
          volume?: number | null
        }
        Relationships: []
      }
      maintenance_windows: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          message: string | null
          starts_at: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          message?: string | null
          starts_at: string
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          message?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      market_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          is_full_day: boolean
          market_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          is_full_day?: boolean
          market_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          is_full_day?: boolean
          market_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_holidays_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_providers: {
        Row: {
          code: string
          config: Json
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          is_enabled: boolean
          last_health_at: string | null
          last_health_ok: boolean | null
          last_latency_ms: number | null
          markets: Database["public"]["Enums"]["market_kind"][]
          name: string
          priority: number
          supports_historical: boolean
          supports_rest: boolean
          supports_streaming: boolean
          supports_ws: boolean
          updated_at: string
        }
        Insert: {
          code: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          last_health_at?: string | null
          last_health_ok?: boolean | null
          last_latency_ms?: number | null
          markets?: Database["public"]["Enums"]["market_kind"][]
          name: string
          priority?: number
          supports_historical?: boolean
          supports_rest?: boolean
          supports_streaming?: boolean
          supports_ws?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          last_health_at?: string | null
          last_health_ok?: boolean | null
          last_latency_ms?: number | null
          markets?: Database["public"]["Enums"]["market_kind"][]
          name?: string
          priority?: number
          supports_historical?: boolean
          supports_rest?: boolean
          supports_streaming?: boolean
          supports_ws?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      market_sessions: {
        Row: {
          close_utc_minute: number
          code: string
          color: string | null
          created_at: string
          id: string
          market_kind: Database["public"]["Enums"]["market_kind"]
          name: string
          open_utc_minute: number
          sort_order: number
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          close_utc_minute: number
          code: string
          color?: string | null
          created_at?: string
          id?: string
          market_kind?: Database["public"]["Enums"]["market_kind"]
          name: string
          open_utc_minute: number
          sort_order?: number
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          close_utc_minute?: number
          code?: string
          color?: string | null
          created_at?: string
          id?: string
          market_kind?: Database["public"]["Enums"]["market_kind"]
          name?: string
          open_utc_minute?: number
          sort_order?: number
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      market_status: {
        Row: {
          id: string
          market_id: string
          next_close: string | null
          next_open: string | null
          status: Database["public"]["Enums"]["market_status_kind"]
          updated_at: string
        }
        Insert: {
          id?: string
          market_id: string
          next_close?: string | null
          next_open?: string | null
          status?: Database["public"]["Enums"]["market_status_kind"]
          updated_at?: string
        }
        Update: {
          id?: string
          market_id?: string
          next_close?: string | null
          next_open?: string | null
          status?: Database["public"]["Enums"]["market_status_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_status_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: true
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_subscriptions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          provider_code: string
          symbol: string
          timeframe: Database["public"]["Enums"]["timeframe_kind"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          provider_code: string
          symbol: string
          timeframe?: Database["public"]["Enums"]["timeframe_kind"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          provider_code?: string
          symbol?: string
          timeframe?: Database["public"]["Enums"]["timeframe_kind"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      markets: {
        Row: {
          code: string
          created_at: string
          id: string
          is_24_7: boolean
          kind: Database["public"]["Enums"]["market_kind"]
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_24_7?: boolean
          kind: Database["public"]["Enums"]["market_kind"]
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_24_7?: boolean
          kind?: Database["public"]["Enums"]["market_kind"]
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_campaigns: {
        Row: {
          audience: Json
          body: string | null
          channel: string
          created_at: string
          created_by: string | null
          id: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          body?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          body?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          achievements: boolean
          challenges: boolean
          created_at: string
          id: string
          leaderboard: boolean
          system: boolean
          trades: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          achievements?: boolean
          challenges?: boolean
          created_at?: string
          id?: string
          leaderboard?: boolean
          system?: boolean
          trades?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          achievements?: boolean
          challenges?: boolean
          created_at?: string
          id?: string
          leaderboard?: boolean
          system?: boolean
          trades?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          delivered_at: string | null
          id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_accounts: {
        Row: {
          balance: number
          battle_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          equity: number
          id: string
          is_active: boolean
          is_archived: boolean
          leverage: number
          max_daily_risk_pct: number
          max_trade_risk_pct: number
          name: string
          starting_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          battle_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          equity?: number
          id?: string
          is_active?: boolean
          is_archived?: boolean
          leverage?: number
          max_daily_risk_pct?: number
          max_trade_risk_pct?: number
          name: string
          starting_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          battle_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          equity?: number
          id?: string
          is_active?: boolean
          is_archived?: boolean
          leverage?: number
          max_daily_risk_pct?: number
          max_trade_risk_pct?: number
          name?: string
          starting_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_accounts_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_orders: {
        Row: {
          account_id: string
          cancelled_at: string | null
          created_at: string
          direction: Database["public"]["Enums"]["paper_direction"]
          expires_at: string | null
          filled_at: string | null
          id: string
          limit_price: number | null
          lot_size: number
          market: Database["public"]["Enums"]["paper_market"]
          notes: string | null
          order_type: Database["public"]["Enums"]["paper_order_type"]
          status: Database["public"]["Enums"]["paper_order_status"]
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          trade_id: string | null
          trigger_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          cancelled_at?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["paper_direction"]
          expires_at?: string | null
          filled_at?: string | null
          id?: string
          limit_price?: number | null
          lot_size: number
          market: Database["public"]["Enums"]["paper_market"]
          notes?: string | null
          order_type: Database["public"]["Enums"]["paper_order_type"]
          status?: Database["public"]["Enums"]["paper_order_status"]
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          trade_id?: string | null
          trigger_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          cancelled_at?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["paper_direction"]
          expires_at?: string | null
          filled_at?: string | null
          id?: string
          limit_price?: number | null
          lot_size?: number
          market?: Database["public"]["Enums"]["paper_market"]
          notes?: string | null
          order_type?: Database["public"]["Enums"]["paper_order_type"]
          status?: Database["public"]["Enums"]["paper_order_status"]
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          trade_id?: string | null
          trigger_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_orders_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trades: {
        Row: {
          account_id: string
          battle_id: string | null
          close_reason: Database["public"]["Enums"]["paper_close_reason"] | null
          closed_at: string | null
          commission: number
          created_at: string
          deleted_at: string | null
          direction: Database["public"]["Enums"]["paper_direction"]
          entry_price: number
          exit_price: number | null
          id: string
          lot_size: number
          market: Database["public"]["Enums"]["paper_market"]
          notes: string | null
          opened_at: string
          order_type: Database["public"]["Enums"]["paper_order_type"]
          pnl: number | null
          pnl_pct: number | null
          reward_amount: number | null
          risk_amount: number | null
          rr_planned: number | null
          rr_realized: number | null
          screenshot_path: string | null
          status: Database["public"]["Enums"]["paper_trade_status"]
          stop_loss: number | null
          strategy_id: string | null
          swap: number
          symbol: string
          take_profit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          battle_id?: string | null
          close_reason?:
            | Database["public"]["Enums"]["paper_close_reason"]
            | null
          closed_at?: string | null
          commission?: number
          created_at?: string
          deleted_at?: string | null
          direction: Database["public"]["Enums"]["paper_direction"]
          entry_price: number
          exit_price?: number | null
          id?: string
          lot_size: number
          market: Database["public"]["Enums"]["paper_market"]
          notes?: string | null
          opened_at?: string
          order_type?: Database["public"]["Enums"]["paper_order_type"]
          pnl?: number | null
          pnl_pct?: number | null
          reward_amount?: number | null
          risk_amount?: number | null
          rr_planned?: number | null
          rr_realized?: number | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["paper_trade_status"]
          stop_loss?: number | null
          strategy_id?: string | null
          swap?: number
          symbol: string
          take_profit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          battle_id?: string | null
          close_reason?:
            | Database["public"]["Enums"]["paper_close_reason"]
            | null
          closed_at?: string | null
          commission?: number
          created_at?: string
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["paper_direction"]
          entry_price?: number
          exit_price?: number | null
          id?: string
          lot_size?: number
          market?: Database["public"]["Enums"]["paper_market"]
          notes?: string | null
          opened_at?: string
          order_type?: Database["public"]["Enums"]["paper_order_type"]
          pnl?: number | null
          pnl_pct?: number | null
          reward_amount?: number | null
          risk_amount?: number | null
          rr_planned?: number | null
          rr_realized?: number | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["paper_trade_status"]
          stop_loss?: number | null
          strategy_id?: string | null
          swap?: number
          symbol?: string
          take_profit?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_trades_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_watchlist_symbols: {
        Row: {
          created_at: string
          id: string
          is_favorite: boolean
          market: Database["public"]["Enums"]["paper_market"]
          sort_order: number
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          market: Database["public"]["Enums"]["paper_market"]
          sort_order?: number
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          market?: Database["public"]["Enums"]["paper_market"]
          sort_order?: number
          symbol?: string
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_watchlist_symbols_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "paper_watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_watchlists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          market: Database["public"]["Enums"]["paper_market"] | null
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          market?: Database["public"]["Enums"]["paper_market"] | null
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          market?: Database["public"]["Enums"]["paper_market"] | null
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      position_history: {
        Row: {
          account_id: string
          created_at: string
          event: string
          id: string
          payload: Json
          trade_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          event: string
          id?: string
          payload?: Json
          trade_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          event?: string
          id?: string
          payload?: Json
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_history_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["price_alert_kind"]
          note: string | null
          symbol: string
          target_price: number
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["price_alert_kind"]
          note?: string | null
          symbol: string
          target_price: number
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["price_alert_kind"]
          note?: string | null
          symbol?: string
          target_price?: number
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_customization: {
        Row: {
          banner_url: string | null
          created_at: string
          discord_handle: string | null
          favorite_pair: string | null
          headline: string | null
          telegram_handle: string | null
          updated_at: string
          user_id: string
          website: string | null
          x_handle: string | null
          youtube_url: string | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          discord_handle?: string | null
          favorite_pair?: string | null
          headline?: string | null
          telegram_handle?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          x_handle?: string | null
          youtube_url?: string | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          discord_handle?: string | null
          favorite_pair?: string | null
          headline?: string | null
          telegram_handle?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          x_handle?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      profile_privacy: {
        Row: {
          created_at: string
          eligible_for_leaderboard: boolean
          hide_activity: boolean
          hide_journal: boolean
          hide_profile: boolean
          hide_stats: boolean
          show_country: boolean
          show_league: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          eligible_for_leaderboard?: boolean
          hide_activity?: boolean
          hide_journal?: boolean
          hide_profile?: boolean
          hide_stats?: boolean
          show_country?: boolean
          show_league?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          eligible_for_leaderboard?: boolean
          hide_activity?: boolean
          hide_journal?: boolean
          hide_profile?: boolean
          hide_stats?: boolean
          show_country?: boolean
          show_league?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_views: {
        Row: {
          id: string
          profile_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accepted_terms_at: string | null
          admin_notes: string | null
          avatar_url: string | null
          bio: string | null
          coins: number
          country: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string | null
          experience: Database["public"]["Enums"]["trading_experience"] | null
          first_name: string | null
          goals: string[]
          id: string
          is_premium: boolean
          last_active_at: string | null
          last_name: string | null
          league: Database["public"]["Enums"]["league"]
          level: number
          onboarded: boolean
          preferred_market:
            | Database["public"]["Enums"]["preferred_market"]
            | null
          preferred_markets: string[]
          rank: number | null
          streak: number
          timezone: string | null
          trading_style: Database["public"]["Enums"]["trading_style"] | null
          updated_at: string
          username: string
          xp: number
        }
        Insert: {
          accepted_terms_at?: string | null
          admin_notes?: string | null
          avatar_url?: string | null
          bio?: string | null
          coins?: number
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          experience?: Database["public"]["Enums"]["trading_experience"] | null
          first_name?: string | null
          goals?: string[]
          id: string
          is_premium?: boolean
          last_active_at?: string | null
          last_name?: string | null
          league?: Database["public"]["Enums"]["league"]
          level?: number
          onboarded?: boolean
          preferred_market?:
            | Database["public"]["Enums"]["preferred_market"]
            | null
          preferred_markets?: string[]
          rank?: number | null
          streak?: number
          timezone?: string | null
          trading_style?: Database["public"]["Enums"]["trading_style"] | null
          updated_at?: string
          username: string
          xp?: number
        }
        Update: {
          accepted_terms_at?: string | null
          admin_notes?: string | null
          avatar_url?: string | null
          bio?: string | null
          coins?: number
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          experience?: Database["public"]["Enums"]["trading_experience"] | null
          first_name?: string | null
          goals?: string[]
          id?: string
          is_premium?: boolean
          last_active_at?: string | null
          last_name?: string | null
          league?: Database["public"]["Enums"]["league"]
          level?: number
          onboarded?: boolean
          preferred_market?:
            | Database["public"]["Enums"]["preferred_market"]
            | null
          preferred_markets?: string[]
          rank?: number | null
          streak?: number
          timezone?: string | null
          trading_style?: Database["public"]["Enums"]["trading_style"] | null
          updated_at?: string
          username?: string
          xp?: number
        }
        Relationships: []
      }
      provider_connections: {
        Row: {
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          last_error: string | null
          last_heartbeat: string | null
          latency_ms: number | null
          metadata: Json
          provider_id: string
          status: Database["public"]["Enums"]["provider_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat?: string | null
          latency_ms?: number | null
          metadata?: Json
          provider_id: string
          status?: Database["public"]["Enums"]["provider_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat?: string | null
          latency_ms?: number | null
          metadata?: Json
          provider_id?: string
          status?: Database["public"]["Enums"]["provider_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_connections_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "market_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credentials: {
        Row: {
          ciphertext: string
          created_at: string
          field_key: string
          id: string
          provider_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ciphertext: string
          created_at?: string
          field_key: string
          id?: string
          provider_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ciphertext?: string
          created_at?: string
          field_key?: string
          id?: string
          provider_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      provider_health_checks: {
        Row: {
          checked_at: string
          checked_by: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          ok: boolean
          provider_code: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          ok: boolean
          provider_code: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          provider_code?: string
        }
        Relationships: []
      }
      provider_market_assignments: {
        Row: {
          created_at: string
          fallback_code: string | null
          market_kind: string
          primary_code: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          fallback_code?: string | null
          market_kind: string
          primary_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          fallback_code?: string | null
          market_kind?: string
          primary_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      provider_symbols: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          metadata: Json
          native_symbol: string
          provider_id: string
          symbol_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          metadata?: Json
          native_symbol: string
          provider_id: string
          symbol_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          metadata?: Json
          native_symbol?: string
          provider_id?: string
          symbol_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_symbols_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "market_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_symbols_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_notes: {
        Row: {
          color: string
          content: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          id?: string
          payload: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      replay_bookmarks: {
        Row: {
          bookmark_ts: string
          category: string
          color: string | null
          created_at: string
          id: string
          label: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bookmark_ts: string
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bookmark_ts?: string
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_bookmarks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_checklists: {
        Row: {
          checked: boolean
          created_at: string
          id: string
          label: string
          session_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: string
          label: string
          session_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: string
          label?: string
          session_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_checklists_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_comparisons: {
        Row: {
          breakdown: Json
          created_at: string
          entry_diff: number | null
          exit_diff: number | null
          id: string
          original_trade_id: string | null
          replay_trade_id: string | null
          result_diff: number | null
          rr_diff: number | null
          session_id: string
          timing_diff_seconds: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          breakdown?: Json
          created_at?: string
          entry_diff?: number | null
          exit_diff?: number | null
          id?: string
          original_trade_id?: string | null
          replay_trade_id?: string | null
          result_diff?: number | null
          rr_diff?: number | null
          session_id: string
          timing_diff_seconds?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          breakdown?: Json
          created_at?: string
          entry_diff?: number | null
          exit_diff?: number | null
          id?: string
          original_trade_id?: string | null
          replay_trade_id?: string | null
          result_diff?: number | null
          rr_diff?: number | null
          session_id?: string
          timing_diff_seconds?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_comparisons_replay_trade_id_fkey"
            columns: ["replay_trade_id"]
            isOneToOne: false
            referencedRelation: "replay_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replay_comparisons_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_drawings: {
        Row: {
          created_at: string
          geometry: Json
          id: string
          session_id: string
          style: Json
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          geometry?: Json
          id?: string
          session_id: string
          style?: Json
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          geometry?: Json
          id?: string
          session_id?: string
          style?: Json
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_drawings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_events: {
        Row: {
          created_at: string
          event_ts: string
          event_type: string
          id: string
          payload: Json
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_ts: string
          event_type: string
          id?: string
          payload?: Json
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_ts?: string
          event_type?: string
          id?: string
          payload?: Json
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_notes: {
        Row: {
          body: string
          chart_x: number | null
          chart_y: number | null
          created_at: string
          id: string
          note_ts: string
          screenshot_path: string | null
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          chart_x?: number | null
          chart_y?: number | null
          created_at?: string
          id?: string
          note_ts: string
          screenshot_path?: string | null
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          chart_x?: number | null
          chart_y?: number | null
          created_at?: string
          id?: string
          note_ts?: string
          screenshot_path?: string | null
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_scores: {
        Row: {
          breakdown: Json
          consistency: number
          created_at: string
          discipline: number
          execution: number
          id: string
          journal_completion: number
          patience: number
          risk: number
          score: number
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          breakdown?: Json
          consistency?: number
          created_at?: string
          discipline?: number
          execution?: number
          id?: string
          journal_completion?: number
          patience?: number
          risk?: number
          score?: number
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          breakdown?: Json
          consistency?: number
          created_at?: string
          discipline?: number
          execution?: number
          id?: string
          journal_completion?: number
          patience?: number
          risk?: number
          score?: number
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_screenshots: {
        Row: {
          annotations: Json
          caption: string | null
          captured_ts: string
          created_at: string
          id: string
          session_id: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          annotations?: Json
          caption?: string | null
          captured_ts?: string
          created_at?: string
          id?: string
          session_id: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          annotations?: Json
          caption?: string | null
          captured_ts?: string
          created_at?: string
          id?: string
          session_id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_screenshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_sessions: {
        Row: {
          completion_pct: number
          created_at: string
          cursor_ts: string | null
          deleted_at: string | null
          duration_seconds: number
          id: string
          is_favorite: boolean
          last_opened_at: string | null
          market: string
          mode: string
          playback_speed: number
          provider: string
          range_end: string | null
          range_start: string | null
          replay_date: string | null
          settings: Json
          source_journal_id: string | null
          source_trade_id: string | null
          status: string
          symbol: string
          tags: string[]
          timeframe: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completion_pct?: number
          created_at?: string
          cursor_ts?: string | null
          deleted_at?: string | null
          duration_seconds?: number
          id?: string
          is_favorite?: boolean
          last_opened_at?: string | null
          market: string
          mode?: string
          playback_speed?: number
          provider?: string
          range_end?: string | null
          range_start?: string | null
          replay_date?: string | null
          settings?: Json
          source_journal_id?: string | null
          source_trade_id?: string | null
          status?: string
          symbol: string
          tags?: string[]
          timeframe?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completion_pct?: number
          created_at?: string
          cursor_ts?: string | null
          deleted_at?: string | null
          duration_seconds?: number
          id?: string
          is_favorite?: boolean
          last_opened_at?: string | null
          market?: string
          mode?: string
          playback_speed?: number
          provider?: string
          range_end?: string | null
          range_start?: string | null
          replay_date?: string | null
          settings?: Json
          source_journal_id?: string | null
          source_trade_id?: string | null
          status?: string
          symbol?: string
          tags?: string[]
          timeframe?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      replay_statistics: {
        Row: {
          average_score: number
          last_practiced_at: string | null
          most_practiced_market: string | null
          most_practiced_symbol: string | null
          streak_days: number
          total_hours: number
          total_sessions: number
          total_trades: number
          updated_at: string
          user_id: string
        }
        Insert: {
          average_score?: number
          last_practiced_at?: string | null
          most_practiced_market?: string | null
          most_practiced_symbol?: string | null
          streak_days?: number
          total_hours?: number
          total_sessions?: number
          total_trades?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          average_score?: number
          last_practiced_at?: string | null
          most_practiced_market?: string | null
          most_practiced_symbol?: string | null
          streak_days?: number
          total_hours?: number
          total_sessions?: number
          total_trades?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      replay_trades: {
        Row: {
          closed_at: string | null
          commission: number
          created_at: string
          direction: string
          entry_price: number
          exit_price: number | null
          id: string
          lot_size: number
          market: string
          notes: string | null
          opened_at: string
          order_type: string
          pnl: number | null
          risk_pct: number | null
          rr_planned: number | null
          rr_realized: number | null
          session_id: string
          status: string
          stop_loss: number | null
          swap: number
          symbol: string
          take_profit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          commission?: number
          created_at?: string
          direction: string
          entry_price: number
          exit_price?: number | null
          id?: string
          lot_size?: number
          market: string
          notes?: string | null
          opened_at: string
          order_type?: string
          pnl?: number | null
          risk_pct?: number | null
          rr_planned?: number | null
          rr_realized?: number | null
          session_id: string
          status?: string
          stop_loss?: number | null
          swap?: number
          symbol: string
          take_profit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          commission?: number
          created_at?: string
          direction?: string
          entry_price?: number
          exit_price?: number | null
          id?: string
          lot_size?: number
          market?: string
          notes?: string | null
          opened_at?: string
          order_type?: string
          pnl?: number | null
          risk_pct?: number | null
          rr_planned?: number | null
          rr_realized?: number | null
          session_id?: string
          status?: string
          stop_loss?: number | null
          swap?: number
          symbol?: string
          take_profit?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_trades_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "replay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "admin_permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      saved_symbols: {
        Row: {
          created_at: string
          folder: string | null
          id: string
          sort_order: number
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder?: string | null
          id?: string
          sort_order?: number
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder?: string | null
          id?: string
          sort_order?: number
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      share_events: {
        Row: {
          content_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["share_event_type"]
          id: string
          metadata: Json
          post_id: string | null
          source_type: Database["public"]["Enums"]["share_source_type"] | null
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["share_event_type"]
          id?: string
          metadata?: Json
          post_id?: string | null
          source_type?: Database["public"]["Enums"]["share_source_type"] | null
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["share_event_type"]
          id?: string
          metadata?: Json
          post_id?: string | null
          source_type?: Database["public"]["Enums"]["share_source_type"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_events_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "shared_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_content: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          is_removed: boolean
          post_id: string | null
          snapshot: Json
          source_id: string | null
          source_ref: string | null
          source_type: Database["public"]["Enums"]["share_source_type"]
          summary: string | null
          title: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_removed?: boolean
          post_id?: string | null
          snapshot?: Json
          source_id?: string | null
          source_ref?: string | null
          source_type: Database["public"]["Enums"]["share_source_type"]
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_removed?: boolean
          post_id?: string | null
          snapshot?: Json
          source_id?: string | null
          source_ref?: string | null
          source_type?: Database["public"]["Enums"]["share_source_type"]
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_content_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_content_assets: {
        Row: {
          caption: string | null
          content_id: string
          created_at: string
          height: number | null
          id: string
          kind: string
          sort_order: number
          url: string
          width: number | null
        }
        Insert: {
          caption?: string | null
          content_id: string
          created_at?: string
          height?: number | null
          id?: string
          kind: string
          sort_order?: number
          url: string
          width?: number | null
        }
        Update: {
          caption?: string | null
          content_id?: string
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          sort_order?: number
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_content_assets_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "shared_content"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_content_links: {
        Row: {
          content_id: string
          created_at: string
          id: string
          label: string | null
          target_id: string | null
          target_ref: string | null
          target_type: Database["public"]["Enums"]["share_source_type"]
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          label?: string | null
          target_id?: string | null
          target_ref?: string | null
          target_type: Database["public"]["Enums"]["share_source_type"]
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          label?: string | null
          target_id?: string | null
          target_ref?: string | null
          target_type?: Database["public"]["Enums"]["share_source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "shared_content_links_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "shared_content"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_content_metadata: {
        Row: {
          content_id: string
          created_at: string
          id: string
          key: string
          value: Json | null
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          key: string
          value?: Json | null
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          key?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_content_metadata_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "shared_content"
            referencedColumns: ["id"]
          },
        ]
      }
      social_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      statistics_saved_filters: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          archived_at: string | null
          category: string | null
          color: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          difficulty: Database["public"]["Enums"]["strategy_difficulty"]
          entry_rules: Json | null
          estimated_timeframe: string | null
          exit_rules: Json | null
          icon: string | null
          id: string
          is_active: boolean
          is_favorite: boolean
          is_template: boolean
          market: string | null
          market_conditions: string[] | null
          markets: string[] | null
          name: string
          notes: string | null
          position_sizing: Json | null
          published_at: string | null
          risk_rules: Json | null
          slug: string | null
          status: Database["public"]["Enums"]["strategy_status"]
          symbols: string[] | null
          tags: string[] | null
          template_source: string | null
          timeframes: string[] | null
          trade_management: Json | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["strategy_difficulty"]
          entry_rules?: Json | null
          estimated_timeframe?: string | null
          exit_rules?: Json | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          is_template?: boolean
          market?: string | null
          market_conditions?: string[] | null
          markets?: string[] | null
          name: string
          notes?: string | null
          position_sizing?: Json | null
          published_at?: string | null
          risk_rules?: Json | null
          slug?: string | null
          status?: Database["public"]["Enums"]["strategy_status"]
          symbols?: string[] | null
          tags?: string[] | null
          template_source?: string | null
          timeframes?: string[] | null
          trade_management?: Json | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["strategy_difficulty"]
          entry_rules?: Json | null
          estimated_timeframe?: string | null
          exit_rules?: Json | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          is_template?: boolean
          market?: string | null
          market_conditions?: string[] | null
          markets?: string[] | null
          name?: string
          notes?: string | null
          position_sizing?: Json | null
          published_at?: string | null
          risk_rules?: Json | null
          slug?: string | null
          status?: Database["public"]["Enums"]["strategy_status"]
          symbols?: string[] | null
          tags?: string[] | null
          template_source?: string | null
          timeframes?: string[] | null
          trade_management?: Json | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      strategy_attachments: {
        Row: {
          bucket: string
          created_at: string
          filename: string | null
          id: string
          kind: string | null
          mime_type: string | null
          path: string
          size_bytes: number | null
          strategy_id: string
          user_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          filename?: string | null
          id?: string
          kind?: string | null
          mime_type?: string | null
          path: string
          size_bytes?: number | null
          strategy_id: string
          user_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          filename?: string | null
          id?: string
          kind?: string | null
          mime_type?: string | null
          path?: string
          size_bytes?: number | null
          strategy_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_attachments_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          label: string
          required: boolean
          sort_order: number
          user_id: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          label: string
          required?: boolean
          sort_order?: number
          user_id: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          label?: string
          required?: boolean
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "strategy_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_checklists: {
        Row: {
          created_at: string
          id: string
          kind: string
          sort_order: number
          strategy_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          sort_order?: number
          strategy_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          sort_order?: number
          strategy_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_checklists_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          parent_id: string | null
          strategy_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          strategy_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          strategy_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "strategy_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_comments_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_examples: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          ref_id: string | null
          ref_type: string
          sort_order: number
          strategy_id: string
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          ref_id?: string | null
          ref_type: string
          sort_order?: number
          strategy_id: string
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          ref_id?: string | null
          ref_type?: string
          sort_order?: number
          strategy_id?: string
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_examples_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_flow_edges: {
        Row: {
          created_at: string
          id: string
          label: string | null
          source_id: string
          strategy_id: string
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          source_id: string
          strategy_id: string
          target_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          source_id?: string
          strategy_id?: string
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_flow_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "strategy_flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_flow_edges_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_flow_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "strategy_flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_flow_nodes: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          label: string | null
          node_type: string
          pos_x: number
          pos_y: number
          strategy_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          label?: string | null
          node_type: string
          pos_x?: number
          pos_y?: number
          strategy_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          label?: string | null
          node_type?: string
          pos_x?: number
          pos_y?: number
          strategy_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_flow_nodes_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_history: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          id: string
          strategy_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          id?: string
          strategy_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          id?: string
          strategy_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_history_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_playbooks: {
        Row: {
          checklist: Json | null
          color: string | null
          cover_url: string | null
          created_at: string
          examples: Json | null
          icon: string | null
          id: string
          is_favorite: boolean
          mistakes: Json | null
          name: string
          overview: string | null
          rules: Json | null
          strategy_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checklist?: Json | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          examples?: Json | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          mistakes?: Json | null
          name: string
          overview?: string | null
          rules?: Json | null
          strategy_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checklist?: Json | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          examples?: Json | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          mistakes?: Json | null
          name?: string
          overview?: string | null
          rules?: Json | null
          strategy_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_playbooks_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_templates: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          data: Json
          description: string | null
          difficulty: Database["public"]["Enums"]["strategy_difficulty"]
          icon: string | null
          id: string
          is_official: boolean
          markets: string[] | null
          name: string
          slug: string
          tags: string[] | null
          timeframes: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          data?: Json
          description?: string | null
          difficulty?: Database["public"]["Enums"]["strategy_difficulty"]
          icon?: string | null
          id?: string
          is_official?: boolean
          markets?: string[] | null
          name: string
          slug: string
          tags?: string[] | null
          timeframes?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          data?: Json
          description?: string | null
          difficulty?: Database["public"]["Enums"]["strategy_difficulty"]
          icon?: string | null
          id?: string
          is_official?: boolean
          markets?: string[] | null
          name?: string
          slug?: string
          tags?: string[] | null
          timeframes?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      strategy_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          id: string
          snapshot: Json
          strategy_id: string
          user_id: string
          version: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          id?: string
          snapshot: Json
          strategy_id: string
          user_id: string
          version: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          id?: string
          snapshot?: Json
          strategy_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_versions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_connections: {
        Row: {
          connected_at: string | null
          created_at: string
          endpoint: string
          id: string
          last_message_at: string | null
          latency_ms: number | null
          metadata: Json
          provider_id: string
          status: Database["public"]["Enums"]["provider_status"]
          subscription_count: number
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          endpoint: string
          id?: string
          last_message_at?: string | null
          latency_ms?: number | null
          metadata?: Json
          provider_id: string
          status?: Database["public"]["Enums"]["provider_status"]
          subscription_count?: number
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          last_message_at?: string | null
          latency_ms?: number | null
          metadata?: Json
          provider_id?: string
          status?: Database["public"]["Enums"]["provider_status"]
          subscription_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_connections_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "market_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          message: string | null
          payload: Json
          provider_id: string | null
          severity: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          message?: string | null
          payload?: Json
          provider_id?: string | null
          severity?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          message?: string | null
          payload?: Json
          provider_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "market_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          body: string
          category: string | null
          created_at: string
          id: string
          priority: string
          resolution: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          body: string
          category?: string | null
          created_at?: string
          id?: string
          priority?: string
          resolution?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          priority?: string
          resolution?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      symbol_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          market_kind: Database["public"]["Enums"]["market_kind"] | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          market_kind?: Database["public"]["Enums"]["market_kind"] | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          market_kind?: Database["public"]["Enums"]["market_kind"] | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      symbols: {
        Row: {
          base_asset: string | null
          category_id: string | null
          contract_size: number
          created_at: string
          display_name: string
          id: string
          is_enabled: boolean
          is_popular: boolean
          is_trending: boolean
          market_kind: Database["public"]["Enums"]["market_kind"]
          metadata: Json
          price_precision: number
          quote_asset: string | null
          symbol: string
          tick_size: number
          updated_at: string
        }
        Insert: {
          base_asset?: string | null
          category_id?: string | null
          contract_size?: number
          created_at?: string
          display_name: string
          id?: string
          is_enabled?: boolean
          is_popular?: boolean
          is_trending?: boolean
          market_kind: Database["public"]["Enums"]["market_kind"]
          metadata?: Json
          price_precision?: number
          quote_asset?: string | null
          symbol: string
          tick_size?: number
          updated_at?: string
        }
        Update: {
          base_asset?: string | null
          category_id?: string | null
          contract_size?: number
          created_at?: string
          display_name?: string
          id?: string
          is_enabled?: boolean
          is_popular?: boolean
          is_trending?: boolean
          market_kind?: Database["public"]["Enums"]["market_kind"]
          metadata?: Json
          price_precision?: number
          quote_asset?: string | null
          symbol?: string
          tick_size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "symbols_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "symbol_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      system_reports: {
        Row: {
          created_at: string
          file_path: string | null
          generated_by: string | null
          id: string
          kind: string
          params: Json
          row_count: number | null
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          generated_by?: string | null
          id?: string
          kind: string
          params?: Json
          row_count?: number | null
        }
        Update: {
          created_at?: string
          file_path?: string | null
          generated_by?: string | null
          id?: string
          kind?: string
          params?: Json
          row_count?: number | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          label: string | null
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          label?: string | null
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          label?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      system_settings_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          key: string
          new_value: Json
          previous_value: Json | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          key: string
          new_value: Json
          previous_value?: Json | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          key?: string
          new_value?: Json
          previous_value?: Json | null
        }
        Relationships: []
      }
      trade_tag_relations: {
        Row: {
          created_at: string
          tag_id: string
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_tag_relations_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "trade_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_tag_relations_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          id: string
          progress: number
          unlocked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          id?: string
          progress?: number
          unlocked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          id?: string
          progress?: number
          unlocked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_challenges: {
        Row: {
          challenge_id: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          period_key: string
          progress: number
          status: Database["public"]["Enums"]["challenge_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          period_key: string
          progress?: number
          status?: Database["public"]["Enums"]["challenge_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          period_key?: string
          progress?: number
          status?: Database["public"]["Enums"]["challenge_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorite_symbols: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      user_market_settings: {
        Row: {
          auto_refresh_seconds: number
          created_at: string
          default_symbol: string
          default_timeframe: Database["public"]["Enums"]["timeframe_kind"]
          preferred_market: Database["public"]["Enums"]["market_kind"]
          preferred_provider: string | null
          preferred_timezone: string
          streaming_quality: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_refresh_seconds?: number
          created_at?: string
          default_symbol?: string
          default_timeframe?: Database["public"]["Enums"]["timeframe_kind"]
          preferred_market?: Database["public"]["Enums"]["market_kind"]
          preferred_provider?: string | null
          preferred_timezone?: string
          streaming_quality?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_refresh_seconds?: number
          created_at?: string
          default_symbol?: string
          default_timeframe?: Database["public"]["Enums"]["timeframe_kind"]
          preferred_market?: Database["public"]["Enums"]["market_kind"]
          preferred_provider?: string | null
          preferred_timezone?: string
          streaming_quality?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_moderation: {
        Row: {
          created_at: string
          id: string
          moderator_id: string | null
          reason: string | null
          status: string
          until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          moderator_id?: string | null
          reason?: string | null
          status: string
          until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          moderator_id?: string | null
          reason?: string | null
          status?: string
          until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          chart_default_interval: string
          chart_default_symbol: string
          created_at: string
          daily_xp_goal: number
          primary_goal: string | null
          risk_per_trade_pct: number
          show_pnl_percent: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          chart_default_interval?: string
          chart_default_symbol?: string
          created_at?: string
          daily_xp_goal?: number
          primary_goal?: string | null
          risk_per_trade_pct?: number
          show_pnl_percent?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          chart_default_interval?: string
          chart_default_symbol?: string
          created_at?: string
          daily_xp_goal?: number
          primary_goal?: string | null
          risk_per_trade_pct?: number
          show_pnl_percent?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_recent_symbols: {
        Row: {
          id: string
          symbol: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          symbol: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          symbol?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          locale: string
          notify_challenges: boolean
          notify_email: boolean
          notify_product_updates: boolean
          notify_push: boolean
          notify_rank_changes: boolean
          notify_weekly_report: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          locale?: string
          notify_challenges?: boolean
          notify_email?: boolean
          notify_product_updates?: boolean
          notify_push?: boolean
          notify_rank_changes?: boolean
          notify_weekly_report?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          locale?: string
          notify_challenges?: boolean
          notify_email?: boolean
          notify_product_updates?: boolean
          notify_push?: boolean
          notify_rank_changes?: boolean
          notify_weekly_report?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          created_at: string
          favorite: boolean
          id: string
          market: string
          sort_order: number
          symbol: string
          updated_at: string
          user_id: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          favorite?: boolean
          id?: string
          market?: string
          sort_order?: number
          symbol: string
          updated_at?: string
          user_id: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          favorite?: boolean
          id?: string
          market?: string
          sort_order?: number
          symbol?: string
          updated_at?: string
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          market: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          market?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          market?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_transactions: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          level_after: number
          reason: string
          source: string
          source_id: string | null
          user_id: string
        }
        Insert: {
          balance_after?: number
          created_at?: string
          delta: number
          id?: string
          level_after?: number
          reason: string
          source: string
          source_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          level_after?: number
          reason?: string
          source?: string
          source_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_ai_rate_limit: {
        Args: {
          _bucket: string
          _limit: number
          _user_id: string
          _window_start: string
        }
        Returns: {
          allowed: boolean
          current_count: number
          remaining: number
        }[]
      }
      community_recompute_reputation: {
        Args: { _user_id: string }
        Returns: undefined
      }
      community_recompute_trending: {
        Args: { _post_id: string }
        Returns: undefined
      }
      emit_battle_event: {
        Args: {
          _battle_id: string
          _message: string
          _metadata?: Json
          _severity?: string
          _type: Database["public"]["Enums"]["battle_event_type"]
          _user_id: string
        }
        Returns: undefined
      }
      finalize_battle: { Args: { _battle_id: string }; Returns: undefined }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_battle_host: {
        Args: { _battle_id: string; _user_id: string }
        Returns: boolean
      }
      is_battle_participant: {
        Args: { _battle_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      join_battle: { Args: { _battle_id: string }; Returns: string }
      join_battle_by_code: { Args: { _code: string }; Returns: string }
      recompute_battle_live_stats: {
        Args: { _battle_id: string }
        Returns: undefined
      }
      recompute_battle_ranking: {
        Args: { _battle_id: string; _user_id: string }
        Returns: undefined
      }
      tick_battles: { Args: never; Returns: undefined }
    }
    Enums: {
      achievement_category:
        | "trading"
        | "journal"
        | "challenges"
        | "consistency"
        | "levels"
        | "community"
        | "events"
        | "secret"
      ai_analysis_kind:
        | "trade_review"
        | "journal_review"
        | "psychology"
        | "performance"
        | "weekly_report"
        | "monthly_report"
        | "quarterly_report"
        | "annual_report"
        | "recommendation"
        | "alert"
        | "playbook"
        | "chat_summary"
      ai_analysis_status:
        | "queued"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
      ai_chat_role: "system" | "user" | "assistant" | "tool"
      ai_recommendation_priority: "low" | "medium" | "high" | "critical"
      ai_recommendation_status:
        | "open"
        | "in_progress"
        | "completed"
        | "dismissed"
        | "expired"
      ai_report_period: "weekly" | "monthly" | "quarterly" | "annual"
      ai_trade_grade: "A+" | "A" | "B" | "C" | "D" | "F"
      app_role:
        | "admin"
        | "moderator"
        | "premium"
        | "member"
        | "super_admin"
        | "support"
        | "content_manager"
        | "developer"
        | "analyst"
      badge_tier: "bronze" | "silver" | "gold" | "diamond" | "legend"
      battle_event_type:
        | "battle_created"
        | "battle_started"
        | "battle_ended"
        | "battle_cancelled"
        | "player_joined"
        | "player_left"
        | "player_disconnected"
        | "player_returned"
        | "trade_opened"
        | "trade_closed"
        | "position_updated"
        | "rank_up"
        | "rank_down"
        | "new_leader"
        | "milestone"
        | "rule_violation"
        | "system"
      battle_market: "crypto" | "forex" | "indices" | "metals" | "mixed"
      battle_participant_status:
        | "joined"
        | "active"
        | "disqualified"
        | "finished"
      battle_presence_status:
        | "trading"
        | "watching"
        | "idle"
        | "disconnected"
        | "finished"
      battle_status: "draft" | "upcoming" | "live" | "completed" | "cancelled"
      battle_type_kind: "1v1" | "2v2" | "ffa5" | "ffa10"
      battle_visibility: "public" | "private"
      battle_win_condition:
        | "highest_pnl"
        | "highest_r"
        | "highest_winrate"
        | "lowest_dd"
        | "first_to_5r"
        | "first_to_target"
        | "consistency"
      challenge_category:
        | "learning"
        | "discipline"
        | "risk"
        | "consistency"
        | "psychology"
        | "skills"
        | "community"
        | "general"
      challenge_difficulty: "easy" | "medium" | "hard" | "elite"
      challenge_scope: "daily" | "weekly" | "monthly" | "special" | "event"
      challenge_status: "active" | "completed" | "claimed" | "expired"
      community_notification_kind:
        | "follow"
        | "comment"
        | "reply"
        | "like"
        | "mention"
        | "share"
        | "post_featured"
        | "post_pinned"
        | "report_resolved"
      community_post_type:
        | "text"
        | "chart"
        | "trade_idea"
        | "journal"
        | "battle_result"
        | "tournament_result"
        | "replay"
        | "strategy"
        | "question"
        | "poll"
        | "image"
        | "video"
        | "pdf"
        | "announcement"
      community_reaction_kind:
        | "like"
        | "helpful"
        | "insightful"
        | "bullish"
        | "bearish"
        | "fire"
        | "laugh"
        | "clap"
      community_report_status: "open" | "reviewing" | "resolved" | "dismissed"
      journal_grade: "A+" | "A" | "B" | "C" | "D" | "F"
      journal_session: "london" | "new_york" | "asia" | "sydney" | "custom"
      journal_status: "draft" | "published" | "archived"
      journal_taxonomy_kind: "setup" | "emotion" | "mistake"
      league:
        | "bronze"
        | "silver"
        | "gold"
        | "platinum"
        | "diamond"
        | "master"
        | "grandmaster"
      market_kind:
        | "forex"
        | "crypto"
        | "indices"
        | "metals"
        | "commodities"
        | "futures"
        | "stocks"
      market_status_kind:
        | "open"
        | "closed"
        | "pre_market"
        | "after_hours"
        | "holiday"
        | "maintenance"
      paper_close_reason:
        | "manual"
        | "stop_loss"
        | "take_profit"
        | "liquidation"
        | "expired"
      paper_direction: "long" | "short"
      paper_market:
        | "forex"
        | "crypto"
        | "stocks"
        | "indices"
        | "futures"
        | "metals"
      paper_order_status:
        | "pending"
        | "filled"
        | "cancelled"
        | "expired"
        | "rejected"
      paper_order_type: "market" | "limit" | "stop" | "stop_limit"
      paper_trade_status: "open" | "closed" | "cancelled"
      preferred_market:
        | "forex"
        | "crypto"
        | "stocks"
        | "futures"
        | "options"
        | "indices"
      price_alert_kind: "above" | "below" | "cross_up" | "cross_down"
      provider_status:
        | "connected"
        | "disconnected"
        | "connecting"
        | "error"
        | "disabled"
      share_event_type:
        | "created"
        | "viewed"
        | "clicked"
        | "liked"
        | "bookmarked"
        | "reshared"
        | "removed"
      share_source_type:
        | "trading_workspace"
        | "journal"
        | "battle"
        | "championship"
        | "replay"
        | "strategy"
        | "statistics"
        | "ai_review"
        | "achievement"
        | "challenge"
        | "profile"
        | "custom"
      strategy_difficulty: "beginner" | "intermediate" | "advanced" | "expert"
      strategy_status: "draft" | "private" | "public" | "archived"
      timeframe_kind:
        | "tick"
        | "1m"
        | "3m"
        | "5m"
        | "15m"
        | "30m"
        | "1H"
        | "2H"
        | "4H"
        | "1D"
        | "1W"
        | "1M"
      trading_experience:
        | "beginner"
        | "intermediate"
        | "advanced"
        | "professional"
      trading_style:
        | "scalper"
        | "day_trader"
        | "swing_trader"
        | "position_trader"
        | "algo"
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
      achievement_category: [
        "trading",
        "journal",
        "challenges",
        "consistency",
        "levels",
        "community",
        "events",
        "secret",
      ],
      ai_analysis_kind: [
        "trade_review",
        "journal_review",
        "psychology",
        "performance",
        "weekly_report",
        "monthly_report",
        "quarterly_report",
        "annual_report",
        "recommendation",
        "alert",
        "playbook",
        "chat_summary",
      ],
      ai_analysis_status: [
        "queued",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
      ],
      ai_chat_role: ["system", "user", "assistant", "tool"],
      ai_recommendation_priority: ["low", "medium", "high", "critical"],
      ai_recommendation_status: [
        "open",
        "in_progress",
        "completed",
        "dismissed",
        "expired",
      ],
      ai_report_period: ["weekly", "monthly", "quarterly", "annual"],
      ai_trade_grade: ["A+", "A", "B", "C", "D", "F"],
      app_role: [
        "admin",
        "moderator",
        "premium",
        "member",
        "super_admin",
        "support",
        "content_manager",
        "developer",
        "analyst",
      ],
      badge_tier: ["bronze", "silver", "gold", "diamond", "legend"],
      battle_event_type: [
        "battle_created",
        "battle_started",
        "battle_ended",
        "battle_cancelled",
        "player_joined",
        "player_left",
        "player_disconnected",
        "player_returned",
        "trade_opened",
        "trade_closed",
        "position_updated",
        "rank_up",
        "rank_down",
        "new_leader",
        "milestone",
        "rule_violation",
        "system",
      ],
      battle_market: ["crypto", "forex", "indices", "metals", "mixed"],
      battle_participant_status: [
        "joined",
        "active",
        "disqualified",
        "finished",
      ],
      battle_presence_status: [
        "trading",
        "watching",
        "idle",
        "disconnected",
        "finished",
      ],
      battle_status: ["draft", "upcoming", "live", "completed", "cancelled"],
      battle_type_kind: ["1v1", "2v2", "ffa5", "ffa10"],
      battle_visibility: ["public", "private"],
      battle_win_condition: [
        "highest_pnl",
        "highest_r",
        "highest_winrate",
        "lowest_dd",
        "first_to_5r",
        "first_to_target",
        "consistency",
      ],
      challenge_category: [
        "learning",
        "discipline",
        "risk",
        "consistency",
        "psychology",
        "skills",
        "community",
        "general",
      ],
      challenge_difficulty: ["easy", "medium", "hard", "elite"],
      challenge_scope: ["daily", "weekly", "monthly", "special", "event"],
      challenge_status: ["active", "completed", "claimed", "expired"],
      community_notification_kind: [
        "follow",
        "comment",
        "reply",
        "like",
        "mention",
        "share",
        "post_featured",
        "post_pinned",
        "report_resolved",
      ],
      community_post_type: [
        "text",
        "chart",
        "trade_idea",
        "journal",
        "battle_result",
        "tournament_result",
        "replay",
        "strategy",
        "question",
        "poll",
        "image",
        "video",
        "pdf",
        "announcement",
      ],
      community_reaction_kind: [
        "like",
        "helpful",
        "insightful",
        "bullish",
        "bearish",
        "fire",
        "laugh",
        "clap",
      ],
      community_report_status: ["open", "reviewing", "resolved", "dismissed"],
      journal_grade: ["A+", "A", "B", "C", "D", "F"],
      journal_session: ["london", "new_york", "asia", "sydney", "custom"],
      journal_status: ["draft", "published", "archived"],
      journal_taxonomy_kind: ["setup", "emotion", "mistake"],
      league: [
        "bronze",
        "silver",
        "gold",
        "platinum",
        "diamond",
        "master",
        "grandmaster",
      ],
      market_kind: [
        "forex",
        "crypto",
        "indices",
        "metals",
        "commodities",
        "futures",
        "stocks",
      ],
      market_status_kind: [
        "open",
        "closed",
        "pre_market",
        "after_hours",
        "holiday",
        "maintenance",
      ],
      paper_close_reason: [
        "manual",
        "stop_loss",
        "take_profit",
        "liquidation",
        "expired",
      ],
      paper_direction: ["long", "short"],
      paper_market: [
        "forex",
        "crypto",
        "stocks",
        "indices",
        "futures",
        "metals",
      ],
      paper_order_status: [
        "pending",
        "filled",
        "cancelled",
        "expired",
        "rejected",
      ],
      paper_order_type: ["market", "limit", "stop", "stop_limit"],
      paper_trade_status: ["open", "closed", "cancelled"],
      preferred_market: [
        "forex",
        "crypto",
        "stocks",
        "futures",
        "options",
        "indices",
      ],
      price_alert_kind: ["above", "below", "cross_up", "cross_down"],
      provider_status: [
        "connected",
        "disconnected",
        "connecting",
        "error",
        "disabled",
      ],
      share_event_type: [
        "created",
        "viewed",
        "clicked",
        "liked",
        "bookmarked",
        "reshared",
        "removed",
      ],
      share_source_type: [
        "trading_workspace",
        "journal",
        "battle",
        "championship",
        "replay",
        "strategy",
        "statistics",
        "ai_review",
        "achievement",
        "challenge",
        "profile",
        "custom",
      ],
      strategy_difficulty: ["beginner", "intermediate", "advanced", "expert"],
      strategy_status: ["draft", "private", "public", "archived"],
      timeframe_kind: [
        "tick",
        "1m",
        "3m",
        "5m",
        "15m",
        "30m",
        "1H",
        "2H",
        "4H",
        "1D",
        "1W",
        "1M",
      ],
      trading_experience: [
        "beginner",
        "intermediate",
        "advanced",
        "professional",
      ],
      trading_style: [
        "scalper",
        "day_trader",
        "swing_trader",
        "position_trader",
        "algo",
      ],
    },
  },
} as const
