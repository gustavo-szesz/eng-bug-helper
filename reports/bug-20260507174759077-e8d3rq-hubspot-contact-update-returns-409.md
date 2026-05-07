# HubSpot contact update returns 409

- Snapshot: bug-20260507174759077-e8d3rq
- Kind: bug
- Severity: high

PATCH /crm/v3/objects/contacts/1001 retornou HTTP 409.

## Resumo

Fonte: support-ticket-8841
Entrada: HubSpot contact update returns 409
Requisição: PATCH /crm/v3/objects/contacts/1001
Resposta: HTTP 409

## Request

URL: https://api.hubapi.com/crm/v3/objects/contacts/1001
Headers: {
  "Authorization": "***REDACTED***",
  "Content-Type": "application/json"
}
Body: {
  "properties": {
    "email": "***REDACTED***",
    "firstname": "Ana"
  }
}

## Response

Status: 409
Headers: {
  "Content-Type": "application/json"
}
Body: {
  "status": "error",
  "message": "Property values were not valid"
}

## Sinais de suporte

Logs capturados: 1
Webhooks capturados: 1
Query params: 0

## Reprodução

1. npm run replay:serve -- --snapshot snapshots/bug-20260507174759077-e8d3rq.json
2. npm run replay:run -- --snapshot snapshots/bug-20260507174759077-e8d3rq.json --base-url http://localhost:4010
3. Compare o retorno do sandbox com a falha original.

## Slack draft

```text
[HIGH] HubSpot contact update returns 409
PATCH /crm/v3/objects/contacts/1001 retornou HTTP 409.
Snapshot: bug-20260507174759077-e8d3rq
Tipo: bug
```

