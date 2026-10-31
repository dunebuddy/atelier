# atelier

Gestão pessoal no estilo Notion, local e sob medida: um app desktop (Tauri + SQLite) em que tudo é **item** com
**propriedades** que você cria e muda a qualquer hora. Feito para trabalhar junto com agentes de IA: o atelier tem um
servidor **MCP** que dá aos agentes (Claude Code, Codex, Gemini CLI, OpenCode, Kiro, Copilot...) leitura, escrita e
controle da tela.

- Visões em tabela, lista, quadro e linha do tempo, com filtros; a barra lateral mostra a visão em árvore.
- Painel de trabalho com abas, tile ou fita (colunas que rolam), em uma ou duas metades.
- Relações entre itens como propriedades; links por ferramenta; busca no texto e nas anotações.
- Bancadas: cada uma é uma pasta com o banco e as pastas de trabalho dos itens.
- Agentes no terminal embutido e no editor (`/prompt`), só depois de terem o MCP instalado.
- Exportar item ou visão em Markdown, HTML, PDF, Excel ou CSV.
- Temas em arquivo (`~/atelier/temas/*.toml`), lixeira, versões do texto, backup.

Os dados ficam na sua máquina (`~/atelier`); nada vai para a nuvem.

## Instalar

Baixe o instalador da [última versão](https://github.com/dunebuddy/atelier/releases/latest): Windows
(`atelier_*_x64-setup.exe`) ou Linux (`.AppImage` ou `.deb`). O app avisa quando sai versão nova.

## Desenvolver

Precisa de Rust, Bun e Node.

```bash
bun install
bun run tauri dev
```

Testes do núcleo: `cargo test -p atelier-core`. Para testar sem mexer nos seus dados:
`ATELIER_HOME=<pasta> ATELIER_AGENTES_HOME=<pasta> bun run tauri dev`.

## Publicar uma versão

```bash
node scripts/versao.mjs 0.2.0
git commit -am "Versão 0.2.0"
git tag v0.2.0
git push && git push --tags
```

O GitHub Actions gera os instaladores, assina as atualizações e publica a release.
