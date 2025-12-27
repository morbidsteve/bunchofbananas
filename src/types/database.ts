export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string
          name: string
          is_public: boolean
          share_token: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          is_public?: boolean
          share_token?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_public?: boolean
          share_token?: string
          created_at?: string
          updated_at?: string
        }
      }
      household_invites: {
        Row: {
          id: string
          household_id: string
          email: string
          role: 'owner' | 'member'
          invited_by: string
          token: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          email: string
          role?: 'owner' | 'member'
          invited_by: string
          token?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          email?: string
          role?: 'owner' | 'member'
          invited_by?: string
          token?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
      }
      household_members: {
        Row: {
          id: string
          household_id: string
          user_id: string
          role: 'owner' | 'member'
          created_at: string
          invited_by: string | null
        }
        Insert: {
          id?: string
          household_id: string
          user_id: string
          role?: 'owner' | 'member'
          created_at?: string
          invited_by?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          user_id?: string
          role?: 'owner' | 'member'
          created_at?: string
          invited_by?: string | null
        }
      }
      storage_units: {
        Row: {
          id: string
          household_id: string
          name: string
          type: 'fridge' | 'freezer' | 'pantry' | 'cabinet' | 'other'
          location: string | null
          width_inches: number | null
          height_inches: number | null
          depth_inches: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          type: 'fridge' | 'freezer' | 'pantry' | 'cabinet' | 'other'
          location?: string | null
          width_inches?: number | null
          height_inches?: number | null
          depth_inches?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          type?: 'fridge' | 'freezer' | 'pantry' | 'cabinet' | 'other'
          location?: string | null
          width_inches?: number | null
          height_inches?: number | null
          depth_inches?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      shelves: {
        Row: {
          id: string
          storage_unit_id: string
          name: string
          position: number
          height_inches: number | null
          created_at: string
        }
        Insert: {
          id?: string
          storage_unit_id: string
          name: string
          position: number
          height_inches?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          storage_unit_id?: string
          name?: string
          position?: number
          height_inches?: number | null
          created_at?: string
        }
      }
      items: {
        Row: {
          id: string
          household_id: string
          name: string
          category: string | null
          default_unit: string | null
          barcode: string | null
          image_url: string | null
          calories: number | null
          protein_g: number | null
          carbs_g: number | null
          fat_g: number | null
          fiber_g: number | null
          sugar_g: number | null
          sodium_mg: number | null
          nutriscore: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          category?: string | null
          default_unit?: string | null
          barcode?: string | null
          image_url?: string | null
          calories?: number | null
          protein_g?: number | null
          carbs_g?: number | null
          fat_g?: number | null
          fiber_g?: number | null
          sugar_g?: number | null
          sodium_mg?: number | null
          nutriscore?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          category?: string | null
          default_unit?: string | null
          barcode?: string | null
          image_url?: string | null
          calories?: number | null
          protein_g?: number | null
          carbs_g?: number | null
          fat_g?: number | null
          fiber_g?: number | null
          sugar_g?: number | null
          sodium_mg?: number | null
          nutriscore?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      inventory: {
        Row: {
          id: string
          item_id: string
          shelf_id: string
          quantity: number
          unit: string
          expiration_date: string | null
          added_at: string
          added_by: string
          notes: string | null
          priority: 'normal' | 'use_soon' | 'urgent'
          condition_notes: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          item_id: string
          shelf_id: string
          quantity: number
          unit: string
          expiration_date?: string | null
          added_at?: string
          added_by: string
          notes?: string | null
          priority?: 'normal' | 'use_soon' | 'urgent'
          condition_notes?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          shelf_id?: string
          quantity?: number
          unit?: string
          expiration_date?: string | null
          added_at?: string
          added_by?: string
          notes?: string | null
          priority?: 'normal' | 'use_soon' | 'urgent'
          condition_notes?: string | null
          updated_at?: string
        }
      }
      stores: {
        Row: {
          id: string
          household_id: string
          name: string
          location: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          location?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          location?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      price_history: {
        Row: {
          id: string
          item_id: string
          store_id: string
          price: number
          quantity: number
          unit: string
          recorded_at: string
          recorded_by: string
          on_sale: boolean
        }
        Insert: {
          id?: string
          item_id: string
          store_id: string
          price: number
          quantity: number
          unit: string
          recorded_at?: string
          recorded_by: string
          on_sale?: boolean
        }
        Update: {
          id?: string
          item_id?: string
          store_id?: string
          price?: number
          quantity?: number
          unit?: string
          recorded_at?: string
          recorded_by?: string
          on_sale?: boolean
        }
      }
      inventory_log: {
        Row: {
          id: string
          inventory_id: string | null
          item_id: string
          action: 'added' | 'removed' | 'used' | 'expired' | 'moved'
          quantity_change: number
          performed_by: string
          performed_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          inventory_id?: string | null
          item_id: string
          action: 'added' | 'removed' | 'used' | 'expired' | 'moved'
          quantity_change: number
          performed_by: string
          performed_at?: string
          notes?: string | null
        }
        Update: {
          id?: string
          inventory_id?: string | null
          item_id?: string
          action?: 'added' | 'removed' | 'used' | 'expired' | 'moved'
          quantity_change?: number
          performed_by?: string
          performed_at?: string
          notes?: string | null
        }
      }
      user_recipes: {
        Row: {
          id: string
          household_id: string
          created_by: string
          title: string
          description: string | null
          instructions: string
          category: string | null
          cuisine: string | null
          prep_time_minutes: number | null
          cook_time_minutes: number | null
          servings: number | null
          image_path: string | null
          source_type: 'manual' | 'text_import' | 'ocr_import' | 'url_import'
          source_url: string | null
          original_text: string | null
          is_public: boolean
          share_token: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          created_by: string
          title: string
          description?: string | null
          instructions: string
          category?: string | null
          cuisine?: string | null
          prep_time_minutes?: number | null
          cook_time_minutes?: number | null
          servings?: number | null
          image_path?: string | null
          source_type?: 'manual' | 'text_import' | 'ocr_import' | 'url_import'
          source_url?: string | null
          original_text?: string | null
          is_public?: boolean
          share_token?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          created_by?: string
          title?: string
          description?: string | null
          instructions?: string
          category?: string | null
          cuisine?: string | null
          prep_time_minutes?: number | null
          cook_time_minutes?: number | null
          servings?: number | null
          image_path?: string | null
          source_type?: 'manual' | 'text_import' | 'ocr_import' | 'url_import'
          source_url?: string | null
          original_text?: string | null
          is_public?: boolean
          share_token?: string
          created_at?: string
          updated_at?: string
        }
      }
      recipe_ingredients: {
        Row: {
          id: string
          recipe_id: string
          name: string
          quantity: string | null
          unit: string | null
          notes: string | null
          position: number
          normalized_name: string
          created_at: string
        }
        Insert: {
          id?: string
          recipe_id: string
          name: string
          quantity?: string | null
          unit?: string | null
          notes?: string | null
          position?: number
          normalized_name: string
          created_at?: string
        }
        Update: {
          id?: string
          recipe_id?: string
          name?: string
          quantity?: string | null
          unit?: string | null
          notes?: string | null
          position?: number
          normalized_name?: string
          created_at?: string
        }
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
  }
}

// Helper types for easier usage
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Convenience type aliases
export type Household = Tables<'households'>
export type HouseholdMember = Tables<'household_members'>
export type HouseholdInvite = Tables<'household_invites'>
export type StorageUnit = Tables<'storage_units'>
export type Shelf = Tables<'shelves'>
export type Item = Tables<'items'>
export type Inventory = Tables<'inventory'>
export type Store = Tables<'stores'>
export type PriceHistory = Tables<'price_history'>
export type InventoryLog = Tables<'inventory_log'>
export type UserRecipe = Tables<'user_recipes'>
export type RecipeIngredient = Tables<'recipe_ingredients'>
