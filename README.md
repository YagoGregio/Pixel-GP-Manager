# Pixel F1 Manager 2026

Jogo de gestão de Fórmula 1 em pixel art, feito em HTML, CSS e JavaScript puro (sem bibliotecas, sem instalação).
Versão atual: **3.1.1**

## Como abrir
1. Extraia a pasta.
2. Abra `index.html` no navegador (ou use "Open with Live Server" no VS Code).

A fonte "Press Start 2P" vem do Google Fonts. Sem internet o jogo funciona, só com uma fonte padrão.

## Estrutura dos arquivos
| Arquivo | Função |
|---|---|
| `index.html`, `style.css` | telas e estilo |
| `data.js` | pneus, motores, equipes e pilotos de 2026, balanceamento |
| `tracks.js` | as 10 pistas, com zonas de asa ativa e chance de chuva |
| `sim.js` | simulação da corrida (sem DOM, testável no Node) |
| `stewards.js` | comissários: punições de pilotos e equipes |
| `weather.js` | clima, pista molhada, pneus de chuva, previsão |
| `hazards.js` | zonas de asa ativa, acidentes, safety car, Overtake Mode e Boost |
| `quali.js` | classificação Q1/Q2/Q3 |
| `season.js` | temporada, campeonatos, licença, suspensões |
| `art.js` | arte em pixel (pistas, carros, rostos, clima) |
| `script.js` | interface e laço principal |

---

# Histórico de atualizações

## v1: o jogo original
Código seu: uma corrida de 15 voltas em Interlagos, com grid de 2026 e IA (arquivos `index.html`, `style.css`, `script.js`).
Foi analisado e serviu de base para a v2.

## v2: revisão e arte
- Código separado em arquivos (dados, pistas, simulação, arte, interface). A simulação ficou sem DOM e passou a rodar em passo fixo de 60 Hz, igual em qualquer monitor.
- **10 pistas** do calendário (Albert Park, Suzuka, Mônaco, Silverstone, Spa, Zandvoort, Monza, Interlagos, Las Vegas, Yas Marina) com arte nova: zebras, boxes, arquibancadas, lago, água e temas (grama, floresta, dunas, cidade, noite, deserto).
- **Pit lane de verdade**: entrada, parada com troca de pneus e equipe, saída.
- **Foto de rosto de cada piloto** em pixel art (tom de pele, cabelo, barba), editável para a sua equipe.
- **Piloto pede box** quando o pneu perde rendimento ou ele perde muitas posições. Há opção de aceitar ou ignorar, ou deixar o box automático.
- **Carros** com textura melhor.
- Ultrapassagens por "carga", ar sujo, ritmo (poupar, normal, ataque), bateria ERS, regra dos 2 compostos, volta mais rápida e classificação final.
- Atalhos de teclado e velocidades 1x, 2x, 4x e 8x.
- Correções da revisão de código (vários bugs de temporização e de interface).

## v3: equipes reais, campeonatos e punições
- **Escolha de equipe**: assuma qualquer uma das 11 equipes reais (pilotos, cores e rostos) ou crie a 12ª.
- **Motores reais para todas as equipes** (Mercedes, Ferrari, Red Bull-Ford, Honda, Audi), cada um com efeito próprio (ritmo, confiabilidade, desgaste, vácuo, bateria, saída dos boxes). Antes, só a sua equipe usava o motor escolhido.
- Ritmo calibrado pela ordem real do campeonato de construtores de 2026.
- **Temporada de 10 etapas** com campeonato de pilotos e de construtores, vitórias, pódios, salvamento automático e botão "Continuar temporada". Modo GP único. Botão MENU na corrida.
- **Comissários**:
  - tempo (+5 s e +10 s), cumprido no box ou somado ao resultado final
  - drive-through com prazo de 2 voltas
  - perda de posições no grid (motor e câmbio)
  - limites de pista, largada antecipada, soltura insegura, colisões com dano na asa
  - desqualificação técnica e multas de equipe
  - **pontos na licença**: 12 pontos = uma corrida de suspensão, e um reserva assume o carro
  - multa de teto de gastos no fim da temporada
