export type GameItem = {
  word: string
  hint: string
}

export type GameCard = {
  id: string
  category: string
  items: [GameItem, GameItem, GameItem, GameItem, GameItem]
}

function card(id: string, category: string, items: GameItem[]): GameCard {
  if (items.length !== 5) throw new Error(`A carta "${id}" precisa de cinco itens.`)

  return {
    id,
    category,
    items: items as GameCard['items'],
  }
}

export const localCards: GameCard[] = [
  card('maputo', 'Moçambique', [
    { word: 'Marrabenta', hint: 'Ritmo e dança popular nascida nos bairros de Maputo.' },
    { word: 'Matapa', hint: 'Prato feito com folhas de mandioca, amendoim e coco.' },
    { word: 'Baobá', hint: 'Árvore enorme, de tronco largo, que guarda água.' },
    { word: 'Capulana', hint: 'Tecido colorido usado em roupa, decoração e para carregar bebés.' },
    { word: 'Dhow', hint: 'Barco tradicional à vela que navega no Índico.' },
  ]),
  card('natureza', 'Natureza', [
    { word: 'Gorongosa', hint: 'Parque nacional moçambicano conhecido pela vida selvagem.' },
    { word: 'Arquipélago', hint: 'Conjunto de ilhas próximas umas das outras.' },
    { word: 'Mangue', hint: 'Floresta costeira que cresce onde a água doce encontra o mar.' },
    { word: 'Ciclone', hint: 'Tempestade tropical com ventos muito fortes.' },
    { word: 'Flamingo', hint: 'Ave cor-de-rosa que se equilibra numa perna.' },
  ]),
  card('cozinha', 'À mesa', [
    { word: 'Chamuça', hint: 'Pastel triangular recheado, muitas vezes com caril.' },
    { word: 'Amendoim', hint: 'Pequeno fruto seco muito usado na matapa.' },
    { word: 'Mandioca', hint: 'Raiz que também pode ser transformada em farinha.' },
    { word: 'Coco', hint: 'Fruto tropical com água e polpa branca.' },
    { word: 'Caril', hint: 'Prato temperado com especiarias, normalmente servido com arroz.' },
  ]),
  card('cidade', 'Vida na cidade', [
    { word: 'Chapa', hint: 'Transporte semi-colectivo que percorre as ruas da cidade.' },
    { word: 'Semáforo', hint: 'Sinal de trânsito com luzes vermelha, amarela e verde.' },
    { word: 'Mercado', hint: 'Lugar cheio de bancas onde se compra e vende de tudo.' },
    { word: 'Bicicleta', hint: 'Veículo de duas rodas movido a pedais.' },
    { word: 'Farol', hint: 'Torre com uma luz forte que orienta os barcos à noite.' },
  ]),
  card('familia', 'Família e amigos', [
    { word: 'Avó', hint: 'Mãe do teu pai ou da tua mãe.' },
    { word: 'Vizinho', hint: 'Pessoa que mora mesmo ao lado ou perto de ti.' },
    { word: 'Abraço', hint: 'Gestinho carinhoso feito com os braços.' },
    { word: 'Aniversário', hint: 'Dia em que se celebra mais um ano de vida.' },
    { word: 'Fotografia', hint: 'Imagem que ajuda a guardar um momento especial.' },
  ]),
  card('musica', 'Música e festa', [
    { word: 'Timbila', hint: 'Instrumento de madeira tocado com pequenas baquetas.' },
    { word: 'Tambor', hint: 'Instrumento de percussão que se toca batendo numa pele.' },
    { word: 'Coro', hint: 'Grupo de pessoas que canta em conjunto.' },
    { word: 'Dança', hint: 'Movimento do corpo ao ritmo da música.' },
    { word: 'Palco', hint: 'Estrado onde artistas se apresentam.' },
  ]),
  card('animais', 'Animais', [
    { word: 'Elefante', hint: 'Animal enorme com tromba e grandes orelhas.' },
    { word: 'Girafa', hint: 'Animal muito alto com pescoço comprido e manchas.' },
    { word: 'Tartaruga', hint: 'Réptil de passo lento que leva uma carapaça às costas.' },
    { word: 'Golfinho', hint: 'Mamífero marinho inteligente que salta sobre as ondas.' },
    { word: 'Camaleão', hint: 'Lagarto que pode mudar de cor e mexe os olhos separadamente.' },
  ]),
  card('desporto', 'Desporto e brincadeira', [
    { word: 'Futebol', hint: 'Desporto em que duas equipas tentam marcar golos com os pés.' },
    { word: 'Bola', hint: 'Objecto redondo usado em muitos jogos e desportos.' },
    { word: 'Natação', hint: 'Desporto ou actividade de se deslocar dentro da água.' },
    { word: 'Apito', hint: 'Pequeno objecto que o árbitro sopra para fazer um som agudo.' },
    { word: 'Medalha', hint: 'Prémio redondo entregue a quem vence uma competição.' },
  ]),
  card('escola', 'Escola', [
    { word: 'Caderno', hint: 'Conjunto de folhas para escrever apontamentos e exercícios.' },
    { word: 'Lápis', hint: 'Material de escrita que se pode apagar com uma borracha.' },
    { word: 'Recreio', hint: 'Pausa das aulas para brincar e conversar.' },
    { word: 'Professor', hint: 'Pessoa que ensina e ajuda a aprender.' },
    { word: 'Biblioteca', hint: 'Sala ou edifício onde se encontram muitos livros.' },
  ]),
  card('viagem', 'Viagens', [
    { word: 'Comboio', hint: 'Transporte comprido que anda sobre carris.' },
    { word: 'Passaporte', hint: 'Documento usado para viajar entre países.' },
    { word: 'Mala', hint: 'Recipiente onde se guardam roupas para uma viagem.' },
    { word: 'Praia', hint: 'Faixa de areia junto ao mar.' },
    { word: 'Aeroporto', hint: 'Lugar onde os aviões descolam e aterram.' },
  ]),
  card('casa', 'Em casa', [
    { word: 'Almofada', hint: 'Peça macia que se põe debaixo da cabeça para dormir.' },
    { word: 'Vassoura', hint: 'Utensílio usado para varrer o chão.' },
    { word: 'Frigorífico', hint: 'Electrodoméstico que mantém a comida fria.' },
    { word: 'Janela', hint: 'Abertura na parede que deixa entrar luz e ar.' },
    { word: 'Chave', hint: 'Peça de metal usada para abrir uma fechadura.' },
  ]),
  card('tempo', 'Tempo e clima', [
    { word: 'Chuva', hint: 'Água que cai das nuvens.' },
    { word: 'Arco-íris', hint: 'Arco colorido que pode aparecer depois da chuva.' },
    { word: 'Sombra', hint: 'Mancha escura que aparece quando a luz encontra um obstáculo.' },
    { word: 'Relâmpago', hint: 'Clarão brilhante que aparece durante uma tempestade.' },
    { word: 'Brisa', hint: 'Vento muito leve e agradável.' },
  ]),
]
