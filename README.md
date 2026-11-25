# Fivefold 5e — Role-Rooted Skill Web RPG System

**Fivefold 5e** é um sistema de RPG sem classes baseado em **D&D 5e**, onde habilidades de classe, subclasse, perícias, salvaguardas, proficiências, dados de vida, conjuração e talentos são distribuídos em uma **teia de habilidades (DAG)** ramificada a partir de **5 Raízes de Papel**:

- **Combat** (Combate)
- **Devotion** (Devoção)
- **Magic** (Magia)
- **Social** (Social)
- **Exploring** (Exploração)
- **+ 14 nós Híbridos** multi-origem conectando papéis (ex.: *Divine Smite*, *Martial Arts & Ki*, *Eldritch Knight / War Magic*, *Sacred Avenger*).

---

## Estrutura do Repositório

```text
fivefold-5e/
├── SYSTEM_DESIGN.md                 # Documento de design e regras do sistema Fivefold 5e
├── standalone/                      # Aplicação Web Standalone (sem Foundry)
│   ├── fivefold-5e-studio.html      # Arquivo HTML único autocontido (funciona offline)
│   ├── index.html                   # Versão modular (HTML + CSS + JS)
│   ├── styles.css
│   ├── app.js
│   ├── data/skill-tree.json         # Grafo padrão (115 nós, 153 arestas)
│   └── scripts/generate_tree.mjs    # Gerador determinístico do grafo
└── foundry-module/                  # Módulo Foundry VTT v14.370+ (dnd5e 5.x / 6.1.x)
    ├── fivefold-5e/                 # Código-fonte do módulo instalável
    ├── fivefold-5e-foundry-module.zip
    └── tests/verify-module.mjs      # Suite automatizada de verificação
```

---

## 1. Módulo Foundry VTT (v14.370 · `dnd5e` 5.0+ / 6.1.x)

### Instalação direta via Manifest URL (Recomendado)
1. No Foundry VTT, vá em **Add-on Modules → Install Module**.
2. No campo **Manifest URL**, cole:
   ```text
   https://raw.githubusercontent.com/mateushahn/fivefold-5e/main/foundry-module/fivefold-5e/module.json
   ```
3. Clique em **Install** e ative **Fivefold 5e — Role-Rooted Skill Web** no seu mundo `dnd5e`.

### Instalação Manual
Baixe ou extraia `foundry-module/fivefold-5e-foundry-module.zip` dentro de `<Foundry Data>/Data/modules/` de forma que `Data/modules/fivefold-5e/module.json` exista.

### Recursos do Módulo (v1.3.1)
- Interface nativa **`ApplicationV2`** (Foundry v14.370) bilíngue (**PT-BR** e **EN**).
- **Nodos com escolha múltipla e repetíveis** via `DialogV2` (ex.: *Fighting Style*, *Expertise*, *Eldritch Invocations*, *Metamagic*, *Maneuvers*).
- **Active Effects passivos (`transfer: true`)** embutidos automaticamente nos itens `feat` gerados (ex.: *Fighting Style: Archery* `+2` em ataque à distância, *Defense* `+1` CA, *Dueling* `+2` dano corpo a corpo, *Aura of Protection*, *Alert & Mobile*, *War Caster*, *Jack of All Trades*, etc.).
- **Sincronização não-destrutiva** com a ficha `dnd5e` (perícias, especialização, salvaguardas, proficiências, bônus de PV por Dado de Vida e suporte a UUIDs de Compêndio via Drag & Drop).
- **Editor visual para o Mestre (GM)** para criar/editar nodos, arestas, escolhas e efeitos passivos direto no Foundry.

---

## 2. Aplicação Standalone (HTML)

- **Uso imediato offline:** abra `standalone/fivefold-5e-studio.html` diretamente no navegador (arquivo único autocontido, sem necessidade de servidor).
- **Uso com servidor local:** abra a pasta `standalone/` via qualquer servidor estático (ex.: `npx serve standalone` ou `python3 -m http.server` na pasta `standalone/`).

---

## Testes

Execute a suite de verificação do módulo Foundry VTT com Node.js 22+:

```bash
node foundry-module/tests/verify-module.mjs
```
