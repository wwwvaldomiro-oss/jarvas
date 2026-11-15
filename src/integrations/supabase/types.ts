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
      agenda_checks: {
        Row: {
          done: boolean
          item_key: string
          occurrence_date: string
          record_id: string
          user_id: string
        }
        Insert: {
          done?: boolean
          item_key: string
          occurrence_date: string
          record_id: string
          user_id: string
        }
        Update: {
          done?: boolean
          item_key?: string
          occurrence_date?: string
          record_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_checks_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "agenda_records"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_records: {
        Row: {
          created_at: string
          description: string
          favorite: boolean
          id: string
          items: Json
          kind: string
          recurrence: string
          reminder: boolean
          start_date: string
          time: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          favorite?: boolean
          id?: string
          items?: Json
          kind: string
          recurrence?: string
          reminder?: boolean
          start_date: string
          time?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          favorite?: boolean
          id?: string
          items?: Json
          kind?: string
          recurrence?: string
          reminder?: boolean
          start_date?: string
          time?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      annual_expense_months: {
        Row: {
          annual_expense_id: string
          expected_cents: number | null
          month: number
        }
        Insert: {
          annual_expense_id: string
          expected_cents?: number | null
          month: number
        }
        Update: {
          annual_expense_id?: string
          expected_cents?: number | null
          month?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_expense_months_annual_expense_id_fkey"
            columns: ["annual_expense_id"]
            isOneToOne: false
            referencedRelation: "annual_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      annual_expenses: {
        Row: {
          annual_tax_kind: string | null
          consumption_value_type: string
          creditor: string
          due_day: number | null
          expense_kind: string
          expense_source: string
          id: string
          position: number
          source_contract_id: string | null
          source_template_id: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          annual_tax_kind?: string | null
          consumption_value_type?: string
          creditor: string
          due_day?: number | null
          expense_kind?: string
          expense_source?: string
          id?: string
          position?: number
          source_contract_id?: string | null
          source_template_id?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          annual_tax_kind?: string | null
          consumption_value_type?: string
          creditor?: string
          due_day?: number | null
          expense_kind?: string
          expense_source?: string
          id?: string
          position?: number
          source_contract_id?: string | null
          source_template_id?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      annual_years: {
        Row: {
          archived_at: string | null
          created_at: string
          source_name: string | null
          user_id: string
          year: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          source_name?: string | null
          user_id: string
          year: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          source_name?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          after_json: Json | null
          at: string
          before_json: Json | null
          details_json: Json | null
          entity_id: string | null
          entity_type: string | null
          seq: number
          user_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          after_json?: Json | null
          at?: string
          before_json?: Json | null
          details_json?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          seq?: never
          user_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          after_json?: Json | null
          at?: string
          before_json?: Json | null
          details_json?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          seq?: never
          user_id?: string
        }
        Relationships: []
      }
      axion_conversations: {
        Row: {
          archived: boolean
          branches: Json
          id: string
          revision: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          branches: Json
          id: string
          revision?: number
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          branches?: Json
          id?: string
          revision?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      axion_gemini: {
        Row: {
          api_key: string
          user_id: string
        }
        Insert: {
          api_key: string
          user_id: string
        }
        Update: {
          api_key?: string
          user_id?: string
        }
        Relationships: []
      }
      axion_monthly_reservations: {
        Row: {
          month: string
          reserved_cents: number
        }
        Insert: {
          month: string
          reserved_cents: number
        }
        Update: {
          month?: string
          reserved_cents?: number
        }
        Relationships: []
      }
      axion_owner: {
        Row: {
          singleton: boolean
          user_id: string
        }
        Insert: {
          singleton?: boolean
          user_id: string
        }
        Update: {
          singleton?: boolean
          user_id?: string
        }
        Relationships: []
      }
      axion_preferences: {
        Row: {
          deep: boolean
          memory: string
          tone: string
          user_id: string
        }
        Insert: {
          deep?: boolean
          memory?: string
          tone: string
          user_id?: string
        }
        Update: {
          deep?: boolean
          memory?: string
          tone?: string
          user_id?: string
        }
        Relationships: []
      }
      axion_provider: {
        Row: {
          api_key: string
          max_request_cents: number
          model: string
          singleton: boolean
          user_id: string
          web: boolean
        }
        Insert: {
          api_key: string
          max_request_cents: number
          model: string
          singleton?: boolean
          user_id: string
          web?: boolean
        }
        Update: {
          api_key?: string
          max_request_cents?: number
          model?: string
          singleton?: boolean
          user_id?: string
          web?: boolean
        }
        Relationships: []
      }
      axion_transfer: {
        Row: {
          expires_at: string
          from_user: string
          singleton: boolean
          to_user: string
        }
        Insert: {
          expires_at: string
          from_user: string
          singleton?: boolean
          to_user: string
        }
        Update: {
          expires_at?: string
          from_user?: string
          singleton?: boolean
          to_user?: string
        }
        Relationships: []
      }
      finance_account_profiles: {
        Row: {
          account_id: string
          annual_expense_id: string | null
          card_brand: string | null
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          annual_expense_id?: string | null
          card_brand?: string | null
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          annual_expense_id?: string | null
          card_brand?: string | null
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_account_profiles_annual_expense_id_fkey"
            columns: ["annual_expense_id"]
            isOneToOne: false
            referencedRelation: "annual_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_adjustment_proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          paid_cents: number | null
          paid_date: string | null
          payment_id: string
          payment_kind: string
          reason: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          paid_cents?: number | null
          paid_date?: string | null
          payment_id: string
          payment_kind: string
          reason: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          paid_cents?: number | null
          paid_date?: string | null
          payment_id?: string
          payment_kind?: string
          reason?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          mime_type: string
          original_name: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          mime_type: string
          original_name: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          mime_type?: string
          original_name?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_bills: {
        Row: {
          contract_id: string | null
          created_at: string
          creditor: string
          description: string | null
          due_date: string
          expected_cents: number
          expense_kind: string
          id: string
          installment_number: number | null
          is_settled: boolean
          paid_cents: number | null
          paid_date: string | null
          paid_note: string | null
          source_annual_id: string | null
          source_period: string | null
          user_id: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          creditor: string
          description?: string | null
          due_date: string
          expected_cents: number
          expense_kind?: string
          id: string
          installment_number?: number | null
          is_settled?: boolean
          paid_cents?: number | null
          paid_date?: string | null
          paid_note?: string | null
          source_annual_id?: string | null
          source_period?: string | null
          user_id: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          creditor?: string
          description?: string | null
          due_date?: string
          expected_cents?: number
          expense_kind?: string
          id?: string
          installment_number?: number | null
          is_settled?: boolean
          paid_cents?: number | null
          paid_date?: string | null
          paid_note?: string | null
          source_annual_id?: string | null
          source_period?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_bills_source_annual_id_fkey"
            columns: ["source_annual_id"]
            isOneToOne: false
            referencedRelation: "annual_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_card_closed_invoices: {
        Row: {
          account_id: string
          amount_cents: number
          annual_expense_id: string | null
          closed_at: string
          due_date: string
          origin: string
          period: string
          provider_reference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          annual_expense_id?: string | null
          closed_at: string
          due_date: string
          origin: string
          period: string
          provider_reference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          annual_expense_id?: string | null
          closed_at?: string
          due_date?: string
          origin?: string
          period?: string
          provider_reference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_card_closed_invoices_annual_expense_id_fkey"
            columns: ["annual_expense_id"]
            isOneToOne: false
            referencedRelation: "annual_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_card_debt_links: {
        Row: {
          card_id: string
          liability_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          liability_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          liability_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_card_limit_overrides: {
        Row: {
          account_id: string
          limit_cents: number
          updated_at: string
          used_cents: number
          user_id: string
        }
        Insert: {
          account_id: string
          limit_cents: number
          updated_at?: string
          used_cents: number
          user_id: string
        }
        Update: {
          account_id?: string
          limit_cents?: number
          updated_at?: string
          used_cents?: number
          user_id?: string
        }
        Relationships: []
      }
      finance_card_month_snapshots: {
        Row: {
          account_id: string
          available_limit_cents: number | null
          captured_at: string
          closing_date: string | null
          due_date: string | null
          invoice_cents: number | null
          period: string
          provider_invoice_id: string | null
          total_limit_cents: number | null
          transactions: Json
          used_limit_cents: number | null
          user_id: string
        }
        Insert: {
          account_id: string
          available_limit_cents?: number | null
          captured_at?: string
          closing_date?: string | null
          due_date?: string | null
          invoice_cents?: number | null
          period: string
          provider_invoice_id?: string | null
          total_limit_cents?: number | null
          transactions?: Json
          used_limit_cents?: number | null
          user_id: string
        }
        Update: {
          account_id?: string
          available_limit_cents?: number | null
          captured_at?: string
          closing_date?: string | null
          due_date?: string | null
          invoice_cents?: number | null
          period?: string
          provider_invoice_id?: string | null
          total_limit_cents?: number | null
          transactions?: Json
          used_limit_cents?: number | null
          user_id?: string
        }
        Relationships: []
      }
      finance_contract_comments: {
        Row: {
          author: string | null
          contract_id: string
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          author?: string | null
          contract_id: string
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          author?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      fiscal_document_items: {
        Row: {
          description: string
          document_id: string
          id: string
          quantity: number
          total_cents: number
          unit_price_cents: number
          user_id: string
        }
        Insert: {
          description: string
          document_id: string
          id?: string
          quantity: number
          total_cents: number
          unit_price_cents: number
          user_id: string
        }
        Update: {
          description?: string
          document_id?: string
          id?: string
          quantity?: number
          total_cents?: number
          unit_price_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "fiscal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_documents: {
        Row: {
          access_key: string | null
          category: string
          created_at: string
          document_number: string | null
          file_sha256: string
          id: string
          issued_on: string
          issuer: string
          original_name: string
          original_path: string
          pdf_path: string
          total_cents: number
          user_id: string
          verified: boolean
        }
        Insert: {
          access_key?: string | null
          category?: string
          created_at?: string
          document_number?: string | null
          file_sha256: string
          id?: string
          issued_on: string
          issuer: string
          original_name: string
          original_path: string
          pdf_path: string
          total_cents: number
          user_id: string
          verified?: boolean
        }
        Update: {
          access_key?: string | null
          category?: string
          created_at?: string
          document_number?: string | null
          file_sha256?: string
          id?: string
          issued_on?: string
          issuer?: string
          original_name?: string
          original_path?: string
          pdf_path?: string
          total_cents?: number
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      installment_contracts: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          details_json: Json
          id: string
          name: string
          source_sheet: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          details_json?: Json
          id: string
          name: string
          source_sheet?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          details_json?: Json
          id?: string
          name?: string
          source_sheet?: string | null
          user_id?: string
        }
        Relationships: []
      }
      installment_entries: {
        Row: {
          contract_id: string
          due_date: string
          expected_cents: number
          id: string
          is_settled: boolean
          note: string | null
          number: number
          paid_cents: number | null
          paid_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contract_id: string
          due_date: string
          expected_cents: number
          id?: string
          is_settled?: boolean
          note?: string | null
          number: number
          paid_cents?: number | null
          paid_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contract_id?: string
          due_date?: string
          expected_cents?: number
          id?: string
          is_settled?: boolean
          note?: string | null
          number?: number
          paid_cents?: number | null
          paid_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_entries_user_id_contract_id_fkey"
            columns: ["user_id", "contract_id"]
            isOneToOne: false
            referencedRelation: "installment_contracts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      invoice_recipients: {
        Row: {
          city: string
          key: string
          name: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          key: string
          name: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          key?: string
          name?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pluggy_credentials: {
        Row: {
          client_id: string
          client_secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pluggy_items: {
        Row: {
          connection_slot: string
          connector_name: string | null
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          connection_slot?: string
          connector_name?: string | null
          created_at?: string
          id?: string
          item_id: string
          user_id?: string
        }
        Update: {
          connection_slot?: string
          connector_name?: string | null
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: []
      }
      pluggy_secondary_credentials: {
        Row: {
          client_id: string
          client_secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      revenue_contracts: {
        Row: {
          address: string
          buyer: string
          city: string
          correction_index: string
          count: number
          cpf: string
          created_at: string
          down_payment_cents: number
          email: string
          fine_percent: number
          first_due: string
          id: string
          interest_percent: number
          note: string
          phone: string
          postal_code: string
          rg: string
          state: string
          status: string
          title: string
          total_cents: number
          user_id: string
        }
        Insert: {
          address?: string
          buyer: string
          city?: string
          correction_index?: string
          count: number
          cpf?: string
          created_at?: string
          down_payment_cents?: number
          email?: string
          fine_percent?: number
          first_due: string
          id?: string
          interest_percent?: number
          note?: string
          phone?: string
          postal_code?: string
          rg?: string
          state?: string
          status?: string
          title: string
          total_cents: number
          user_id: string
        }
        Update: {
          address?: string
          buyer?: string
          city?: string
          correction_index?: string
          count?: number
          cpf?: string
          created_at?: string
          down_payment_cents?: number
          email?: string
          fine_percent?: number
          first_due?: string
          id?: string
          interest_percent?: number
          note?: string
          phone?: string
          postal_code?: string
          rg?: string
          state?: string
          status?: string
          title?: string
          total_cents?: number
          user_id?: string
        }
        Relationships: []
      }
      revenue_entries: {
        Row: {
          adjustment: Json | null
          category: string
          contract_id: string | null
          due_date: string
          expected_cents: number
          id: string
          note: string
          number: number | null
          received_cents: number | null
          received_date: string | null
          source_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          adjustment?: Json | null
          category: string
          contract_id?: string | null
          due_date: string
          expected_cents: number
          id?: string
          note?: string
          number?: number | null
          received_cents?: number | null
          received_date?: string | null
          source_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          adjustment?: Json | null
          category?: string
          contract_id?: string | null
          due_date?: string
          expected_cents?: number
          id?: string
          note?: string
          number?: number | null
          received_cents?: number | null
          received_date?: string | null
          source_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_entries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "revenue_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_entries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "revenue_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_events: {
        Row: {
          after_data: Json
          before_data: Json | null
          created_at: string
          entry_id: string
          id: string
          kind: string
          reason: string
          user_id: string
        }
        Insert: {
          after_data: Json
          before_data?: Json | null
          created_at?: string
          entry_id: string
          id?: string
          kind: string
          reason?: string
          user_id: string
        }
        Update: {
          after_data?: Json
          before_data?: Json | null
          created_at?: string
          entry_id?: string
          id?: string
          kind?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_events_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "revenue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_files: {
        Row: {
          contract_id: string | null
          entry_id: string | null
          id: string
          name: string
          path: string
          user_id: string
        }
        Insert: {
          contract_id?: string | null
          entry_id?: string | null
          id?: string
          name: string
          path: string
          user_id: string
        }
        Update: {
          contract_id?: string | null
          entry_id?: string | null
          id?: string
          name?: string
          path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_files_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "revenue_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_files_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "revenue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_sources: {
        Row: {
          category: string
          created_at: string
          details: Json
          expected_cents: number
          first_due: string
          id: string
          recurring: boolean
          title: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json
          expected_cents: number
          first_due: string
          id?: string
          recurring?: boolean
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json
          expected_cents?: number
          first_due?: string
          id?: string
          recurring?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      travel_loyalty_programs: {
        Row: {
          balance: number
          created_at: string
          expiration_date: string | null
          id: string
          notes: string
          program_name: string
          program_type: string
          updated_at: string
          user_id: string
          value_per_point: number
        }
        Insert: {
          balance?: number
          created_at?: string
          expiration_date?: string | null
          id?: string
          notes?: string
          program_name: string
          program_type: string
          updated_at?: string
          user_id: string
          value_per_point?: number
        }
        Update: {
          balance?: number
          created_at?: string
          expiration_date?: string | null
          id?: string
          notes?: string
          program_name?: string
          program_type?: string
          updated_at?: string
          user_id?: string
          value_per_point?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_closed_card_invoice: {
        Args: {
          p_account_id: string
          p_amount_cents: number
          p_closed_at: string
          p_due_date: string
          p_origin: string
          p_period: string
          p_provider_reference?: string
        }
        Returns: string
      }
      audit_append: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_details: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
      axion_accept_transfer: { Args: never; Returns: undefined }
      axion_cancel_transfer: { Args: never; Returns: undefined }
      axion_gemini_configured: { Args: never; Returns: boolean }
      axion_is_owner: { Args: never; Returns: boolean }
      axion_provider_status: {
        Args: never
        Returns: {
          max_request_cents: number
          model: string
          web: boolean
        }[]
      }
      axion_read_gemini: { Args: { p_owner: string }; Returns: string }
      axion_read_provider: {
        Args: { p_owner: string }
        Returns: {
          api_key: string
          max_request_cents: number
          model: string
          web: boolean
        }[]
      }
      axion_request_transfer: { Args: { p_email: string }; Returns: undefined }
      axion_reserve: { Args: { p_cents: number }; Returns: number }
      axion_save_gemini: {
        Args: { p_key: string; p_owner: string }
        Returns: undefined
      }
      axion_save_provider: {
        Args: {
          p_cents: number
          p_key: string
          p_model: string
          p_owner: string
          p_web: boolean
        }
        Returns: undefined
      }
      axion_transfer_pending: { Args: never; Returns: boolean }
      confirm_expense_bulk_settlement: {
        Args: { p_expected_count: number; p_include_partial: boolean }
        Returns: Json
      }
      pay_bill: {
        Args: {
          p_bill_id: string
          p_note: string
          p_paid_cents: number
          p_paid_date: string
        }
        Returns: undefined
      }
      pay_installment: {
        Args: {
          p_contract_id: string
          p_note: string
          p_number: number
          p_paid_cents: number
          p_paid_date: string
        }
        Returns: undefined
      }
      preview_expense_bulk_settlement: { Args: never; Returns: Json }
      record_expense_payment: {
        Args: {
          p_bill_id: string
          p_contract_id: string
          p_is_settled: boolean
          p_note: string
          p_number: number
          p_paid_cents: number
          p_paid_date: string
          p_revision: boolean
        }
        Returns: undefined
      }
      revenue_adjust: {
        Args: { p_adjustment: Json; p_id: string }
        Returns: undefined
      }
      revenue_create_contract: { Args: { p_data: Json }; Returns: string }
      revenue_edit_installment: {
        Args: { p_cents: number; p_due: string; p_id: string; p_note: string }
        Returns: undefined
      }
      revenue_edit_source: {
        Args: { p_data: Json; p_id: string }
        Returns: undefined
      }
      revenue_receive: {
        Args: {
          p_cents: number
          p_date: string
          p_id: string
          p_note: string
          p_reason?: string
        }
        Returns: undefined
      }
      revenue_sync: { Args: { p_month: string }; Returns: undefined }
      revise_bill: {
        Args: {
          p_bill_id: string
          p_note: string
          p_paid_cents: number
          p_paid_date: string
        }
        Returns: undefined
      }
      revise_installment: {
        Args: {
          p_contract_id: string
          p_note: string
          p_number: number
          p_paid_cents: number
          p_paid_date: string
        }
        Returns: undefined
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
