// Tipos genéricos do schema do banco. Para gerar tipos exatos:
//   supabase gen types typescript --project-id YOUR_PROJECT_REF > src/integrations/supabase/types.ts
// Enquanto isso, mantemos um tipo permissivo que não bloqueia o build.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "super_admin" | "admin" | "usuario";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          nome: string | null;
          email: string | null;
          responsavel_crm: string | null;
          criado_em: string;
          ultimo_acesso: string | null;
        };
        Insert: {
          user_id: string;
          nome?: string | null;
          email?: string | null;
          responsavel_crm?: string | null;
          ultimo_acesso?: string | null;
        };
        Update: {
          nome?: string | null;
          email?: string | null;
          responsavel_crm?: string | null;
          ultimo_acesso?: string | null;
        };
      };
      user_roles: {
        Row: { id: string; user_id: string; role: AppRole; criado_em: string };
        Insert: { user_id: string; role: AppRole };
        Update: { role?: AppRole };
      };
      etapas: {
        Row: { id: string; nome: string; ordem: number; cor: string | null; tipo: string | null; criado_em: string };
        Insert: { nome: string; ordem: number; cor?: string | null; tipo?: string | null };
        Update: { nome?: string; ordem?: number; cor?: string | null; tipo?: string | null };
      };
      contatos: {
        Row: {
          id: string;
          nome: string;
          email: string | null;
          telefone: string | null;
          nome_estabelecimento: string | null;
          anos_operacao: number | null;
          segmento: string | null;
          observacoes: string | null;
          observacoes_internas: string | null;
          metadados: Json;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["contatos"]["Row"]> & { nome: string };
        Update: Partial<Database["public"]["Tables"]["contatos"]["Row"]>;
      };
      oportunidades: {
        Row: {
          id: string;
          contato_id: string;
          titulo: string | null;
          interesse: string | null;
          nome_estabelecimento: string | null;
          anos_operacao: number | null;
          descricao: string | null;
          origem: string;
          etapa_id: string | null;
          valor: number | null;
          data_visita: string | null;
          data_fechamento: string | null;
          motivo_perda: string | null;
          google_event_id: string | null;
          observacoes: string | null;
          responsavel: string | null;
          metadados: Json;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["oportunidades"]["Row"]> & {
          contato_id: string;
          origem: string;
        };
        Update: Partial<Database["public"]["Tables"]["oportunidades"]["Row"]>;
      };
      oportunidade_comentarios: {
        Row: {
          id: string;
          oportunidade_id: string;
          user_id: string | null;
          autor_email: string | null;
          autor_nome: string | null;
          conteudo: string;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: { oportunidade_id: string; conteudo: string; user_id?: string | null; autor_email?: string | null; autor_nome?: string | null };
        Update: { conteudo?: string };
      };
      tarefas: {
        Row: {
          id: string;
          titulo: string;
          descricao: string | null;
          status: string;
          prioridade: string;
          due_date: string | null;
          contato_id: string | null;
          oportunidade_id: string | null;
          atribuido_para: string | null;
          criado_por: string | null;
          concluida_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tarefas"]["Row"]> & { titulo: string };
        Update: Partial<Database["public"]["Tables"]["tarefas"]["Row"]>;
      };
      calendario_eventos: {
        Row: {
          id: string;
          google_event_id: string | null;
          titulo: string;
          descricao: string | null;
          inicio: string;
          fim: string;
          local: string | null;
          contato_id: string | null;
          oportunidade_id: string | null;
          criado_por: string | null;
          sincronizado_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["calendario_eventos"]["Row"]> & { titulo: string; inicio: string; fim: string };
        Update: Partial<Database["public"]["Tables"]["calendario_eventos"]["Row"]>;
      };
      google_credentials: {
        Row: {
          id: number;
          calendar_id: string;
          refresh_token: string;
          access_token: string | null;
          access_token_expires_at: string | null;
          conectado_por: string | null;
          atualizado_em: string;
        };
        Insert: { calendar_id?: string; refresh_token: string; conectado_por?: string | null };
        Update: Partial<Database["public"]["Tables"]["google_credentials"]["Row"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          actor_email: string | null;
          actor_nome: string | null;
          acao: string;
          entidade: string | null;
          entidade_id: string | null;
          detalhes: Json;
          ip: string | null;
          criado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]> & { acao: string };
        Update: never;
      };
      conversas: {
        Row: {
          id: string;
          wa_chat_id: string | null;
          telefone: string | null;
          nome_whatsapp: string | null;
          foto_url: string | null;
          contato_id: string | null;
          status: string;
          ultimo_em: string;
          ultima_msg: string | null;
          nao_lidas: number;
          eh_grupo: boolean;
          fixada: boolean;
          nao_lida_manual: boolean;
          canal: string;
          chatwoot_conversation_id: number | null;
          chatwoot_inbox_id: number | null;
          chatwoot_contact_id: number | null;
          instagram_username: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["conversas"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["conversas"]["Row"]>;
      };
      entradas_log: {
        Row: {
          id: string;
          canal: string;
          origem: string | null;
          payload: Json;
          contato_id: string | null;
          oportunidade_id: string | null;
          erro: string | null;
          ip: string | null;
          criado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["entradas_log"]["Row"]> & { canal: string };
        Update: Partial<Database["public"]["Tables"]["entradas_log"]["Row"]>;
      };
      mensagens: {
        Row: {
          id: string;
          conversa_id: string;
          wa_message_id: string | null;
          direcao: string;
          corpo: string | null;
          tipo: string;
          media_url: string | null;
          media_mime: string | null;
          media_nome: string | null;
          status: string | null;
          autor_id: string | null;
          autor_email: string | null;
          chatwoot_message_id: number | null;
          criado_em: string;
        };
        Insert: Partial<Database["public"]["Tables"]["mensagens"]["Row"]> & {
          conversa_id: string;
          direcao: string;
        };
        Update: Partial<Database["public"]["Tables"]["mensagens"]["Row"]>;
      };
      // --- IA SDR (projeto compartilhado) ---
      dados_conversa: {
        Row: {
          id: number;
          telefone: string;
          nome: string | null;
          conversation_id: string;
          etapa: string;
          qualificacao: Json;
          origem: string | null;
          chatwoot_conversation_id: string | null;
          chatwoot_contact_id: string | null;
          ativada_em: string | null;
          qtd_interacao: number;
          inicio_int: string;
          ultima_int: string | null;
          updated_at: string;
          created_at?: string;
        };
        Insert: Partial<Database["public"]["Tables"]["dados_conversa"]["Row"]> & {
          telefone: string;
        };
        Update: Partial<Database["public"]["Tables"]["dados_conversa"]["Row"]>;
      };
      historico_mensagens: {
        Row: {
          id: number;
          conversation_id: string;
          telefone: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          telefone: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["historico_mensagens"]["Row"]>;
      };
      pausar_ia: {
        Row: {
          id: number;
          telefone: string;
          nome: string | null;
          created_at: string;
        };
        Insert: { telefone: string; nome?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["pausar_ia"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_role: { Args: { _user_id: string; _role: AppRole }; Returns: boolean };
      is_admin_or_super: { Args: { _user_id: string }; Returns: boolean };
      meu_responsavel_crm: { Args: Record<string, never>; Returns: string };
      pode_ver_carteira: { Args: { _responsavel: string }; Returns: boolean };
      registrar_acesso: { Args: Record<string, never>; Returns: undefined };
    };
      registrar_acesso: { Args: Record<string, never>; Returns: undefined };
      reportar_problema_melhoria: { Args: { _melhoria_id: string }; Returns: undefined };
    };
    Enums: { app_role: AppRole };
  };
};
