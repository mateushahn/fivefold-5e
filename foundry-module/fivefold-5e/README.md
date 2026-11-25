# Fivefold 5e — Módulo Foundry VTT (v14.370 · `dnd5e` 5.x / 6.x)

Transforma o D&D 5e em uma **teia de habilidades sem classes (DAG)** ramificada a partir de **5 Raízes de Papel** (**Combate**, **Devoção**, **Magia**, **Social** e **Exploração**) mais **14 nós Híbridos** multi-origem — totalmente integrada às fichas de personagem (`Actor`) do sistema `dnd5e`.

## Recursos Principais

- **Interface nativa `ApplicationV2` (Foundry v14.370)** com suporte aos temas Light/Dark por janela do Foundry e localização **Português (PT-BR)** e **Inglês (EN)**.
- **Sincronização Não-Destrutiva com a Ficha `dnd5e` (v5.x / v6.x)**:
  - Lê automaticamente o **Nível** e **Mod. de CON** da ficha do personagem.
  - Aplica **Perícias (Skills)**, **Salvaguardas (Saves)**, **Proficiências de Armadura / Armas / Ferramentas** e cria **Items (`feat`)** gerenciados no personagem.
  - Mantém um **Active Effect** nativo v14 (`EffectChangeData` com `type: "add"`, `phase: "initial"`, `img` e chave `system.attributes.hp.bonuses.level`) concedendo bônus de PV por nível ao evoluir o **Dado de Vida (`d6 → d8 → d10 → d12`)** — escalando automaticamente a cada novo nível.
  - Rastreia exatamente o que o módulo concedeu em `actor.flags['fivefold-5e']`, garantindo que **reembolsos (Refund)** nunca apaguem perícias ou proficiências vindas da raça/antecedente.
- **Suporte a Itens de Compêndio (Drag & Drop)**: No modo **Editar Árvore (GM)**, arraste qualquer Item de Compêndio do Foundry diretamente no campo *UUID de Item do Compêndio* para que o desbloqueio daquele nó clone o item oficial na ficha do jogador via `foundry.utils.fromUuid`.
- **Permissões GM vs. Jogador**:
  - **GM**: Edita a árvore do mundo inteiro (salva em `game.settings`), importa/exporta JSON, configura SP iniciais/por nível e trava ou libera reembolsos de jogadores.
  - **Jogadores**: Abrem a árvore diretamente pelo botão **Árvore Fivefold** no cabeçalho da própria ficha de personagem.

## Instalação no Foundry VTT 14.370

1. Copie a pasta `fivefold-5e/` (ou extraia `fivefold-5e-foundry-module.zip`) dentro do diretório de módulos do seu Foundry VTT:
   ```text
   <Foundry Data>/Data/modules/fivefold-5e/
   ```
   Verifique se o arquivo `module.json` está exatamente em `Data/modules/fivefold-5e/module.json`.
2. Reinicie o Foundry VTT (se já estava aberto).
3. Abra seu mundo **D&D 5e (`dnd5e` 5.0+ / 6.1.x)** → **Configurações → Gerenciar Módulos** e ative **Fivefold 5e — Role-Rooted Skill Web**.

## Como Abrir no Jogo

- **Na Ficha do Personagem**: Clique no botão **Árvore Fivefold** (*Skill Web*) no cabeçalho da ficha de qualquer personagem (`character`).
- **Na Barra de Controles da Cena**: Na aba de controles de Token (lado esquerdo), clique no ícone de grafo (**Abrir Teia de Habilidades Fivefold 5e**).
- **Via Macro**:
  ```js
  // Abre para o token selecionado ou para o personagem padrão do jogador
  const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
  game.modules.get('fivefold-5e').api.open(actor, actor ? 'build' : 'inspect');
  ```
