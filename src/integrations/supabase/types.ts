export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      events: {
        Row: {
          created_at: string;
          event_name: string;
          id: string;
          owner_id: string;
          updated_at: string;
          wedding_date: string | null;
        };
        Insert: {
          created_at?: string;
          event_name?: string;
          id?: string;
          owner_id: string;
          updated_at?: string;
          wedding_date?: string | null;
        };
        Update: {
          created_at?: string;
          event_name?: string;
          id?: string;
          owner_id?: string;
          updated_at?: string;
          wedding_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_payments: {
        Row: {
          amount: number;
          created_at: string;
          expense_id: string;
          id: string;
          note: string | null;
          payment_date: string;
          payment_method: string;
          payment_type: string;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          expense_id: string;
          id?: string;
          note?: string | null;
          payment_date?: string;
          payment_method?: string;
          payment_type?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          expense_id?: string;
          id?: string;
          note?: string | null;
          payment_date?: string;
          payment_method?: string;
          payment_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_payments_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          balance_date: string | null;
          category: string;
          created_at: string;
          deposit_date: string | null;
          deposit_percent: number;
          event_id: string;
          id: string;
          meal_price: number | null;
          name: string;
          position: number;
          price: number;
          requires_deposit: boolean;
          updated_at: string;
        };
        Insert: {
          balance_date?: string | null;
          category: string;
          created_at?: string;
          deposit_date?: string | null;
          deposit_percent?: number;
          event_id: string;
          id?: string;
          meal_price?: number | null;
          name: string;
          position?: number;
          price?: number;
          requires_deposit?: boolean;
          updated_at?: string;
        };
        Update: {
          balance_date?: string | null;
          category?: string;
          created_at?: string;
          deposit_date?: string | null;
          deposit_percent?: number;
          event_id?: string;
          id?: string;
          meal_price?: number | null;
          name?: string;
          position?: number;
          price?: number;
          requires_deposit?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_members: {
        Row: {
          accessibility_notes: string | null;
          age_group: string | null;
          created_at: string;
          dietary_notes: string | null;
          full_name: string | null;
          guest_id: string;
          id: string;
          meal_preference: string | null;
          position: number;
          updated_at: string;
        };
        Insert: {
          accessibility_notes?: string | null;
          age_group?: string | null;
          created_at?: string;
          dietary_notes?: string | null;
          full_name?: string | null;
          guest_id: string;
          id?: string;
          meal_preference?: string | null;
          position?: number;
          updated_at?: string;
        };
        Update: {
          accessibility_notes?: string | null;
          age_group?: string | null;
          created_at?: string;
          dietary_notes?: string | null;
          full_name?: string | null;
          guest_id?: string;
          id?: string;
          meal_preference?: string | null;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guest_members_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "guests";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_settings: {
        Row: {
          attendance_rate: number;
          avg_envelope_price: number;
          event_id: string;
          id: string;
          reserve: number;
          total_invited: number;
          updated_at: string;
        };
        Insert: {
          attendance_rate?: number;
          avg_envelope_price?: number;
          event_id: string;
          id?: string;
          reserve?: number;
          total_invited?: number;
          updated_at?: string;
        };
        Update: {
          attendance_rate?: number;
          avg_envelope_price?: number;
          event_id?: string;
          id?: string;
          reserve?: number;
          total_invited?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guest_settings_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      guests: {
        Row: {
          arrived: boolean | null;
          arrived_count: number | null;
          created_at: string;
          email: string | null;
          event_id: string;
          full_name: string;
          gift_amount: number;
          group_category: string | null;
          group_size: number;
          id: string;
          needs_transport: boolean;
          notes: string | null;
          payment_method: string | null;
          phone: string | null;
          pickup_location: string | null;
          relationship: string | null;
          side: string | null;
          updated_at: string;
        };
        Insert: {
          arrived?: boolean | null;
          arrived_count?: number | null;
          created_at?: string;
          email?: string | null;
          event_id: string;
          full_name: string;
          gift_amount?: number;
          group_category?: string | null;
          group_size?: number;
          id?: string;
          needs_transport?: boolean;
          notes?: string | null;
          payment_method?: string | null;
          phone?: string | null;
          pickup_location?: string | null;
          relationship?: string | null;
          side?: string | null;
          updated_at?: string;
        };
        Update: {
          arrived?: boolean | null;
          arrived_count?: number | null;
          created_at?: string;
          email?: string | null;
          event_id?: string;
          full_name?: string;
          gift_amount?: number;
          group_category?: string | null;
          group_size?: number;
          id?: string;
          needs_transport?: boolean;
          notes?: string | null;
          payment_method?: string | null;
          phone?: string | null;
          pickup_location?: string | null;
          relationship?: string | null;
          side?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          invited_by: string | null;
          is_active: boolean;
          last_login: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          invited_by?: string | null;
          is_active?: boolean;
          last_login?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          invited_by?: string | null;
          is_active?: boolean;
          last_login?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          event_id: string;
          id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          event_id: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          event_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_events_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string;
          currency: string;
          event_id: string;
          id: string;
          payment_reference: string | null;
          plan: string;
          premium_expires_at: string | null;
          premium_started_at: string | null;
          price_paid: number | null;
          trial_expires_at: string;
          trial_started_at: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          event_id: string;
          id?: string;
          payment_reference?: string | null;
          plan?: string;
          premium_expires_at?: string | null;
          premium_started_at?: string | null;
          price_paid?: number | null;
          trial_expires_at?: string;
          trial_started_at?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          event_id?: string;
          id?: string;
          payment_reference?: string | null;
          plan?: string;
          premium_expires_at?: string | null;
          premium_started_at?: string | null;
          price_paid?: number | null;
          trial_expires_at?: string;
          trial_started_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_set_subscription: {
        Args: {
          _action: string;
          _custom_expires?: string;
          _event_id: string;
          _months?: number;
          _note?: string;
        };
        Returns: {
          created_at: string;
          currency: string;
          event_id: string;
          id: string;
          payment_reference: string | null;
          plan: string;
          premium_expires_at: string | null;
          premium_started_at: string | null;
          price_paid: number | null;
          trial_expires_at: string;
          trial_started_at: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "subscriptions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;
