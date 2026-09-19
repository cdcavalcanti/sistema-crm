# Integração SDR (IA) ↔ Sistema CRM

Módulo **opcional** de IA SDR no WhatsApp. O CRM é a operação humana + inbox.

**Não confundir:** `/assistente` = GPT interno (`gpt-chat`). SDR = qualificação no `/chat` (card “SDR (WhatsApp)”).

## Regra de ouro

**Só leads do SDR** (`dados_conversa`) entram no pipeline do CRM por este módulo.
Mensagens diretas no chat WAHA não viram oportunidade sozinhas.

## Fluxo

Quando um lead entra/atualiza no SDR:

1. **Contato** — upsert por telefone.
2. **Oportunidade** — origem `whatsapp`.
3. Etapa conforme status da IA:

| Etapa SDR | Etapa CRM |
| --- | --- |
| `novo` / `qualificando` / `qualificado` | **Qualificação** |
| `transferido` | **Atendimento humano** |
| `descartado` | **Perdido** |

Idempotência: `oportunidades.metadados.sdr_conversation_id`.

## Status

| Item | Estado |
| --- | --- |
| Sync contato+opp desde o 1º atendimento | Edge `sdr-handoff` + Realtime watcher |
| Card SDR / pause / auto-pause | Pronto |
| WAHA / Chatwoot / SDR em produção | Configurar por cliente |

## Contrato HTTP (SDR → CRM)

```
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/sdr-handoff?secret=SDR_HANDOFF_SECRET
Content-Type: application/json

{ "conversation_id": "uuid-da-conversa" }
```

Também aceita `{ "telefone": "5511999990000" }` e Bearer de usuário autenticado do CRM.

Pause/retomada da IA (macros Chatwoot):

```
POST …/functions/v1/sdr-pausar?acao=pausar&secret=SDR_PAUSAR_SECRET
POST …/functions/v1/sdr-pausar?acao=retomar&secret=SDR_PAUSAR_SECRET
```

Secrets: `SDR_HANDOFF_SECRET`, `SDR_PAUSAR_SECRET` (opcional; cai no handoff secret).
