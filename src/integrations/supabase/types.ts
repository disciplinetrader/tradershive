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
      paper_accounts: {
        Row: {
          balance: number
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
        Relationships: []
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
          swap: number
          symbol: string
          take_profit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
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
          swap?: number
          symbol: string
          take_profit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
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
      profiles: {
        Row: {
          accepted_terms_at: string | null
          avatar_url: string | null
          bio: string | null
          coins: number
          country: string | null
          created_at: string
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
          avatar_url?: string | null
          bio?: string | null
          coins?: number
          country?: string | null
          created_at?: string
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
          avatar_url?: string | null
          bio?: string | null
          coins?: number
          country?: string | null
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
      app_role: "admin" | "moderator" | "premium" | "member"
      badge_tier: "bronze" | "silver" | "gold" | "diamond" | "legend"
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
      app_role: ["admin", "moderator", "premium", "member"],
      badge_tier: ["bronze", "silver", "gold", "diamond", "legend"],
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
