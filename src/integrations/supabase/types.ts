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
          created_at: string
          created_by: string | null
          hidden: boolean
          id: string
          is_custom: boolean
          name: string
        }
        Insert: {
          area?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          hidden?: boolean
          id?: string
          is_custom?: boolean
          name: string
        }
        Update: {
          area?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          hidden?: boolean
          id?: string
          is_custom?: boolean
          name?: string
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      event_requests: {
        Row: {
          capacity: number | null
          city: string | null
          contact: string | null
          created_at: string
          description: string | null
          format: string | null
          host_id: string
          id: string
          location: string
          price_sek: number | null
          spots_taken: number
          starts_at: string
          status: string
          swish_number: string | null
          title: string
        }
        Insert: {
          capacity?: number | null
          city?: string | null
          contact?: string | null
          created_at?: string
          description?: string | null
          format?: string | null
          host_id: string
          id?: string
          location: string
          price_sek?: number | null
          spots_taken?: number
          starts_at: string
          status?: string
          swish_number?: string | null
          title: string
        }
        Update: {
          capacity?: number | null
          city?: string | null
          contact?: string | null
          created_at?: string
          description?: string | null
          format?: string | null
          host_id?: string
          id?: string
          location?: string
          price_sek?: number | null
          spots_taken?: number
          starts_at?: string
          status?: string
          swish_number?: string | null
          title?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          archived_by: string[]
          confirmed_a: boolean
          confirmed_b: boolean
          created_at: string
          id: string
          played_at: string
          player_a: string
          player_b: string
          reported_noshow: string | null
          sos_id: string | null
        }
        Insert: {
          archived_by?: string[]
          confirmed_a?: boolean
          confirmed_b?: boolean
          created_at?: string
          id?: string
          played_at: string
          player_a: string
          player_b: string
          reported_noshow?: string | null
          sos_id?: string | null
        }
        Update: {
          archived_by?: string[]
          confirmed_a?: boolean
          confirmed_b?: boolean
          created_at?: string
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
          bio: string | null
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km: number
          buddy_sos_optin: boolean
          created_at: string
          fav_shot: string | null
          formats: string[]
          games_played: number
          ghost_badge: boolean
          home_cities: string[] | null
          home_city: string
          home_courts: string | null
          id: string
          is_admin: boolean
          lang: string
          last_name: string | null
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
          bio?: string | null
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km?: number
          buddy_sos_optin?: boolean
          created_at?: string
          fav_shot?: string | null
          formats?: string[]
          games_played?: number
          ghost_badge?: boolean
          home_cities?: string[] | null
          home_city?: string
          home_courts?: string | null
          id: string
          is_admin?: boolean
          lang?: string
          last_name?: string | null
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
          bio?: string | null
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km?: number
          buddy_sos_optin?: boolean
          created_at?: string
          fav_shot?: string | null
          formats?: string[]
          games_played?: number
          ghost_badge?: boolean
          home_cities?: string[] | null
          home_city?: string
          home_courts?: string | null
          id?: string
          is_admin?: boolean
          lang?: string
          last_name?: string | null
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
          auto_flare: boolean
          caller_id: string
          claimed_by: string | null
          court_id: string | null
          court_status: Database["public"]["Enums"]["court_status_t"]
          court_type: Database["public"]["Enums"]["court_type_t"]
          created_at: string
          flared_at: string | null
          format: Database["public"]["Enums"]["sos_format_t"]
          id: string
          kind: string
          level_max: number
          level_min: number
          note: string | null
          play_at: string
          spots_filled: number
          spots_needed: number
          status: Database["public"]["Enums"]["sos_status_t"]
        }
        Insert: {
          auto_flare?: boolean
          caller_id: string
          claimed_by?: string | null
          court_id?: string | null
          court_status: Database["public"]["Enums"]["court_status_t"]
          court_type?: Database["public"]["Enums"]["court_type_t"]
          created_at?: string
          flared_at?: string | null
          format: Database["public"]["Enums"]["sos_format_t"]
          id?: string
          kind?: string
          level_max?: number
          level_min?: number
          note?: string | null
          play_at: string
          spots_filled?: number
          spots_needed?: number
          status?: Database["public"]["Enums"]["sos_status_t"]
        }
        Update: {
          auto_flare?: boolean
          caller_id?: string
          claimed_by?: string | null
          court_id?: string | null
          court_status?: Database["public"]["Enums"]["court_status_t"]
          court_type?: Database["public"]["Enums"]["court_type_t"]
          created_at?: string
          flared_at?: string | null
          format?: Database["public"]["Enums"]["sos_format_t"]
          id?: string
          kind?: string
          level_max?: number
          level_min?: number
          note?: string | null
          play_at?: string
          spots_filled?: number
          spots_needed?: number
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
          bio: string | null
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"] | null
          buddy_radius_km: number | null
          created_at: string | null
          fav_shot: string | null
          formats: string[] | null
          games_played: number | null
          ghost_badge: boolean | null
          home_cities: string[] | null
          home_city: string | null
          home_courts: string | null
          id: string | null
          last_name: string | null
          level: number | null
          looking_for: Database["public"]["Enums"]["looking_for_t"] | null
          name: string | null
          photo_url: string | null
          play_times: string[] | null
          rescues_count: number | null
          vibe: Database["public"]["Enums"]["vibe_t"] | null
        }
        Insert: {
          bio?: string | null
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"] | null
          buddy_radius_km?: number | null
          created_at?: string | null
          fav_shot?: string | null
          formats?: string[] | null
          games_played?: number | null
          ghost_badge?: boolean | null
          home_cities?: string[] | null
          home_city?: string | null
          home_courts?: string | null
          id?: string | null
          last_name?: string | null
          level?: number | null
          looking_for?: Database["public"]["Enums"]["looking_for_t"] | null
          name?: string | null
          photo_url?: string | null
          play_times?: string[] | null
          rescues_count?: number | null
          vibe?: Database["public"]["Enums"]["vibe_t"] | null
        }
        Update: {
          bio?: string | null
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"] | null
          buddy_radius_km?: number | null
          created_at?: string | null
          fav_shot?: string | null
          formats?: string[] | null
          games_played?: number | null
          ghost_badge?: boolean | null
          home_cities?: string[] | null
          home_city?: string | null
          home_courts?: string | null
          id?: string | null
          last_name?: string | null
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
      admin_courts_list: {
        Args: never
        Returns: {
          area: string
          city: string
          created_at: string
          created_by: string
          creator_name: string
          hidden: boolean
          id: string
          name: string
          usage_count: number
        }[]
      }
      admin_create_invite_code: {
        Args: { _code: string; _owner_id: string; _uses: number }
        Returns: undefined
      }
      admin_dashboard: { Args: never; Returns: Json }
      admin_delete_invite_code: { Args: { _code: string }; Returns: undefined }
      admin_invite_codes: {
        Args: never
        Returns: {
          active: boolean
          code: string
          created_at: string
          signups: number
          uses_remaining: number
        }[]
      }
      admin_players_list: {
        Args: never
        Returns: {
          created_at: string
          home_city: string
          id: string
          name: string
          rescues_count: number
          signup_code: string
        }[]
      }
      admin_set_court_hidden: {
        Args: { _court_id: string; _hidden: boolean }
        Returns: undefined
      }
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
      admin_update_court: {
        Args: { _area: string; _court_id: string; _name: string }
        Returns: undefined
      }
      archive_game: { Args: { _game_id: string }; Returns: undefined }
      cancel_sos: { Args: { _sos_id: string }; Returns: undefined }
      check_invite_code: { Args: { _code: string }; Returns: boolean }
      claim_sos: {
        Args: { _sos_id: string }
        Returns: {
          game_id: string
          ok: boolean
          reason: string
          sos_id: string
        }[]
      }
      community_stats: {
        Args: { _city: string }
        Returns: {
          all_time_games: number
          games_matched: number
          new_buddies: number
          sets_saved: number
        }[]
      }
      confirm_game: { Args: { _game_id: string }; Returns: undefined }
      count_matching_rescuers: { Args: { _sos_id: string }; Returns: number }
      eligible_open_games_for_me: {
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
          court_type: Database["public"]["Enums"]["court_type_t"]
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
          court_type: Database["public"]["Enums"]["court_type_t"]
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
      ensure_my_invite_code: { Args: never; Returns: string }
      escalate_due_open_games: { Args: never; Returns: number }
      expire_old_sos: { Args: never; Returns: undefined }
      get_contact_phone: {
        Args: { _target: string }
        Returns: {
          name: string
          phone: string
        }[]
      }
      get_event_swish: { Args: { _event_id: string }; Returns: string }
      get_my_full_profile: {
        Args: never
        Returns: {
          bio: string | null
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km: number
          buddy_sos_optin: boolean
          created_at: string
          fav_shot: string | null
          formats: string[]
          games_played: number
          ghost_badge: boolean
          home_cities: string[] | null
          home_city: string
          home_courts: string | null
          id: string
          is_admin: boolean
          lang: string
          last_name: string | null
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
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_buddy: { Args: { _a: string; _b: string }; Returns: boolean }
      join_event: {
        Args: { _event_id: string }
        Returns: {
          attendee_status: string
          ok: boolean
          reason: string
        }[]
      }
      leave_event: { Args: { _event_id: string }; Returns: undefined }
      remove_buddy: { Args: { _other: string }; Returns: undefined }
      report_noshow: { Args: { _game_id: string }; Returns: undefined }
      request_buddy: { Args: { _other: string }; Returns: undefined }
      respond_buddy_request: {
        Args: { _accept: boolean; _req_id: string }
        Returns: undefined
      }
      set_my_invite_code: { Args: { _new: string }; Returns: string }
      top_rescuers_month: {
        Args: never
        Returns: {
          name: string
          rescues: number
          user_id: string
        }[]
      }
      withdraw_claim: {
        Args: { _sos_id: string }
        Returns: {
          ok: boolean
          re_flared: boolean
          reason: string
        }[]
      }
    }
    Enums: {
      buddy_optin_t: "yes" | "sometimes" | "no"
      court_status_t: "booked_paid" | "booked" | "will_book" | "public"
      court_type_t: "indoor" | "outdoor"
      looking_for_t: "regular" | "dropin" | "both"
      sos_format_t:
        | "singles"
        | "doubles_need1"
        | "doubles_need2"
        | "doubles_need3"
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
      court_type_t: ["indoor", "outdoor"],
      looking_for_t: ["regular", "dropin", "both"],
      sos_format_t: [
        "singles",
        "doubles_need1",
        "doubles_need2",
        "doubles_need3",
      ],
      sos_status_t: ["active", "claimed", "expired", "cancelled"],
      vibe_t: ["chill", "friendly", "sweat"],
    },
  },
} as const
