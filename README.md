# Phantom Bridge UI

This package contains web UI for the Phantom Bridge and a web server to serve it.

The web server itself does not connect to anything, it merely servers semi-static HTML and JavaScript to users. The UI in the web browser establishes connection to Bridge Server via Socket.io, and to the Bridge Client node on a robot via WebRTC P2P connection.

You can fork this repository and host it yourself to customize the default UI provided. The configuration file specifies which Bridge Server shall the client connect to.

![Infrastructure map](https://raw.githubusercontent.com/PhantomCybernetics/phntm_bridge_docs/refs/heads/main/img/Architecture_UI.svg)

# Install Bridge UI

### Install Bun

Follow [instructions from bun.sh](https://bun.sh/docs/installation)

Last tested 1.2.18

### Clone this repo and install dependencies

```bash
cd ~
git clone git@github.com:PhantomCybernetics/phntm_bridge_ui.git phntm_bridge_ui
cd phntm_bridge_ui
bun install
```

### Register a new App on the Bridge Server

To Phantom Bridge, this UI represents an app, individual browser clients running web ui are considered app instances. New app needs to register with the Bridge Server server it intends to use. The following link will return a new appId/appKey pair, put these in your config.jsonc below.
[https://register.phntm.io/app](https://register.phntm.io/app)

### Create config file

Create new config file e.g. `~/phntm_bridge_ui/config.jsonc`, use [./config.example.jsonc](./config.example.jsonc) as a starting point.

### Add system service to your systemd

```bash
sudo vim /etc/systemd/system/phntm_bridge_ui.service
```

...and paste:

```
[Unit]
Description=phntm bridge_ui service
After=network.target

[Service]
ExecStart=/home/ubuntu/phntm_bridge_ui/run.sh
Restart=always
User=root
Environment=NODE_ENV=production
WorkingDirectory=/home/ubuntu/phntm_bridge_ui/
StandardOutput=append:/var/log/phntm_bridge_ui.log
StandardError=append:/var/log/phntm_bridge_ui.err.log

[Install]
WantedBy=multi-user.target
```

Reload systemctl daemon

```bash
sudo systemctl daemon-reload
```

### Add Git safe directory for root
We read git commit and tags as root to display in the UI. The repo must be added to global safe.directory like this:

``` bash
sudo git config --global --add safe.directory /home/ubuntu/phntm_bridge_ui
```

### Launch

```bash
sudo systemctl start phntm_bridge_ui.service
sudo systemctl enable phntm_bridge_ui.service # will launch on boot
```
---

# Métricas 

O servidor expõe um endpoint de scrape para o [Prometheus](https://prometheus.io/) e aceita estatísticas WebRTC enviadas pelo navegador. Isso permite monitorar em tempo real a saúde do servidor e a qualidade das conexões WebRTC por sessão no Grafana.


## Configuração de métricas

Esse bloco foi adicionado em `config.jsonc`

```jsonc
"metrics": {
  "enabled": true,
  "path": "/metrics"
}
```

## Métricas expostas

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `phntm_http_requests_total` | Counter | `method`, `status_code` | Total de requisições HTTP |
| `phntm_webrtc_rtt_seconds` | Gauge | `robot_id`, `session_id` | Round-trip time WebRTC (segundos) |
| `phntm_webrtc_fps` | Gauge | `robot_id`, `session_id`, `mid` | Frames por segundo (inbound-RTP) |
| `phntm_webrtc_packets_lost` | Gauge | `robot_id`, `session_id`, `mid` | Pacotes perdidos (acumulado) |
| `phntm_webrtc_frames_dropped` | Gauge | `robot_id`, `session_id`, `mid` | Frames descartados (acumulado) |
| `phntm_webrtc_freeze_count` | Gauge | `robot_id`, `session_id`, `mid` | Contagem de congelamentos de vídeo (acumulado) |

As métricas padrão do processo Node.js (`process_cpu_seconds_total`, `nodejs_heap_size_used_bytes`, lag do event-loop, etc.) também são coletadas automaticamente.

## Gerenciamento de sessões

Cada aba do navegador gera um `session_id` único (UUIDv4) no carregamento da página via `crypto.randomUUID()`. Todas as métricas WebRTC são marcadas com esse ID, permitindo filtrar por sessão no Grafana.

```js
// Ver o ID da sessão atual
panel_ui.sessionId

// Iniciar uma nova sessão (remove os dados da sessão anterior do Prometheus imediatamente)
panel_ui.newSession()

// Listar todas as sessões conhecidas pelo servidor
fetch('/api/metrics/sessions').then(r => r.json()).then(console.log)

// Deletar uma sessão específica
fetch('/api/metrics/session/<uuid>', { method: 'DELETE' })
```

> ainda em teste...

## Endpoints da API

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/metrics` | Endpoint de scrape do Prometheus |
| `POST` | `/api/metrics/push` | Recebe estatísticas WebRTC do navegador |
| `GET` | `/api/metrics/sessions` | Lista os IDs de sessão conhecidos |
| `DELETE` | `/api/metrics/session/:sessionId` | Remove todas as séries de gauge de uma sessão |

## Executando a stack de monitoramento (Prometheus + Grafana)

O Docker Compose completo está incluído no diretório `monitoring/`:

```bash
cd monitoring
docker compose up -d
```

- **Grafana** → `http://localhost:3000` (usuário: admin / senha: admin)
- **Prometheus** → `http://localhost:9090`

O dashboard do Grafana é provisionado automaticamente e inclui painéis do servidor (taxa de HTTP, memória, CPU, lag do event-loop) e para o WebRTC (RTT, FPS, pacotes perdidos, frames descartados, contagem de congelamentos) com filtros de **Sessão** e **Robô**.

## Configuração do Prometheus e o do Grafana 
Estão presentes na forma de arquivos yaml no diretório `monitoring/`