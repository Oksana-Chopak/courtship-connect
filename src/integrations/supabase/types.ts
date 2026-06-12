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
      buddies: {
        Row: {
          created_at: string
          id: string
          source: string
          user_high: string
          user_low: string
        }
        Insert: {
          created_at?: string
          id?: string
          source: string
          user_high: string
          user_low: string
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          user_high?: string
          user_low?: string
        }
        Relationships: []
      }
      buddy_requests: {
        Row: {
          created_at: string
          from_id: string
          id: string
          status: string
          to_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          id?: string
          status?: string
          to_id: string
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
          status?: string
          to_id?: string
        }
        Relationships: []
      }
      courts: {
        Row: {
          area: string | null
          city: string
          id: string
          name: string
        }
        Insert: {
          area?: string | null
          city?: string
          id?: string
          name: string
        }
        Update: {
          area?: string | null
          city?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          confirmed_a: boolean
          confirmed_b: boolean
          id: string
          played_at: string
          player_a: string
          player_b: string
          reported_noshow: string | null
          sos_id: string | null
        }
        Insert: {
          confirmed_a?: boolean
          confirmed_b?: boolean
          id?: string
          played_at: string
          player_a: string
          player_b: string
          reported_noshow?: string | null
          sos_id?: string | null
        }
        Update: {
          confirmed_a?: boolean
          confirmed_b?: boolean
          id?: string
          played_at?: string
          player_a?: string
          player_b?: string
          reported_noshow?: string | null
          sos_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_sos_id_fkey"
            columns: ["sos_id"]
            isOneToOne: false
            referencedRelation: "sos_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          owner_id: string | null
          uses_remaining: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          owner_id?: string | null
          uses_remaining?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          owner_id?: string | null
          uses_remaining?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km: number
          buddy_sos_optin: boolean
          created_at: string
          formats: string[]
          ghost_badge: boolean
          home_city: string
          home_courts: string | null
          id: string
          is_admin: boolean
          lang: string
          level: number
          looking_for: Database["public"]["Enums"]["looking_for_t"]
          name: string
          phone_e164: string
          photo_url: string | null
          play_times: string[]
          rescues_count: number
          signup_code: string | null
          vibe: Database["public"]["Enums"]["vibe_t"]
        }
        Insert: {
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km?: number
          buddy_sos_optin?: boolean
          created_at?: string
          formats?: string[]
          ghost_badge?: boolean
          home_city?: string
          home_courts?: string | null
          id: string
          is_admin?: boolean
          lang?: string
          level: number
          looking_for?: Database["public"]["Enums"]["looking_for_t"]
          name: string
          phone_e164: string
          photo_url?: string | null
          play_times?: string[]
          rescues_count?: number
          signup_code?: string | null
          vibe?: Database["public"]["Enums"]["vibe_t"]
        }
        Update: {
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km?: number
          buddy_sos_optin?: boolean
          created_at?: string
          formats?: string[]
          ghost_badge?: boolean
          home_city?: string
          home_courts?: string | null
          id?: string
          is_admin?: boolean
          lang?: string
          level?: number
          looking_for?: Database["public"]["Enums"]["looking_for_t"]
          name?: string
          phone_e164?: string
          photo_url?: string | null
          play_times?: string[]
          rescues_count?: number
          signup_code?: string | null
          vibe?: Database["public"]["Enums"]["vibe_t"]
        }
        Relationships: []
      }
      sos_requests: {
        Row: {
          caller_id: string
          claimed_by: string | null
          court_id: string | null
          court_status: Database["public"]["Enums"]["court_status_t"]
          created_at: string
          format: Database["public"]["Enums"]["sos_format_t"]
          id: string
          level_max: number
          level_min: number
          note: string | null
          play_at: string
          status: Database["public"]["Enums"]["sos_status_t"]
        }
        Insert: {
          caller_id: string
          claimed_by?: string | null
          court_id?: string | null
          court_status: Database["public"]["Enums"]["court_status_t"]
          created_at?: string
          format: Database["public"]["Enums"]["sos_format_t"]
          id?: string
          level_max?: number
          level_min?: number
          note?: string | null
          play_at: string
          status?: Database["public"]["Enums"]["sos_status_t"]
        }
        Update: {
          caller_id?: string
          claimed_by?: string | null
          court_id?: string | null
          court_status?: Database["public"]["Enums"]["court_status_t"]
          created_at?: string
          format?: Database["public"]["Enums"]["sos_format_t"]
          id?: string
          level_max?: number
          level_min?: number
          note?: string | null
          play_at?: string
          status?: Database["public"]["Enums"]["sos_status_t"]
        }
        Relationships: [
          {
            foreignKeyName: "sos_requests_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"] | null
          buddy_radius_km: number | null
          created_at: string | null
          formats: string[] | null
          ghost_badge: boolean | null
          home_city: string | null
          home_courts: string | null
          id: string | null
          level: number | null
          looking_for: Database["public"]["Enums"]["looking_for_t"] | null
          name: string | null
          photo_url: string | null
          play_times: string[] | null
          rescues_count: number | null
          vibe: Database["public"]["Enums"]["vibe_t"] | null
        }
        Insert: {
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"] | null
          buddy_radius_km?: number | null
          created_at?: string | null
          formats?: string[] | null
          ghost_badge?: boolean | null
          home_city?: string | null
          home_courts?: string | null
          id?: string | null
          level?: number | null
          looking_for?: Database["public"]["Enums"]["looking_for_t"] | null
          name?: string | null
          photo_url?: string | null
          play_times?: string[] | null
          rescues_count?: number | null
          vibe?: Database["public"]["Enums"]["vibe_t"] | null
        }
        Update: {
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"] | null
          buddy_radius_km?: number | null
          created_at?: string | null
          formats?: string[] | null
          ghost_badge?: boolean | null
          home_city?: string | null
          home_courts?: string | null
          id?: string | null
          level?: number | null
          looking_for?: Database["public"]["Enums"]["looking_for_t"] | null
          name?: string | null
          photo_url?: string | null
          play_times?: string[] | null
          rescues_count?: number | null
          vibe?: Database["public"]["Enums"]["vibe_t"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      _add_buddy: {
        Args: { _a: string; _b: string; _source: string }
        Returns: undefined
      }
      active_sos_count: { Args: { _uid: string }; Returns: number }
      admin_set_invite_active: {
        Args: { _active: boolean; _code: string }
        Returns: undefined
      }
      admin_stats: {
        Args: never
        Returns: {
          active_sos_count: number
          fill_rate: number
          profiles_count: number
        }[]
      }
      claim_sos: {
        Args: { _sos_id: string }
        Returns: {
          game_id: string
          ok: boolean
          reason: string
          sos_id: string
        }[]
      }
      confirm_game: { Args: { _game_id: string }; Returns: undefined }
      count_matching_rescuers: { Args: { _sos_id: string }; Returns: number }
      eligible_sos_for_me: {
        Args: never
        Returns: {
          caller_id: string
          caller_name: string
          claimed_by: string
          court_area: string
          court_city: string
          court_id: string
          court_name: string
          court_status: Database["public"]["Enums"]["court_status_t"]
          created_at: string
          format: Database["public"]["Enums"]["sos_format_t"]
          id: string
          is_buddy: boolean
          level_max: number
          level_min: number
          note: string
          play_at: string
          status: Database["public"]["Enums"]["sos_status_t"]
        }[]
      }
      expire_old_sos: { Args: never; Returns: undefined }
      is_buddy: { Args: { _a: string; _b: string }; Returns: boolean }
      remove_buddy: { Args: { _other: string }; Returns: undefined }
      report_noshow: { Args: { _game_id: string }; Returns: undefined }
      request_buddy: { Args: { _other: string }; Returns: undefined }
      respond_buddy_request: {
        Args: { _accept: boolean; _req_id: string }
        Returns: undefined
      }
    }
    Enums: {
      buddy_optin_t: "yes" | "sometimes" | "no"
      court_status_t: "booked_paid" | "booked" | "will_book" | "public"
      looking_for_t: "regular" | "dropin" | "both"
      sos_format_t: "singles" | "doubles_need1" | "doubles_need2"
      sos_status_t: "active" | "claimed" | "expired" | "cancelled"
      vibe_t: "chill" | "friendly" | "sweat"
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
      buddy_optin_t: ["yes", "sometimes", "no"],
      court_status_t: ["booked_paid", "booked", "will_book", "public"],
      looking_for_t: ["regular", "dropin", "both"],
      sos_format_t: ["singles", "doubles_need1", "doubles_need2"],
      sos_status_t: ["active", "claimed", "expired", "cancelled"],
      vibe_t: ["chill", "friendly", "sweat"],
    },
  },
} as const
