# Integrações MCP — onde cada agente guarda a config

Levantado em **2026-10-30** (pesquisa nas documentações oficiais). Agentes mudam isso com frequência: quando um
deles deixar de achar o atelier, conferir aqui primeiro e atualizar `core/src/integracoes.rs`.

O atelier instala um servidor **stdio** chamado `atelier`, com `command` = caminho absoluto do `atelier-mcp`
(fica ao lado do executável do app). `~` = `%USERPROFILE%` no Windows; "config" = `%APPDATA%` no Windows e
`~/.config` no Linux.

| Agente | Arquivo de usuário | Chave / formato | Observação |
|---|---|---|---|
| Claude Code | `~/.claude.json` | `mcpServers` + `type: "stdio"` | Instalado via `claude mcp add --scope user` (o app reescreve o arquivo) |
| Claude Desktop | config`/Claude/claude_desktop_config.json` | `mcpServers` | Reiniciar o app. Instalação MSIX pode virtualizar `%APPDATA%` (não confirmado) |
| Codex · ChatGPT desktop | `~/.codex/config.toml` (`CODEX_HOME`) | `[mcp_servers.atelier]` | Uma config para CLI, extensão de IDE e ChatGPT desktop |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` | Pode estar sendo substituído pelo Antigravity CLI |
| Google Antigravity | `~/.gemini/config/mcp_config.json` (e o legado `~/.gemini/antigravity/mcp_config.json`) | `mcpServers`, **sem** `type` | Vale para a IDE e o CLI `agy` |
| OpenCode | `~/.config/opencode/opencode.json(c)` | `mcp` + `type: "local"`, `command` em **lista** | Caminho no Windows segue XDG (não confirmado) |
| Kiro (IDE e CLI) | `~/.kiro/settings/mcp.json` (`KIRO_HOME`) | `mcpServers` | Substituiu o Amazon Q Developer CLI |
| Copilot · VS Code | config`/Code/User/mcp.json` | **`servers`** + `type: "stdio"` | Arquivo pode ter comentários (JSONC) |
| Copilot CLI | `~/.copilot/mcp-config.json` (`COPILOT_HOME`) | `mcpServers` + `type: "local"` | |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | Marca virou Devin |
| Devin | config`/devin/mcp_config.json` | `mcpServers` | |
| Zed | config`/Zed/settings.json` (Linux: `zed`) | `context_servers` | Quase sempre tem comentários → instalação à mão |
| Cline (VS Code) | config`/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `mcpServers`, sem `type` | Não confirmado na doc |
| JetBrains Junie | `~/.junie/mcp/mcp.json` | `mcpServers` | |
| Pi | `~/.pi/agent/mcp.json` (`PI_CODING_AGENT_DIR`) | `mcpServers` | Ambíguo: MCP nativo só nas versões novas, antes via `pi-mcp-adapter` |
| Goose | config`/goose/config.yaml` (Windows `%APPDATA%\Block\goose\config\`) | `extensions:` (YAML) | Só à mão |
| Continue | `~/.continue/config.yaml` | lista `mcpServers:` (YAML) | Só à mão |

Fora: **ChatGPT web** (não lê config local) e **JetBrains AI Assistant** (configura só pela interface).

## Regras do instalador

- Backup `<arquivo>.bak-atelier` antes de escrever; o resto do arquivo é preservado (JSON na mesma ordem; TOML
  com `toml_edit`, mantendo comentários).
- Arquivo JSON com comentários não é reescrito: a tela mostra o trecho para colar.
- Situações: `instalado`, `caminho antigo` (aponta para outro `atelier-mcp`, ex.: depois de mover o app),
  `encontrado` (agente nesta máquina), `não encontrado`, `à mão`.
- Teste sem mexer nas configs reais: `ATELIER_AGENTES_HOME=<pasta falsa>`.

## Agentes em uso (2026-10-31)

Depois de instalar o MCP, cada agente de linha de comando pode ser ligado (na mesma tela) para três usos, todos
desligados por padrão: **Terminal** (aparece no botão de terminal do painel), **Executor** (o atelier chama sem
terminal, por `/api/executar`) e **Prompt** (aparece no `/prompt` do editor). Os argumentos do modo não interativo
ficam editáveis em "Ver config" (`{prompt}` vira o pedido; sem ele, o pedido vai pela entrada padrão). Padrões:
`claude -p` (só ferramentas de leitura do MCP do atelier), `codex exec --skip-git-repo-check -`, `gemini -p`,
`opencode run`, `kiro-cli chat --no-interactive`, `copilot -p`, `cursor-agent -p`, `pi -p`. O Antigravity CLI só abre
no terminal.

A ferramenta `tela` do MCP mexe no app aberto: `abrir` (item pelo código ou visão pelo nome, `ao_lado` opcional),
`recarregar`, `filtrar` e `destacar`.