- Aba "Comissários" no resultado, avisos na classificação e nos cartões dos pilotos.

## v3.1.0: asa ativa, acidentes e clima
- **Zonas de modo reta (asa ativa de 2026, que substituiu o DRS)** marcadas em verde na pista. A quantidade por pista segue a FIA: Melbourne 5, Suzuka 2, Silverstone 4, Spa 5, Zandvoort 2, Monza 4, Interlagos 2, Las Vegas 3 e Mônaco 0. Em Yas Marina são 3 zonas **estimadas**.
- **Falha na asa**: às vezes a asa não fecha ao fim da zona. O rádio avisa, e você pode mandar poupar para reduzir o risco. Depois vem um susto, uma rodada ou um acidente com abandono. Trechos como Spoon até a 130R (Suzuka) e La Source até Eau Rouge (Spa) têm mais risco.
- **Perda de tração**: pneu gasto, ritmo de ataque e, principalmente, chuva com pneu errado. Acidentes podem atingir carros próximos, e carro parado gera bandeira amarela.
- **Clima**: seco, chuva fraca, chuva forte, começa a chover, chuva que para, pancada ou aleatório por pista. A pista molha e seca aos poucos, e há previsão com margem de erro.
- **Pneus intermediário e de chuva**, com atalhos novos. A IA reage com atraso e erro. A regra dos 2 compostos é dispensada em corrida molhada.
- Chuva, escurecimento, brilho e borrifo desenhados na tela.
- **Albert Park redesenhado** a partir do mapa oficial que você enviou, com as 5 zonas de 2026 posicionadas sobre ele.

## v3.1.1: classificação, safety car e energia
- **Classificação Q1, Q2 e Q3** antes de cada corrida. Escolha pneu e risco dos seus pilotos. O grid sai da classificação, e as punições de grid vêm depois.
- **Safety car e VSC** depois de acidentes: sem ultrapassagens, pelotão fechado, paradas mais baratas e relargada.
- **Overtake Mode**: arma sozinho na linha de detecção se o carro está a menos de 1 s do da frente, e vale na volta seguinte.
- **Boost** (tecla Z no piloto 1, N no piloto 2): gasta 30% da bateria para um impulso curto.
- **Balanceamento**: diferença entre equipes comprimida e forma aleatória por fim de semana. A Mercedes caiu de cerca de 87% para cerca de 45% das vitórias.
- Registro dos comissários mais limpo. A "asa que não fecha" passou a se chamar "falha na asa ativa".

---

# Controles
| | Piloto 1 | Piloto 2 |
|---|---|---|
| Ritmo (poupar, normal, ataque) | Q W E | I O P |
| Box (macio, médio, duro, inter, chuva) | A S D F G | J K L ; ' |
| Boost | Z | N |
| Aceitar pedido de box | X | M |

Pausa: `Espaço`. Velocidades: `1` a `4`. Antes da largada, os botões de pneu escolhem o pneu do grid.

# Limites conhecidos
- Os desenhos das pistas são estilizados, **exceto o Albert Park**, que foi traçado a partir do mapa oficial. A posição das zonas nas outras pistas é aproximada.
- Os rostos são pixel art estilizado, não fotos reais.
- As chances de punição, acidente, safety car e chuva são valores de balanceamento do jogo, não dados oficiais.
- Em Yas Marina as zonas de asa são estimadas.

# Próximos passos sugeridos
- Redesenhar as outras 9 pistas a partir dos mapas oficiais, como foi feito no Albert Park.
- Desenvolvimento do carro durante a temporada.
- Evolução e contratos dos pilotos.
- Fins de semana de sprint (Silverstone e Zandvoort em 2026).
- Planejamento de estratégia antes da corrida.
- Efeitos sonoros, controles por toque e níveis de dificuldade.
