# BugSnapshot + Replay Sandbox

Ferramenta CLI para capturar um incidente real da integração com HubSpot em um snapshot sanitizado e reproduzir localmente para debug.

## Instalação

```bash
npm install
```

## Fluxo rápido

1. Criar snapshot sanitizado:

```bash
npm run snapshot -- --input sample-incident.json
```

2. Subir sandbox local com resposta gravada:

```bash
npm run replay:serve -- --snapshot snapshots\bug-<id>.json --port 4010
```

3. Reexecutar a chamada contra o sandbox:

```bash
npm run replay:run -- --snapshot snapshots\bug-<id>.json --base-url http://localhost:4010
```

## Comandos

- `snapshot:create -i <input> [-o <output>]`
  - Lê um JSON de incidente e gera snapshot com mascaramento automático de dados sensíveis.
- `replay:serve -s <snapshot> [-p <port>]`
  - Inicia servidor local que retorna o mesmo status/body do incidente gravado.
- `replay:run -s <snapshot> [-b <baseUrl>] [-t <timeoutMs>]`
  - Executa chamada de replay e imprime `match: true/false` comparando status e body.

## Dados sensíveis mascarados

Por chave e conteúdo, a ferramenta mascara automaticamente dados como:

- authorization, token, secret, password, apiKey
- email, phone, cpf, cnpj

## Extensão de navegador (beta)

Foi adicionada uma extensão em `extension\` para captura remota com mínima ação do cliente.

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
snapshots\remote\bug-*.json
```
