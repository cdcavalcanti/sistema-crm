-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "app_role" AS ENUM ('super_admin', 'admin', 'usuario');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nome" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nome" TEXT,
    "email" TEXT,
    "responsavel_crm" TEXT,
    "lgpd_aceite_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_acesso" TIMESTAMPTZ(6),

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "app_role" NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funis" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "tipo" TEXT NOT NULL DEFAULT 'vendas',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cor" TEXT,
    "tipo" TEXT DEFAULT 'andamento',
    "funil_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "tamanho" TEXT,
    "faturamento_mensal" DOUBLE PRECISION,
    "atividade_principal" TEXT,
    "atividade_secundaria" TEXT,
    "site" TEXT,
    "instagram" TEXT,
    "linkedin" TEXT,
    "situacao_cadastral" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contatos" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "nome_estabelecimento" TEXT,
    "empresa_id" UUID,
    "cargo" TEXT,
    "anos_operacao" INTEGER,
    "segmento" TEXT,
    "observacoes" TEXT,
    "observacoes_internas" TEXT,
    "metadados" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" UUID NOT NULL,
    "contato_id" UUID NOT NULL,
    "empresa_id" UUID,
    "funil_id" UUID,
    "titulo" TEXT,
    "interesse" TEXT,
    "nome_estabelecimento" TEXT,
    "anos_operacao" INTEGER,
    "descricao" TEXT,
    "origem" TEXT NOT NULL,
    "etapa_id" UUID,
    "cargo_contato" TEXT,
    "dor_cliente" TEXT,
    "impacto_negocio" TEXT,
    "valor" DOUBLE PRECISION,
    "data_visita" TIMESTAMPTZ(6),
    "data_fechamento" TIMESTAMPTZ(6),
    "motivo_perda" TEXT,
    "google_event_id" TEXT,
    "observacoes" TEXT,
    "responsavel" TEXT,
    "metadados" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidade_comentarios" (
    "id" UUID NOT NULL,
    "oportunidade_id" UUID NOT NULL,
    "user_id" UUID,
    "autor_email" TEXT,
    "autor_nome" TEXT,
    "conteudo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contato_id" UUID,

    CONSTRAINT "oportunidade_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "prioridade" TEXT NOT NULL DEFAULT 'media',
    "due_date" TIMESTAMPTZ(6),
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "atribuido_para" TEXT,
    "criado_por" UUID,
    "concluida_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendario_eventos" (
    "id" UUID NOT NULL,
    "google_event_id" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "fim" TIMESTAMPTZ(6) NOT NULL,
    "local" TEXT,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "criado_por" UUID,
    "sincronizado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendario_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_credentials" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "calendar_id" TEXT NOT NULL DEFAULT 'primary',
    "refresh_token" TEXT NOT NULL,
    "access_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "conectado_por" UUID,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "actor_email" TEXT,
    "actor_nome" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidade_id" TEXT,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas" (
    "id" UUID NOT NULL,
    "wa_chat_id" TEXT,
    "telefone" TEXT,
    "nome_whatsapp" TEXT,
    "foto_url" TEXT,
    "contato_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "ultimo_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_msg" TEXT,
    "nao_lidas" INTEGER NOT NULL DEFAULT 0,
    "eh_grupo" BOOLEAN NOT NULL DEFAULT false,
    "fixada" BOOLEAN NOT NULL DEFAULT false,
    "nao_lida_manual" BOOLEAN NOT NULL DEFAULT false,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "chatwoot_conversation_id" INTEGER,
    "chatwoot_inbox_id" INTEGER,
    "chatwoot_contact_id" INTEGER,
    "instagram_username" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" UUID NOT NULL,
    "conversa_id" UUID NOT NULL,
    "wa_message_id" TEXT,
    "direcao" TEXT NOT NULL,
    "corpo" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'text',
    "media_url" TEXT,
    "media_mime" TEXT,
    "media_nome" TEXT,
    "status" TEXT,
    "autor_id" UUID,
    "autor_email" TEXT,
    "chatwoot_message_id" INTEGER,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas_log" (
    "id" UUID NOT NULL,
    "canal" TEXT NOT NULL,
    "origem" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "erro" TEXT,
    "ip" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contato_etiquetas" (
    "id" UUID NOT NULL,
    "contato_id" UUID NOT NULL,
    "etiqueta_id" UUID NOT NULL,

    CONSTRAINT "contato_etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores_ads" (
    "id" UUID NOT NULL,
    "plataforma" TEXT NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fim" DATE NOT NULL,
    "conta_id" TEXT,
    "conta_nome" TEXT,
    "campanha_id" TEXT,
    "campanha_nome" TEXT,
    "investimento" DOUBLE PRECISION,
    "impressoes" BIGINT,
    "alcance" BIGINT,
    "cliques" BIGINT,
    "ctr" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "cpl" DOUBLE PRECISION,
    "cpm" DOUBLE PRECISION,
    "conversoes" DOUBLE PRECISION,
    "leads_plataforma" DOUBLE PRECISION,
    "receita_ads" DOUBLE PRECISION,
    "roas" DOUBLE PRECISION,
    "fonte" TEXT NOT NULL DEFAULT 'plataforma',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "coletado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicadores_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_tenant_config" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "persona" TEXT NOT NULL DEFAULT '',
    "o_que_pode_prometer" TEXT NOT NULL DEFAULT '',
    "regra_atribuicao" TEXT NOT NULL DEFAULT 'fixo',
    "responsavel_padrao" TEXT NOT NULL DEFAULT 'Comercial',
    "prazo_sem_resposta_horas" INTEGER NOT NULL DEFAULT 24,
    "dias_sem_atividade" INTEGER NOT NULL DEFAULT 7,
    "campanha_fria_aprovada" BOOLEAN NOT NULL DEFAULT false,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" UUID,

    CONSTRAINT "ia_tenant_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_consultas" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "modo" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "modelo" TEXT,
    "pergunta" TEXT,
    "resposta" TEXT,
    "citacoes" JSONB NOT NULL DEFAULT '[]',
    "oportunidade_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_consultas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_propostas" (
    "id" UUID NOT NULL,
    "oportunidade_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "perigo" TEXT NOT NULL DEFAULT 'normal',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "afetados" JSONB NOT NULL DEFAULT '[]',
    "confirmacao_explicita" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvido_em" TIMESTAMPTZ(6),

    CONSTRAINT "ia_propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dados_conversa" (
    "id" SERIAL NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "conversation_id" TEXT NOT NULL,
    "etapa" TEXT NOT NULL DEFAULT '',
    "qualificacao" JSONB NOT NULL DEFAULT '{}',
    "origem" TEXT,
    "chatwoot_conversation_id" TEXT,
    "chatwoot_contact_id" TEXT,
    "ativada_em" TIMESTAMPTZ(6),
    "qtd_interacao" INTEGER NOT NULL DEFAULT 0,
    "inicio_int" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_int" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dados_conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_mensagens" (
    "id" SERIAL NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pausar_ia" (
    "id" SERIAL NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pausar_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "valor" DOUBLE PRECISION,
    "validade" DATE,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propostas" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "valor" DOUBLE PRECISION,
    "validade" DATE,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'em_execucao',
    "valor" DOUBLE PRECISION,
    "orcamento_id" UUID,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligacoes" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'registrada',
    "direcao" TEXT NOT NULL DEFAULT 'saida',
    "duracao_seg" INTEGER,
    "resultado" TEXT,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ligacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nps_respostas" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enviado',
    "score" INTEGER,
    "canal" TEXT,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_respostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnosticos" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "indice" DOUBLE PRECISION,
    "eixo" TEXT,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnosticos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reuniao_notas" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'registrada',
    "data_reuniao" DATE,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reuniao_notas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospeccao" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "origem" TEXT,
    "proximo_passo" TEXT,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospeccao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campanhas" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "assunto" TEXT,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planejamento" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planejado',
    "semana_inicio" DATE,
    "meta" TEXT,
    "contato_id" UUID,
    "oportunidade_id" UUID,
    "responsavel" TEXT,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planejamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campos_personalizados" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "entidade" TEXT NOT NULL DEFAULT 'contato',
    "chave" TEXT NOT NULL,
    "tipo_campo" TEXT NOT NULL DEFAULT 'texto',
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campos_personalizados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automacao_regras" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "evento" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automacao_regras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "melhorias" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "prioridade" TEXT,
    "criado_por" UUID,
    "notas" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "melhorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remarketing_campanha" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT 'campanha',
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "config" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remarketing_campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remarketing_acoes" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "contato_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remarketing_acoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgpd_config" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "texto" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lgpd_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgpd_solicitacoes" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "solicitante" TEXT,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lgpd_solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgpd_consentimentos" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "aceito" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lgpd_consentimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gpt_conversas" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT 'Nova conversa',
    "user_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gpt_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gpt_mensagens" (
    "id" UUID NOT NULL,
    "conversa_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gpt_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telefones_matriculados" (
    "id" UUID NOT NULL,
    "sufixo8" TEXT NOT NULL,

    CONSTRAINT "telefones_matriculados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails_matriculados" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "emails_matriculados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "funis_slug_key" ON "funis"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "contatos_email_key" ON "contatos"("email");

-- CreateIndex
CREATE INDEX "contatos_email_idx" ON "contatos"("email");

-- CreateIndex
CREATE INDEX "oportunidades_etapa_id_idx" ON "oportunidades"("etapa_id");

-- CreateIndex
CREATE INDEX "oportunidades_contato_id_idx" ON "oportunidades"("contato_id");

-- CreateIndex
CREATE INDEX "oportunidades_criado_em_idx" ON "oportunidades"("criado_em" DESC);

-- CreateIndex
CREATE INDEX "oportunidades_origem_idx" ON "oportunidades"("origem");

-- CreateIndex
CREATE INDEX "oportunidade_comentarios_oportunidade_id_idx" ON "oportunidade_comentarios"("oportunidade_id");

-- CreateIndex
CREATE INDEX "tarefas_status_idx" ON "tarefas"("status");

-- CreateIndex
CREATE INDEX "tarefas_due_date_idx" ON "tarefas"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "calendario_eventos_google_event_id_key" ON "calendario_eventos"("google_event_id");

-- CreateIndex
CREATE INDEX "calendario_eventos_inicio_idx" ON "calendario_eventos"("inicio");

-- CreateIndex
CREATE INDEX "audit_logs_criado_em_idx" ON "audit_logs"("criado_em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "contato_etiquetas_contato_id_etiqueta_id_key" ON "contato_etiquetas"("contato_id", "etiqueta_id");

-- CreateIndex
CREATE INDEX "indicadores_ads_plataforma_coletado_em_idx" ON "indicadores_ads"("plataforma", "coletado_em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "campos_personalizados_entidade_chave_key" ON "campos_personalizados"("entidade", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "telefones_matriculados_sufixo8_key" ON "telefones_matriculados"("sufixo8");

-- CreateIndex
CREATE UNIQUE INDEX "emails_matriculados_email_key" ON "emails_matriculados"("email");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_funil_id_fkey" FOREIGN KEY ("funil_id") REFERENCES "funis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_funil_id_fkey" FOREIGN KEY ("funil_id") REFERENCES "funis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_comentarios" ADD CONSTRAINT "oportunidade_comentarios_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_comentarios" ADD CONSTRAINT "oportunidade_comentarios_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendario_eventos" ADD CONSTRAINT "calendario_eventos_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendario_eventos" ADD CONSTRAINT "calendario_eventos_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contato_etiquetas" ADD CONSTRAINT "contato_etiquetas_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contato_etiquetas" ADD CONSTRAINT "contato_etiquetas_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gpt_mensagens" ADD CONSTRAINT "gpt_mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "gpt_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

