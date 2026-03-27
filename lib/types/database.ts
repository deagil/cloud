/**
 * Auto-generated Supabase database types.
 * Regenerate with: supabase gen types typescript --local > lib/types/database.ts
 *
 * Until migrations are applied, this file contains the expected shape.
 * Run `supabase db push` then `supabase gen types typescript --local` to refresh.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          name: string | null
          email: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          username?: string | null
          name?: string | null
          email?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          name?: string | null
          email?: string | null
          avatar_url?: string | null
          created_at?: string
        }
      }
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          owner_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          owner_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          owner_id?: string
          created_at?: string
        }
      }
      workspace_members: {
        Row: {
          workspace_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          joined_at: string
        }
        Insert: {
          workspace_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          joined_at?: string
        }
        Update: {
          workspace_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          joined_at?: string
        }
      }
      workspace_integrations: {
        Row: {
          workspace_id: string
          github_app_installation_id: string | null
          vercel_team_id: string | null
          slack_team_id: string | null
          slack_bot_token: string | null
          slack_signing_secret: string | null
          updated_at: string
        }
        Insert: {
          workspace_id: string
          github_app_installation_id?: string | null
          vercel_team_id?: string | null
          slack_team_id?: string | null
          slack_bot_token?: string | null
          slack_signing_secret?: string | null
          updated_at?: string
        }
        Update: {
          workspace_id?: string
          github_app_installation_id?: string | null
          vercel_team_id?: string | null
          slack_team_id?: string | null
          slack_bot_token?: string | null
          slack_signing_secret?: string | null
          updated_at?: string
        }
      }
      workspace_credentials: {
        Row: {
          id: string
          workspace_id: string
          provider: string
          encrypted_secret: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider: string
          encrypted_secret: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider?: string
          encrypted_secret?: string
        }
      }
      user_credentials: {
        Row: {
          id: string
          user_id: string
          provider: string
          encrypted_secret: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          encrypted_secret: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          encrypted_secret?: string
        }
      }
      projects: {
        Row: {
          id: string
          workspace_id: string
          name: string
          slug: string
          github_repo_url: string | null
          github_owner: string | null
          github_repo: string | null
          vercel_project_id: string | null
          base_branch: string
          sandbox_snapshot_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          slug: string
          github_repo_url?: string | null
          github_owner?: string | null
          github_repo?: string | null
          vercel_project_id?: string | null
          base_branch?: string
          sandbox_snapshot_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          slug?: string
          github_repo_url?: string | null
          github_owner?: string | null
          github_repo?: string | null
          vercel_project_id?: string | null
          base_branch?: string
          sandbox_snapshot_id?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
      threads: {
        Row: {
          id: string
          project_id: string | null
          workspace_id: string
          title: string | null
          source: 'slack' | 'web'
          slack_channel_id: string | null
          slack_thread_ts: string | null
          slack_team_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id?: string | null
          workspace_id: string
          title?: string | null
          source: 'slack' | 'web'
          slack_channel_id?: string | null
          slack_thread_ts?: string | null
          slack_team_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string | null
          workspace_id?: string
          title?: string | null
          source?: 'slack' | 'web'
          slack_channel_id?: string | null
          slack_thread_ts?: string | null
          slack_team_id?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
      thread_messages: {
        Row: {
          id: string
          thread_id: string
          author_user_id: string | null
          role: 'user' | 'agent' | 'system'
          content: string
          run_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          author_user_id?: string | null
          role: 'user' | 'agent' | 'system'
          content: string
          run_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          author_user_id?: string | null
          role?: 'user' | 'agent' | 'system'
          content?: string
          run_id?: string | null
          created_at?: string
        }
      }
      runs: {
        Row: {
          id: string
          thread_id: string | null
          project_id: string | null
          workspace_id: string
          created_by: string | null
          prompt: string
          title: string | null
          status: 'pending' | 'processing' | 'completed' | 'error' | 'stopped'
          intent: 'build' | 'debug' | 'plan' | 'ask' | null
          selected_agent: string
          selected_model: string | null
          sandbox_id: string | null
          sandbox_url: string | null
          agent_session_id: string | null
          branch_name: string | null
          pr_url: string | null
          pr_number: number | null
          pr_status: 'open' | 'closed' | 'merged' | null
          pr_merge_commit_sha: string | null
          progress: number
          error: string | null
          repo_url: string | null
          max_duration: number
          keep_alive: boolean
          install_dependencies: boolean
          enable_browser: boolean
          mcp_server_ids: Json | null
          logs: Json | null
          preview_url: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          thread_id?: string | null
          project_id?: string | null
          workspace_id: string
          created_by?: string | null
          prompt: string
          title?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'error' | 'stopped'
          intent?: 'build' | 'debug' | 'plan' | 'ask' | null
          selected_agent?: string
          selected_model?: string | null
          sandbox_id?: string | null
          sandbox_url?: string | null
          agent_session_id?: string | null
          branch_name?: string | null
          pr_url?: string | null
          pr_number?: number | null
          pr_status?: 'open' | 'closed' | 'merged' | null
          pr_merge_commit_sha?: string | null
          progress?: number
          error?: string | null
          preview_url?: string | null
          repo_url?: string | null
          max_duration?: number
          keep_alive?: boolean
          install_dependencies?: boolean
          enable_browser?: boolean
          mcp_server_ids?: Json | null
          logs?: Json | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          thread_id?: string | null
          project_id?: string | null
          workspace_id?: string
          created_by?: string | null
          prompt?: string
          title?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'error' | 'stopped'
          intent?: 'build' | 'debug' | 'plan' | 'ask' | null
          selected_agent?: string
          selected_model?: string | null
          sandbox_id?: string | null
          sandbox_url?: string | null
          agent_session_id?: string | null
          branch_name?: string | null
          pr_url?: string | null
          pr_number?: number | null
          pr_status?: 'open' | 'closed' | 'merged' | null
          pr_merge_commit_sha?: string | null
          progress?: number
          error?: string | null
          repo_url?: string | null
          max_duration?: number
          keep_alive?: boolean
          install_dependencies?: boolean
          enable_browser?: boolean
          mcp_server_ids?: Json | null
          logs?: Json | null
          preview_url?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          deleted_at?: string | null
        }
      }
      run_events: {
        Row: {
          id: string
          run_id: string
          type: string
          payload: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          type: string
          payload?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          type?: string
          payload?: Json | null
          created_at?: string
        }
      }
      run_messages: {
        Row: {
          id: string
          run_id: string
          role: 'user' | 'agent'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          role: 'user' | 'agent'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          role?: 'user' | 'agent'
          content?: string
          created_at?: string
        }
      }
      review_runs: {
        Row: {
          id: string
          run_id: string
          branch: string | null
          preview_url: string | null
          summary: string | null
          screenshot_urls: Json
          check_results: Json | null
          review_status: 'pending' | 'approved' | 'rejected'
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          branch?: string | null
          preview_url?: string | null
          summary?: string | null
          screenshot_urls?: Json
          check_results?: Json | null
          review_status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          branch?: string | null
          preview_url?: string | null
          summary?: string | null
          screenshot_urls?: Json
          check_results?: Json | null
          review_status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
      }
      github_app_installations: {
        Row: {
          id: string
          workspace_id: string
          installation_id: string
          account_login: string | null
          account_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          installation_id: string
          account_login?: string | null
          account_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          installation_id?: string
          account_login?: string | null
          account_type?: string | null
          created_at?: string
        }
      }
      slack_workspace_mappings: {
        Row: {
          slack_team_id: string
          workspace_id: string
        }
        Insert: {
          slack_team_id: string
          workspace_id: string
        }
        Update: {
          slack_team_id?: string
          workspace_id?: string
        }
      }
      connectors: {
        Row: {
          id: string
          workspace_id: string
          created_by: string | null
          name: string
          type: 'local' | 'remote'
          base_url: string | null
          command: string | null
          env: string | null
          status: 'connected' | 'disconnected'
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          created_by?: string | null
          name: string
          type: 'local' | 'remote'
          base_url?: string | null
          command?: string | null
          env?: string | null
          status?: 'connected' | 'disconnected'
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          created_by?: string | null
          name?: string
          type?: 'local' | 'remote'
          base_url?: string | null
          command?: string | null
          env?: string | null
          status?: 'connected' | 'disconnected'
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
