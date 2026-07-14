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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      draft_picks: {
        Row: {
          created_at: string
          current_team_id: string
          id: string
          is_keeper: boolean | null
          league_id: string
          original_team_id: string
          pick_number: number | null
          picked_at: string | null
          player_id: string | null
          round: number
          year: number
        }
        Insert: {
          created_at?: string
          current_team_id: string
          id?: string
          is_keeper?: boolean | null
          league_id: string
          original_team_id: string
          pick_number?: number | null
          picked_at?: string | null
          player_id?: string | null
          round: number
          year: number
        }
        Update: {
          created_at?: string
          current_team_id?: string
          id?: string
          is_keeper?: boolean | null
          league_id?: string
          original_team_id?: string
          pick_number?: number | null
          picked_at?: string | null
          player_id?: string | null
          round?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_original_team_id_fkey"
            columns: ["original_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_draft_picks: {
        Row: {
          created_at: string
          current_team_id: string
          id: string
          is_keeper: boolean | null
          league_id: string
          original_team_id: string
          pick_number: number | null
          picked_at: string | null
          player_id: string | null
          round: number
          year: number
        }
        Insert: {
          created_at?: string
          current_team_id: string
          id?: string
          is_keeper?: boolean | null
          league_id: string
          original_team_id: string
          pick_number?: number | null
          picked_at?: string | null
          player_id?: string | null
          round: number
          year: number
        }
        Update: {
          created_at?: string
          current_team_id?: string
          id?: string
          is_keeper?: boolean | null
          league_id?: string
          original_team_id?: string
          pick_number?: number | null
          picked_at?: string | null
          player_id?: string | null
          round?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "mock_draft_picks_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_draft_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_draft_picks_original_team_id_fkey"
            columns: ["original_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_draft_picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      keepers: {
        Row: {
          created_at: string
          id: string
          player_id: string
          round_cost: number
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          round_cost?: number
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          round_cost?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keepers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keepers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_rosters: {
        Row: {
          created_at: string
          id: string
          player_id: string
          season_year: number
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          season_year: number
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          season_year?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_admins: {
        Row: {
          created_at: string
          created_by: string | null
          league_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          league_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_admins_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          admin_user_id: string | null
          bench_slots: number
          created_at: string
          current_pick: number | null
          current_round: number | null
          def_slots: number
          draft_status: string
          draft_time_seconds: number
          flex_slots: number
          id: string
          k_slots: number
          name: string
          num_keepers: number
          num_rounds: number
          num_teams: number
          qb_slots: number
          rb_slots: number
          te_slots: number
          updated_at: string
          wr_slots: number
        }
        Insert: {
          admin_user_id?: string | null
          bench_slots?: number
          created_at?: string
          current_pick?: number | null
          current_round?: number | null
          def_slots?: number
          draft_status?: string
          draft_time_seconds?: number
          flex_slots?: number
          id?: string
          k_slots?: number
          name: string
          num_keepers?: number
          num_rounds?: number
          num_teams?: number
          qb_slots?: number
          rb_slots?: number
          te_slots?: number
          updated_at?: string
          wr_slots?: number
        }
        Update: {
          admin_user_id?: string | null
          bench_slots?: number
          created_at?: string
          current_pick?: number | null
          current_round?: number | null
          def_slots?: number
          draft_status?: string
          draft_time_seconds?: number
          flex_slots?: number
          id?: string
          k_slots?: number
          name?: string
          num_keepers?: number
          num_rounds?: number
          num_teams?: number
          qb_slots?: number
          rb_slots?: number
          te_slots?: number
          updated_at?: string
          wr_slots?: number
        }
        Relationships: []
      }
      team_credentials: {
        Row: {
          access_code: string
          created_at: string
          team_id: string
        }
        Insert: {
          access_code: string
          created_at?: string
          team_id: string
        }
        Update: {
          access_code?: string
          created_at?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_credentials_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_trades: {
        Row: {
          draft_pick_id: string
          from_team_id: string
          id: string
          league_id: string
          to_team_id: string
          traded_at: string
        }
        Insert: {
          draft_pick_id: string
          from_team_id: string
          id?: string
          league_id: string
          to_team_id: string
          traded_at?: string
        }
        Update: {
          draft_pick_id?: string
          from_team_id?: string
          id?: string
          league_id?: string
          to_team_id?: string
          traded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_trades_draft_pick_id_fkey"
            columns: ["draft_pick_id"]
            isOneToOne: false
            referencedRelation: "draft_picks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_trades_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_trades_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_trades_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          position: string | null
          search_rank: number | null
          status: string | null
          team: string | null
          updated_at: string
          years_exp: number | null
        }
        Insert: {
          first_name?: string | null
          full_name: string
          id: string
          last_name?: string | null
          position?: string | null
          search_rank?: number | null
          status?: string | null
          team?: string | null
          updated_at?: string
          years_exp?: number | null
        }
        Update: {
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          position?: string | null
          search_rank?: number | null
          status?: string | null
          team?: string | null
          updated_at?: string
          years_exp?: number | null
        }
        Relationships: []
      }
      players_last_sync: {
        Row: {
          id: number
          synced_at: string
        }
        Insert: {
          id?: number
          synced_at?: string
        }
        Update: {
          id?: number
          synced_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          draft_position: number
          email: string | null
          id: string
          league_id: string
          name: string
        }
        Insert: {
          created_at?: string
          draft_position: number
          email?: string | null
          id?: string
          league_id: string
          name: string
        }
        Update: {
          created_at?: string
          draft_position?: number
          email?: string | null
          id?: string
          league_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_keeper_with_code: {
        Args: {
          p_team_id: string
          p_player_id: string
          p_access_code: string
          p_round_cost?: number
        }
        Returns: {
          created_at: string
          id: string
          player_id: string
          round_cost: number
          team_id: string
        }
      }
      add_league_admin_by_email: {
        Args: { p_league_id: string; p_email: string }
        Returns: {
          user_id: string
          email: string
          is_primary: boolean
          created_at: string
        }[]
      }
      can_manage_league: {
        Args: { p_league_id: string }
        Returns: boolean
      }
      create_team_with_access: {
        Args: {
          p_league_id: string
          p_name: string
          p_email: string
          p_draft_position: number
        }
        Returns: {
          id: string
          league_id: string
          name: string
          draft_position: number
          email: string
          created_at: string
          access_code: string
        }[]
      }
      clear_mock_draft: {
        Args: { p_league_id: string; p_year?: number }
        Returns: undefined
      }
      initialize_mock_draft: {
        Args: { p_league_id: string; p_year?: number }
        Returns: number
      }
      is_league_admin: {
        Args: { p_league_id: string }
        Returns: boolean
      }
      list_league_admins: {
        Args: { p_league_id: string }
        Returns: {
          user_id: string
          email: string
          is_primary: boolean
          created_at: string
        }[]
      }
      list_team_access_codes: {
        Args: { p_league_id: string }
        Returns: {
          team_id: string
          team_name: string
          email: string
          access_code: string
        }[]
      }
      make_pick_with_code: {
        Args: {
          p_pick_id: string
          p_player_id: string
          p_access_code?: string | null
        }
        Returns: {
          created_at: string
          current_team_id: string
          id: string
          is_keeper: boolean | null
          league_id: string
          original_team_id: string
          pick_number: number | null
          picked_at: string | null
          player_id: string | null
          round: number
          year: number
        }
      }
      remove_keeper_with_code: {
        Args: { p_keeper_id: string; p_access_code: string }
        Returns: undefined
      }
      remove_league_admin: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: undefined
      }
      reset_draft_board: {
        Args: { p_league_id: string; p_year?: number }
        Returns: undefined
      }
      trade_pick_with_code: {
        Args: {
          p_pick_id: string
          p_from_team_id: string
          p_to_team_id: string
          p_access_code?: string | null
        }
        Returns: undefined
      }
      verify_team_access: {
        Args: { p_league_id: string; p_access_code: string }
        Returns: {
          id: string
          league_id: string
          name: string
          draft_position: number
          email: string
          created_at: string
        }[]
      }
      verify_team_access_by_code: {
        Args: { p_access_code: string }
        Returns: {
          id: string
          league_id: string
          league_name: string
          name: string
          draft_position: number
          email: string
          created_at: string
        }[]
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
    Enums: {},
  },
} as const
