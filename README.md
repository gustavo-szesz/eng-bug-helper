# Incident Capture & Reporting System

A comprehensive system for capturing, analyzing, and reporting application incidents with automated error detection, GraphQL monitoring, and structured incident reporting.

## Features

- **Automatic Error Detection**: Captures JavaScript errors, unhandled rejections, and network failures
- **GraphQL Monitoring**: Tracks GraphQL operations and detects failed requests
- **Browser Context**: Records browser state, connectivity, timezone, and user agent
- **Data Sanitization**: Automatically masks sensitive data (tokens, emails, IDs)
- **Report Generation**: Creates structured incident reports with context
- **Slack Integration**: Generates formatted incident summaries ready for copy/paste
- **Cross-Platform**: Works on Linux, macOS, and Windows

## Quick Start

### Installation

```bash
npm install
```

### Browser Extension Setup

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder

### Create an Incident Report

1. Reproduce the error in the application
2. Click the extension icon
3. Click "Create Snapshot"
4. Click "Open Report Generator"
5. Fill in incident details
6. Click "Generate Report"
7. Copy to clipboard and share

## CLI Commands

### Snapshot Creation
```bash
npm run snapshot -- --input incident.json --output snapshots/my-bug.json
```
Converts raw incident data into a sanitized snapshot with browser context.

### Report Generation
```bash
npm run report -- --input snapshots/bug-*.json
```
Generates markdown and JSON reports from snapshots with analysis.

### Slack Thread Generation
```bash
npm run thread -- \
  --input reports/bug-*.json \
  --org-id "63c022ce..." \
  --client-name "Acme Corp" \
  --mentions "@alice,@bob" \
  --description "Payment processing failed for high-volume customers"
```
Creates formatted incident report ready for Slack.

- `snapshot:create -i <input> [-o <output>]`
  - Lê um JSON de incidente e gera snapshot com mascaramento automático de dados sensíveis.
- `replay:serve -s <snapshot> [-p <port>]`
  - Inicia servidor local que retorna o mesmo status/body do incidente gravado.
- `replay:run -s <snapshot> [-b <baseUrl>] [-t <timeoutMs>]`
  - Executa chamada de replay e imprime `match: true/false` comparando status e body.
- `report:create -i <input> [-o <output>]`
  - Lê um snapshot ou um snapshot do browser e gera um markdown com resumo, evidências e mensagem pronta para Slack.
- `thread:create -i <input> [--org-id <id>] [--client-name <name>] [--mentions <list>] [--useful-links <list>] [--description <text>]`
  - Gera uma thread humanizada pronta para copiar/colar no Slack com OrgId, mentions, links úteis e erros GraphQL capturados.

## Dados sensíveis mascarados

Por chave e conteúdo, a ferramenta mascara automaticamente dados como:

- authorization, token, secret, password, apiKey
- email, phone, cpf, cnpj

## Extensão de navegador (beta)

Foi adicionada uma extensão em `extension/` para captura remota com mínima ação do cliente.

### Como instalar no Chrome

1. Acesse `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `extension`

### Fluxo simples para produção

1. Configure no popup o endpoint (ex: `POST /internal/auto-snapshot`)
2. Deixe **Enviar automaticamente** ativado
3. A extensão passa a capturar:
   - URL, title, userAgent, viewport
   - `window.onerror` e `unhandledrejection`
   - erros de `fetch` e `XMLHttpRequest` (status >= 400)
   - **Novo**: operações GraphQL com erro (operationName, query, variables, response preview)
4. Em erro, envia snapshot sanitizado automaticamente para seu backend

### Endpoint esperado

Seu backend deve aceitar `application/json` com payload de snapshot, salvar e retornar um ID interno de incidente.

### Demo local (para ver rodando agora)

1. Suba endpoint local:

```bash
npm run intake:serve
```

2. No popup da extensão, configure:

```text
Endpoint: http://localhost:4020/internal/auto-snapshot
Auto send: ligado
```

3. Abra qualquer página, gere um erro no console (ex.: `Promise.reject(new Error("teste"))`) e o snapshot será salvo em:

```text
snapshots/remote/bug-*.json
```

## Estratégia recomendada para o report

O fluxo já está organizado em três camadas:

1. **Snapshot bruto sanitizado**: preserva request, response, logs e webhooks para replay.
2. **Snapshot do browser**: preserva contexto de página, eventos de erro e observações de rede/GraphQL.
3. **Report consolidado**: converte o snapshot em markdown e em texto curto para Slack, para a issue nascer com contexto suficiente.
4. **Thread humanizada**: gera um texto pronto para copiar/colar no Slack com OrgId, mentions, links e descrição sem IA.

Se você quiser evoluir isso depois, a próxima etapa natural é incluir um `issueId` e um payload de `Slack draft` no backend, para o report já nascer com link rastreável entre snapshot, replay e ticket.
