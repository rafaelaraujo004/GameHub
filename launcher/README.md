# GameHub Smart Launcher V2

## Objetivo
Fornecer experiencia `click -> play` com cache local inteligente, download com progresso/ETA e inicializacao automatica no emulador.

## Arquivos
- `launcher/index.js`: servidor local, jobs de execucao, download streaming e metadados
- `launcher/config.json`: caminhos locais, porta, CORS e credenciais IGDB
- `launcher/games_cache.json`: cache local de jogos baixados/registrados
- `launcher/metadata_cache.json`: cache local de buscas de metadados

## Configuracao
Ajuste `launcher/config.json` para sua maquina:

```json
{
  "emulatorPath": "C:\\Program Files\\PCSX2\\pcsx2.exe",
  "emulatorSearchRoots": [
    "C:\\Users\\Rafael Araújo\\AppData\\Local"
  ],
  "emulatorArgs": [],
  "boot": {
    "mode": "nogui",
    "fullscreen": true,
    "fastBoot": true
  },
  "gamesDir": "C:\\GameHub\\games",
  "port": 3001,
  "host": "127.0.0.1",
  "allowedOrigins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ],
  "igdb": {
    "clientId": "",
    "clientSecret": ""
  }
}
```

Notas importantes:
- O launcher tenta localizar o PCSX2 automaticamente se `emulatorPath` nao existir (inclui `where`, pastas padrao e busca em `emulatorSearchRoots`).
- Use `emulatorSearchRoots` para incluir pastas personalizadas onde o emulador pode estar instalado.
- Para PCSX2, o comportamento de boot e definido por `boot`:
  - `mode`: `nogui`, `gui` ou `auto`
  - `fullscreen`: `true`/`false`
  - `fastBoot`: `true`/`false`
- `emulatorArgs` continua disponivel para flags extras personalizadas.

## Executar

```bash
npm run launcher:start
```

Para outra maquina (ou quando houver atualizacoes), use um unico comando:

```bash
npm run launcher:sync-start
```

Esse comando faz:
- `git pull --ff-only`
- `npm install`
- `npm run launcher:start`

## Distribuir para usuarios finais (sem Node/Git)

Gerar launcher standalone:

```bash
npm run launcher:build-exe
```

Gerar pacote ZIP pronto para enviar a terceiros:

```bash
npm run launcher:package-release
```

Arquivos gerados em `launcher/release`:
- `GameHubLauncher.exe`
- `config.json`
- `README-rapido.txt`
- `GameHubLauncher-v<versao>-<commit>-<timestamp>.zip`

Entrega recomendada para terceiros:
- enviar a pasta `launcher/release` compactada
- pedir para ajustar `config.json` (caminho do PCSX2)
- executar `GameHubLauncher.exe` antes de abrir o link da Vercel

## API

### `POST /play`
Dispara um job de play inteligente.

Body para arquivo local:

```json
{
  "name": "God of War II",
  "gamePath": "C:\\Games\\gow2.iso",
  "metadataId": "igdb_123"
}
```

Body para download inteligente:

```json
{
  "name": "God of War II",
  "downloadUrl": "https://example.com/gow2.iso",
  "metadataId": "igdb_123"
}
```

Resposta:

```json
{ "status": "ok", "jobId": "..." }
```

### `GET /jobs/:jobId`
Retorna estado atual do job (preparing, downloading, finalizing, launching, completed, error).

### `GET /metadata/search?q=...`
Busca metadados via IGDB e usa cache local para evitar refetch desnecessario.

## Regras de seguranca
- aceita somente requests de loopback localhost
- valida CORS por whitelist de origens
- valida caminhos absolutos no Windows
- restringe extensoes de jogo permitidas: ISO, BIN, IMG, CHD, CUE, MDF, NRG, CSO, ZSO, ISZ e ELF
- evita injecao de comando (usa `spawn` com argumentos separados)
- valida existencia de emulador e arquivo antes de executar

## Comportamento de cache
- impede downloads duplicados por `downloadUrl` ou nome normalizado
- registra automaticamente arquivo existente em disco
- reutiliza arquivo local para inicializacao instantanea
- salva historico em `games_cache.json`

## Download inteligente
- streaming sem carregar arquivo inteiro em memoria
- progresso em porcentagem
- velocidade em MB/s
- ETA em segundos
- resume de download com `.part` quando o servidor suporta `Range`
