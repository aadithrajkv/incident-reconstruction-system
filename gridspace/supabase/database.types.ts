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
      business_profiles: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          latitude: number | null
          longitude: number | null
          opening_hours: Json
          owner_id: string
          public_name: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          opening_hours?: Json
          owner_id?: string
          public_name: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          opening_hours?: Json
          owner_id?: string
          public_name?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: []
      }
      grid_issues: {
        Row: {
          author_id: string
          body: string
          category: string
          created_at: string
          expires_at: string
          grid_id: string
          id: string
          image_path: string | null
          moderation_status: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          body: string
          category: string
          created_at?: string
          expires_at?: string
          grid_id: string
          id?: string
          image_path?: string | null
          moderation_status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          category?: string
          created_at?: string
          expires_at?: string
          grid_id?: string
          id?: string
          image_path?: string | null
          moderation_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      grid_subscriptions: {
        Row: {
          created_at: string
          grid_id: string
          label: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grid_id: string
          label?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          grid_id?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          active_hours: Json
          business_id: string
          created_at: string
          ends_at: string
          grid_id: string
          id: string
          listing_image_path: string | null
          message: string
          moderation_status: string
          owner_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          active_hours?: Json
          business_id: string
          created_at?: string
          ends_at?: string
          grid_id: string
          id?: string
          listing_image_path?: string | null
          message: string
          moderation_status?: string
          owner_id?: string
          starts_at?: string
          updated_at?: string
        }
        Update: {
          active_hours?: Json
          business_id?: string
          created_at?: string
          ends_at?: string
          grid_id?: string
          id?: string
          listing_image_path?: string | null
          message?: string
          moderation_status?: string
          owner_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_business_id_owner_id_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          home_grid_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          home_grid_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          home_grid_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      thoughts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          emoji: string | null
          expires_at: string
          grid_id: string
          id: string
          moderation_status: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          emoji?: string | null
          expires_at?: string
          grid_id: string
          id?: string
          moderation_status?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          emoji?: string | null
          expires_at?: string
          grid_id?: string
          id?: string
          moderation_status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
