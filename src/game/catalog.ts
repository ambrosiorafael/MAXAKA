import supplementalCatalog from './supplemental-cards.json' with { type: 'json' }

export type GameItem = {
  id: string
  word: string
  hint: string
  category: string
}

type GameItemContent = Omit<GameItem, 'id'>

export type GameCard = {
  id: string
  category: string
  items: [GameItem, GameItem, GameItem, GameItem, GameItem]
}

const mixCategory = 'Conhecimentos gerais'
export const gameContentAliases = [
  { alias: 'Lago Malawi', canonicalId: 'item-lago-niassa' },
] as const

export function normalizeGameContentName(value: string): string {
  return value.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-PT')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function canonicalGameContentName(value: string): string {
  const normalized = normalizeGameContentName(value)
  const alias = gameContentAliases.find((entry) => normalizeGameContentName(entry.alias) === normalized)
  return alias ? normalizeGameContentName('Lago Niassa') : normalized
}

function identifyItems(items: readonly GameItemContent[]): GameItem[] {
  return items.map((item) => ({
    ...item,
    id: `item-${canonicalGameContentName(item.word).replace(/\s+/g, '-')}`,
  }))
}

const cultureItems: GameItemContent[] = [
  { word: 'Marrabenta', hint: 'Estilo de música e dança popular associado a Maputo.', category: 'Cultura moçambicana' },
  { word: 'Timbila', hint: 'Instrumento de madeira tocado pelos Chopes, no sul de Moçambique.', category: 'Cultura moçambicana' },
  { word: 'Capulana', hint: 'Tecido colorido usado em roupa, decoração e no quotidiano moçambicano.', category: 'Cultura moçambicana' },
  { word: 'Mapiko', hint: 'Dança mascarada tradicional ligada à cultura Maconde.', category: 'Cultura moçambicana' },
  { word: 'Xigubo', hint: 'Dança tradicional de carácter guerreiro, praticada no sul de Moçambique.', category: 'Cultura moçambicana' },
  { word: 'Tufo', hint: 'Dança tradicional de origem suaíli praticada no norte de Moçambique.', category: 'Cultura moçambicana' },
  { word: 'Chapa', hint: 'Nome popular dos miniautocarros de transporte colectivo em Moçambique.', category: 'Cultura moçambicana' },
  { word: 'Mia Couto', hint: 'Escritor moçambicano, autor de Terra Sonâmbula.', category: 'Cultura moçambicana' },
  { word: 'Paulina Chiziane', hint: 'Romancista moçambicana, autora de Niketche.', category: 'Cultura moçambicana' },
  { word: 'Malangatana', hint: 'Pintor e poeta moçambicano conhecido pelas suas obras de cores intensas.', category: 'Cultura moçambicana' },
  { word: 'José Craveirinha', hint: 'Poeta moçambicano, primeiro africano a receber o Prémio Camões.', category: 'Cultura moçambicana' },
  { word: 'Ghorwane', hint: 'Banda moçambicana conhecida por misturar ritmos locais e música moderna.', category: 'Cultura moçambicana' },
  { word: 'Dhow', hint: 'Barco tradicional à vela utilizado no oceano Índico.', category: 'Cultura moçambicana' },
  { word: 'Emakhuwa', hint: 'Uma das línguas bantu mais faladas em Moçambique.', category: 'Cultura moçambicana' },
  { word: 'Changana', hint: 'Língua bantu falada sobretudo no sul de Moçambique.', category: 'Cultura moçambicana' },
  { word: 'Ilha de Moçambique', hint: 'Ilha histórica de Nampula classificada como Património Mundial da UNESCO.', category: 'Cultura moçambicana' },
  { word: 'Festival da Marrabenta', hint: 'Evento cultural moçambicano dedicado à música e dança popular.', category: 'Cultura moçambicana' },
  { word: 'Tchova', hint: 'Carrinho manual de duas rodas usado para transportar cargas.', category: 'Cultura moçambicana' },
  { word: 'Xima', hint: 'Preparação firme feita de farinha de milho ou mandioca, comum nas refeições.', category: 'Cultura moçambicana' },
  { word: 'Pande', hint: 'Cantor moçambicano conhecido por canções de marrabenta e pandza.', category: 'Cultura moçambicana' },
  { word: 'Neyma', hint: 'Cantora moçambicana conhecida por canções como “Maguiguana”.', category: 'Cultura moçambicana' },
  { word: 'Ziqo', hint: 'Cantor e produtor moçambicano associado ao pandza.', category: 'Cultura moçambicana' },
  { word: 'Mr Bow', hint: 'Cantor moçambicano de música popular.', category: 'Cultura moçambicana' },
  { word: 'Lizha James', hint: 'Cantora moçambicana de música popular.', category: 'Cultura moçambicana' },
  { word: 'Azagaia', hint: 'Rapper moçambicano conhecido pelas suas letras de intervenção social.', category: 'Cultura moçambicana' },
]

const geographyItems: GameItemContent[] = [
  { word: 'Monte Binga', hint: 'Ponto mais alto de Moçambique, na província de Manica.', category: 'Geografia' },
  { word: 'Rio Zambeze', hint: 'Grande rio africano que atravessa Moçambique e desagua no Índico.', category: 'Geografia' },
  { word: 'Rio Rovuma', hint: 'Rio que forma grande parte da fronteira entre Moçambique e a Tanzânia.', category: 'Geografia' },
  { word: 'Rio Limpopo', hint: 'Rio do sul de África que atravessa Moçambique antes de chegar ao Índico.', category: 'Geografia' },
  { word: 'Lago Niassa', hint: 'Grande lago africano também conhecido internacionalmente como lago Malawi.', category: 'Geografia' },
  { word: 'Maputo', hint: 'Capital e maior cidade de Moçambique.', category: 'Geografia' },
  { word: 'Beira', hint: 'Cidade portuária moçambicana situada na província de Sofala.', category: 'Geografia' },
  { word: 'Nampula', hint: 'Cidade do norte de Moçambique conhecida como capital do norte.', category: 'Geografia' },
  { word: 'Pemba', hint: 'Capital de Cabo Delgado, junto à baía com o mesmo nome.', category: 'Geografia' },
  { word: 'Tete', hint: 'Cidade moçambicana situada junto ao rio Zambeze.', category: 'Geografia' },
  { word: 'Cahora Bassa', hint: 'Barragem hidroeléctrica construída no rio Zambeze, em Tete.', category: 'Geografia' },
  { word: 'Arquipélago de Bazaruto', hint: 'Grupo de ilhas e parque marinho ao largo de Vilankulo.', category: 'Geografia' },
  { word: 'Ilhas Quirimbas', hint: 'Arquipélago de ilhas coralinas no litoral de Cabo Delgado.', category: 'Geografia' },
  { word: 'Parque Nacional da Gorongosa', hint: 'Área protegida de Sofala conhecida pela recuperação da vida selvagem.', category: 'Geografia' },
  { word: 'Oceano Índico', hint: 'Oceano que banha toda a costa oriental de Moçambique.', category: 'Geografia' },
  { word: 'Canal de Moçambique', hint: 'Braço do oceano Índico entre Moçambique e Madagáscar.', category: 'Geografia' },
  { word: 'Madagáscar', hint: 'Grande ilha africana situada a leste de Moçambique.', category: 'Geografia' },
  { word: 'Monte Kilimanjaro', hint: 'Montanha mais alta de África, localizada na Tanzânia.', category: 'Geografia' },
  { word: 'Deserto do Saara', hint: 'Maior deserto quente do mundo, no norte de África.', category: 'Geografia' },
  { word: 'Rio Nilo', hint: 'Rio africano que atravessa o Egipto e desagua no mar Mediterrâneo.', category: 'Geografia' },
  { word: 'Província de Niassa', hint: 'Província do norte de Moçambique, cuja capital é Lichinga.', category: 'Geografia' },
  { word: 'Província de Cabo Delgado', hint: 'Província do norte de Moçambique, cuja capital é Pemba.', category: 'Geografia' },
  { word: 'Província da Zambézia', hint: 'Província moçambicana cuja capital é Quelimane.', category: 'Geografia' },
  { word: 'Província de Sofala', hint: 'Província moçambicana cuja capital é a cidade da Beira.', category: 'Geografia' },
  { word: 'Província de Inhambane', hint: 'Província do sul de Moçambique cuja capital tem o mesmo nome.', category: 'Geografia' },
]

const historyItems: GameItemContent[] = [
  { word: 'Samora Machel', hint: 'Primeiro Presidente de Moçambique independente.', category: 'História e personalidades' },
  { word: 'Eduardo Mondlane', hint: 'Fundador e primeiro presidente da FRELIMO.', category: 'História e personalidades' },
  { word: 'Josina Machel', hint: 'Figura da luta de libertação moçambicana e defensora dos direitos das mulheres.', category: 'História e personalidades' },
  { word: 'Ngungunhane', hint: 'Último imperador de Gaza, capturado pelos portugueses em 1895.', category: 'História e personalidades' },
  { word: 'Rainha Njinga', hint: 'Soberana do Ndongo e da Matamba, conhecida pela resistência à expansão portuguesa.', category: 'História e personalidades' },
  { word: 'Nelson Mandela', hint: 'Líder sul-africano contra o apartheid e vencedor do Nobel da Paz.', category: 'História e personalidades' },
  { word: 'Julius Nyerere', hint: 'Primeiro Presidente da Tanzânia independente.', category: 'História e personalidades' },
  { word: 'Amílcar Cabral', hint: 'Líder da luta de libertação da Guiné-Bissau e de Cabo Verde.', category: 'História e personalidades' },
  { word: 'Mahatma Gandhi', hint: 'Líder indiano associado à resistência não violenta contra o domínio britânico.', category: 'História e personalidades' },
  { word: 'Wangari Maathai', hint: 'Ambientalista queniana e primeira mulher africana a receber o Nobel da Paz.', category: 'História e personalidades' },
  { word: 'Rainha Elizabeth I', hint: 'Monarca inglesa cujo reinado ficou conhecido como era isabelina.', category: 'História e personalidades' },
  { word: 'Cleópatra', hint: 'Última governante activa do Egipto ptolemaico.', category: 'História e personalidades' },
  { word: 'Albert Einstein', hint: 'Físico cuja teoria da relatividade mudou a compreensão do espaço e do tempo.', category: 'História e personalidades' },
  { word: 'Marie Curie', hint: 'Cientista pioneira da radioactividade e primeira mulher laureada com um Nobel.', category: 'História e personalidades' },
  { word: 'Steve Biko', hint: 'Activista sul-africano contra o apartheid, associado ao movimento da Consciência Negra.', category: 'História e personalidades' },
  { word: 'Lurdes Mutola', hint: 'Atleta moçambicana campeã olímpica dos 800 metros em Sydney 2000.', category: 'História e personalidades' },
  { word: 'Eusébio', hint: 'Futebolista nascido em Moçambique, vencedor da Bola de Ouro em 1965.', category: 'História e personalidades' },
  { word: 'Abel Xavier', hint: 'Futebolista moçambicano que representou a selecção portuguesa.', category: 'História e personalidades' },
  { word: 'Teresa Heinz', hint: 'Filantropa nascida em Moçambique e cidadã norte-americana.', category: 'História e personalidades' },
  { word: 'Graça Machel', hint: 'Educadora e defensora dos direitos das crianças, antiga primeira-dama de Moçambique e da África do Sul.', category: 'História e personalidades' },
  { word: 'Isaac Newton', hint: 'Físico e matemático inglês associado às leis do movimento e da gravitação.', category: 'História e personalidades' },
  { word: 'Rosa Parks', hint: 'Activista norte-americana dos direitos civis que recusou ceder o seu lugar num autocarro segregado.', category: 'História e personalidades' },
  { word: 'Martin Luther King Jr.', hint: 'Pastor e activista norte-americano dos direitos civis, conhecido pela defesa da resistência não violenta.', category: 'História e personalidades' },
  { word: 'Leonardo da Vinci', hint: 'Artista e inventor italiano do Renascimento, autor da Mona Lisa.', category: 'História e personalidades' },
  { word: 'Kwame Nkrumah', hint: 'Líder da independência do Gana e primeiro presidente do país.', category: 'História e personalidades' },
]

const foodNatureItems: GameItemContent[] = [
  { word: 'Matapa', hint: 'Prato moçambicano feito com folhas de mandioca, frequentemente com amendoim e coco.', category: 'Gastronomia e natureza' },
  { word: 'Chamuça', hint: 'Pastel triangular recheado, popular em Moçambique e no sul da Ásia.', category: 'Gastronomia e natureza' },
  { word: 'Mandioca', hint: 'Raiz tropical que pode ser cozida ou transformada em farinha.', category: 'Gastronomia e natureza' },
  { word: 'Amendoim', hint: 'Leguminosa muito usada em molhos e na preparação da matapa.', category: 'Gastronomia e natureza' },
  { word: 'Coco', hint: 'Fruto tropical com casca fibrosa, água e polpa branca.', category: 'Gastronomia e natureza' },
  { word: 'Frango à zambeziana', hint: 'Prato moçambicano de frango grelhado temperado com coco e limão.', category: 'Gastronomia e natureza' },
  { word: 'Badjia', hint: 'Bolinho frito de feijão-nhemba, vendido como petisco em Moçambique.', category: 'Gastronomia e natureza' },
  { word: 'Caril de amendoim', hint: 'Preparação cremosa em que o amendoim moído dá sabor ao molho.', category: 'Gastronomia e natureza' },
  { word: 'Maheu', hint: 'Bebida fermentada tradicional feita a partir de cereais.', category: 'Gastronomia e natureza' },
  { word: 'Baobá', hint: 'Árvore africana de tronco muito largo, capaz de armazenar água.', category: 'Gastronomia e natureza' },
  { word: 'Elefante-africano', hint: 'Maior animal terrestre actual, reconhecido pela tromba e pelas presas.', category: 'Gastronomia e natureza' },
  { word: 'Girafa', hint: 'Mamífero africano muito alto, com pescoço comprido e manchas.', category: 'Gastronomia e natureza' },
  { word: 'Flamingo', hint: 'Ave de pernas longas que costuma alimentar-se em águas pouco profundas.', category: 'Gastronomia e natureza' },
  { word: 'Tartaruga-marinha', hint: 'Réptil marinho que regressa a praias para pôr ovos.', category: 'Gastronomia e natureza' },
  { word: 'Golfinho', hint: 'Mamífero marinho conhecido pela ecolocalização e pelos saltos.', category: 'Gastronomia e natureza' },
  { word: 'Camaleão', hint: 'Réptil cujos olhos podem mover-se independentemente um do outro.', category: 'Gastronomia e natureza' },
  { word: 'Mangue', hint: 'Ecossistema costeiro de árvores adaptadas à água salgada e às marés.', category: 'Gastronomia e natureza' },
  { word: 'Ciclone tropical', hint: 'Sistema de tempestade intensa que pode atingir o litoral moçambicano.', category: 'Gastronomia e natureza' },
  { word: 'Coral', hint: 'Animal marinho que forma recifes e vive em colónias.', category: 'Gastronomia e natureza' },
  { word: 'Mangal', hint: 'Floresta costeira tropical formada sobretudo por árvores de mangue.', category: 'Gastronomia e natureza' },
  { word: 'Caju', hint: 'Fruto tropical cuja castanha é amplamente consumida em Moçambique.', category: 'Gastronomia e natureza' },
  { word: 'Piri-piri', hint: 'Pimenta pequena e muito picante usada para temperar alimentos.', category: 'Gastronomia e natureza' },
  { word: 'Feijão-nhemba', hint: 'Leguminosa também conhecida como feijão-frade, usada em várias receitas.', category: 'Gastronomia e natureza' },
  { word: 'Batata-doce', hint: 'Raiz comestível que pode ter polpa branca, amarela ou alaranjada.', category: 'Gastronomia e natureza' },
  { word: 'Tubarão-baleia', hint: 'Maior espécie de peixe conhecida, que se alimenta sobretudo por filtração.', category: 'Gastronomia e natureza' },
]

const scienceArtsSportItems: GameItemContent[] = [
  { word: 'Jazz', hint: 'Género musical que surgiu nos Estados Unidos e valoriza a improvisação.', category: 'Ciência, artes e desporto' },
  { word: 'Futebol', hint: 'Desporto colectivo em que duas equipas procuram marcar golos.', category: 'Ciência, artes e desporto' },
  { word: 'Natação', hint: 'Deslocação na água que também é uma modalidade olímpica.', category: 'Ciência, artes e desporto' },
  { word: 'Medalha olímpica', hint: 'Prémio atribuído aos atletas que alcançam os primeiros lugares nos Jogos Olímpicos.', category: 'Ciência, artes e desporto' },
  { word: 'Basquetebol', hint: 'Desporto em que os jogadores tentam lançar a bola dentro de um cesto elevado.', category: 'Ciência, artes e desporto' },
  { word: 'Árbitro', hint: 'Pessoa responsável por aplicar as regras durante uma competição.', category: 'Ciência, artes e desporto' },
  { word: 'Apito', hint: 'Pequeno instrumento que produz um som agudo quando alguém sopra nele.', category: 'Ciência, artes e desporto' },
  { word: 'Cinema', hint: 'Arte de contar histórias através de imagens em movimento.', category: 'Ciência, artes e desporto' },
  { word: 'Biblioteca', hint: 'Espaço onde se podem consultar e requisitar livros.', category: 'Ciência, artes e desporto' },
  { word: 'Teatro', hint: 'Arte de representar histórias ao vivo perante um público.', category: 'Ciência, artes e desporto' },
  { word: 'Fotografia', hint: 'Imagem criada ao registar a luz numa câmara ou noutro dispositivo.', category: 'Ciência, artes e desporto' },
  { word: 'Telescópio', hint: 'Instrumento que permite observar objectos muito distantes no céu.', category: 'Ciência, artes e desporto' },
  { word: 'Microscópio', hint: 'Instrumento que amplia objectos demasiado pequenos para o olho nu.', category: 'Ciência, artes e desporto' },
  { word: 'Electricidade', hint: 'Fenómeno físico associado à presença e ao movimento de cargas eléctricas.', category: 'Ciência, artes e desporto' },
  { word: 'Satélite', hint: 'Objecto que orbita um planeta; pode ser natural ou construído pelo ser humano.', category: 'Ciência, artes e desporto' },
  { word: 'Arco-íris', hint: 'Faixa de cores que pode surgir quando a luz solar atravessa gotas de água.', category: 'Ciência, artes e desporto' },
  { word: 'Vulcão', hint: 'Abertura na crosta terrestre por onde podem sair lava, gases e cinzas.', category: 'Ciência, artes e desporto' },
  { word: 'Bicicleta', hint: 'Veículo de duas rodas impulsionado por pedais.', category: 'Ciência, artes e desporto' },
  { word: 'Xadrez', hint: 'Jogo de estratégia disputado num tabuleiro de 64 casas.', category: 'Ciência, artes e desporto' },
  { word: 'Robótica', hint: 'Área tecnológica dedicada ao desenho, construção e programação de robôs.', category: 'Ciência, artes e desporto' },
  { word: 'Voleibol', hint: 'Desporto em que duas equipas fazem a bola passar por cima de uma rede.', category: 'Ciência, artes e desporto' },
  { word: 'Rugby', hint: 'Desporto colectivo jogado com uma bola oval e marcado por ensaios.', category: 'Ciência, artes e desporto' },
  { word: 'Atletismo', hint: 'Conjunto de modalidades que inclui corridas, saltos e lançamentos.', category: 'Ciência, artes e desporto' },
  { word: 'Química', hint: 'Ciência que estuda a composição, as propriedades e as transformações da matéria.', category: 'Ciência, artes e desporto' },
  { word: 'Escultura', hint: 'Arte de criar formas tridimensionais, por exemplo, em pedra, madeira ou metal.', category: 'Ciência, artes e desporto' },
]

const schoolItems: GameItemContent[] = [
  { word: 'Caderno', hint: 'Conjunto de folhas encadernadas usado para escrever apontamentos.', category: 'Escola' },
  { word: 'Lápis', hint: 'Instrumento de escrita com uma mina que pode ser apagada.', category: 'Escola' },
  { word: 'Régua', hint: 'Instrumento marcado com unidades usado para medir e traçar linhas.', category: 'Escola' },
  { word: 'Mochila escolar', hint: 'Saco com alças usado para transportar livros e material escolar.', category: 'Escola' },
  { word: 'Quadro negro', hint: 'Superfície escura onde se escreve com giz durante uma aula.', category: 'Escola' },
  { word: 'Giz', hint: 'Pequeno bastão usado para escrever num quadro negro.', category: 'Escola' },
  { word: 'Carteira escolar', hint: 'Mesa e assento usados por um aluno na sala de aula.', category: 'Escola' },
  { word: 'Apontador', hint: 'Pequeno objecto que afia a ponta de um lápis.', category: 'Escola' },
  { word: 'Borracha', hint: 'Material usado para apagar marcas de lápis no papel.', category: 'Escola' },
  { word: 'Compasso', hint: 'Instrumento articulado usado para desenhar círculos.', category: 'Escola' },
]

const professionItems: GameItemContent[] = [
  { word: 'Médico', hint: 'Profissional que diagnostica doenças e orienta tratamentos.', category: 'Profissões' },
  { word: 'Enfermeiro', hint: 'Profissional de saúde que presta cuidados a pessoas doentes.', category: 'Profissões' },
  { word: 'Professor', hint: 'Profissional que ensina e acompanha a aprendizagem dos alunos.', category: 'Profissões' },
  { word: 'Carpinteiro', hint: 'Profissional que trabalha madeira para construir ou reparar objectos.', category: 'Profissões' },
  { word: 'Pescador', hint: 'Profissional que captura peixe em rios, lagos ou no mar.', category: 'Profissões' },
  { word: 'Agricultor', hint: 'Profissional que cultiva a terra e produz alimentos.', category: 'Profissões' },
  { word: 'Mecânico', hint: 'Profissional que inspecciona e repara máquinas ou veículos.', category: 'Profissões' },
  { word: 'Bombeiro', hint: 'Profissional treinado para combater incêndios e prestar socorro.', category: 'Profissões' },
  { word: 'Cozinheiro', hint: 'Profissional que prepara refeições em casa ou numa cozinha comercial.', category: 'Profissões' },
  { word: 'Fotógrafo', hint: 'Profissional que cria imagens usando uma câmara.', category: 'Profissões' },
]

const homeItems: GameItemContent[] = [
  { word: 'Casa', hint: 'Lugar onde as pessoas vivem.', category: 'Casa' },
  { word: 'Porta', hint: 'Abertura por onde se entra numa casa.', category: 'Casa' },
  { word: 'Janela', hint: 'Abertura que deixa entrar luz e ar.', category: 'Casa' },
  { word: 'Sofá', hint: 'Assento estofado com lugar para mais de uma pessoa.', category: 'Casa' },
  { word: 'Mesa', hint: 'Móvel com uma superfície plana apoiada por pernas.', category: 'Casa' },
  { word: 'Cadeira', hint: 'Assento individual normalmente apoiado por quatro pernas.', category: 'Casa' },
  { word: 'Cama', hint: 'Móvel preparado para uma pessoa se deitar e dormir.', category: 'Casa' },
  { word: 'Almofada', hint: 'Peça macia usada para apoiar a cabeça ou as costas.', category: 'Casa' },
  { word: 'Frigorífico', hint: 'Electrodoméstico que mantém alimentos e bebidas frios.', category: 'Casa' },
  { word: 'Fogão', hint: 'Aparelho doméstico usado para cozinhar alimentos.', category: 'Casa' },
  { word: 'Torneira', hint: 'Dispositivo que controla a saída de água de um cano.', category: 'Casa' },
  { word: 'Vassoura', hint: 'Utensílio com cerdas usado para varrer o chão.', category: 'Casa' },
  { word: 'Balde', hint: 'Recipiente portátil com pega usado para transportar líquidos ou materiais.', category: 'Casa' },
]

const technologyItems: GameItemContent[] = [
  { word: 'Smartphone', hint: 'Telemóvel com ecrã táctil e acesso a aplicações e à Internet.', category: 'Tecnologia' },
  { word: 'Teclado', hint: 'Conjunto de teclas usado para introduzir texto num computador.', category: 'Tecnologia' },
  { word: 'Rato de computador', hint: 'Dispositivo apontador que move o cursor no ecrã.', category: 'Tecnologia' },
  { word: 'Monitor', hint: 'Ecrã que apresenta imagens e informação de um computador.', category: 'Tecnologia' },
  { word: 'Impressora', hint: 'Equipamento que transfere texto ou imagens digitais para papel.', category: 'Tecnologia' },
  { word: 'Router', hint: 'Equipamento que encaminha dados entre dispositivos e uma rede.', category: 'Tecnologia' },
  { word: 'Aplicação móvel', hint: 'Programa instalado num telemóvel para executar uma tarefa.', category: 'Tecnologia' },
  { word: 'Carregador', hint: 'Acessório que fornece energia eléctrica à bateria de um dispositivo.', category: 'Tecnologia' },
  { word: 'Painel solar', hint: 'Dispositivo que converte a luz do Sol em energia eléctrica ou térmica.', category: 'Tecnologia' },
  { word: 'GPS', hint: 'Sistema de satélites usado para calcular uma posição geográfica.', category: 'Tecnologia' },
]

const musicItems: GameItemContent[] = [
  { word: 'Guitarra', hint: 'Instrumento de cordas tocado com os dedos ou com uma palheta.', category: 'Música' },
  { word: 'Bateria', hint: 'Conjunto de tambores e pratos tocados com baquetas ou com as mãos.', category: 'Música' },
  { word: 'Piano', hint: 'Instrumento de teclado em que cada tecla acciona um martelo sobre uma corda.', category: 'Música' },
  { word: 'Tambor', hint: 'Instrumento de percussão em que uma membrana esticada é golpeada.', category: 'Música' },
  { word: 'Coro', hint: 'Grupo de pessoas que canta em conjunto.', category: 'Música' },
  { word: 'Canção', hint: 'Composição musical feita para ser cantada, geralmente com letra.', category: 'Música' },
  { word: 'Concerto', hint: 'Actuação musical apresentada ao vivo para um público.', category: 'Música' },
  { word: 'Microfone', hint: 'Dispositivo que capta a voz e a transforma num sinal eléctrico.', category: 'Música' },
  { word: 'Disco de vinil', hint: 'Suporte circular analógico que guarda som em sulcos.', category: 'Música' },
  { word: 'Ritmo', hint: 'Organização dos sons e das pausas no tempo musical.', category: 'Música' },
]

const sportItems: GameItemContent[] = [
  { word: 'Corrida', hint: 'Prova desportiva em que os participantes se deslocam a pé para chegar primeiro.', category: 'Desporto' },
  { word: 'Ciclismo', hint: 'Desporto praticado numa bicicleta em estrada, pista ou terreno irregular.', category: 'Desporto' },
  { word: 'Ténis', hint: 'Desporto em que os jogadores usam raquetes para enviar uma bola por cima de uma rede.', category: 'Desporto' },
  { word: 'Ginástica', hint: 'Modalidade que combina movimentos de força, equilíbrio e flexibilidade.', category: 'Desporto' },
  { word: 'Boxe', hint: 'Desporto de combate em que os atletas usam luvas e seguem regras específicas.', category: 'Desporto' },
  { word: 'Judo', hint: 'Arte marcial japonesa centrada em projecções e controlo do adversário.', category: 'Desporto' },
  { word: 'Surf', hint: 'Desporto em que se desliza sobre as ondas usando uma prancha.', category: 'Desporto' },
  { word: 'Escalada', hint: 'Actividade desportiva de subir paredes naturais ou artificiais.', category: 'Desporto' },
  { word: 'Maratona', hint: 'Prova de corrida de longa distância com cerca de 42 quilómetros.', category: 'Desporto' },
  { word: 'Treinador', hint: 'Pessoa que prepara atletas ou equipas para uma competição.', category: 'Desporto' },
]

const animalItems: GameItemContent[] = [
  { word: 'Gato', hint: 'Animal doméstico que mia.', category: 'Animais' },
  { word: 'Cão', hint: 'Animal doméstico que ladra.', category: 'Animais' },
  { word: 'Leão', hint: 'Felino social africano em que os machos adultos podem ter juba.', category: 'Animais' },
  { word: 'Zebra', hint: 'Equídeo africano conhecido pelas riscas pretas e brancas.', category: 'Animais' },
  { word: 'Hipopótamo', hint: 'Grande mamífero africano que passa muitas horas dentro de água.', category: 'Animais' },
  { word: 'Crocodilo', hint: 'Réptil de focinho comprido que vive em rios e outras zonas húmidas.', category: 'Animais' },
  { word: 'Rinoceronte', hint: 'Grande mamífero herbívoro com um ou dois cornos no focinho.', category: 'Animais' },
  { word: 'Búfalo', hint: 'Mamífero bovino robusto que vive em manadas em várias regiões africanas.', category: 'Animais' },
  { word: 'Avestruz', hint: 'Ave africana que não voa e pode correr a grande velocidade.', category: 'Animais' },
  { word: 'Macaco', hint: 'Animal que sobe às árvores.', category: 'Animais' },
  { word: 'Papagaio', hint: 'Ave de bico curvo, conhecida por imitar alguns sons.', category: 'Animais' },
  { word: 'Pinguim', hint: 'Ave marinha que não voa e usa as asas para nadar.', category: 'Animais' },
]

const foodItems: GameItemContent[] = [
  { word: 'Arroz', hint: 'Cereal cozido em água e servido como acompanhamento em muitas refeições.', category: 'Comida' },
  { word: 'Pão', hint: 'Alimento cozido no forno, geralmente feito de farinha, água e fermento.', category: 'Comida' },
  { word: 'Milho', hint: 'Cereal de espiga usado em farinha, papas e outros pratos.', category: 'Comida' },
  { word: 'Peixe', hint: 'Alimento proveniente de animais aquáticos, fresco ou conservado.', category: 'Comida' },
  { word: 'Feijão', hint: 'Leguminosa consumida em grão e usada em vários pratos.', category: 'Comida' },
  { word: 'Tomate', hint: 'Fruto vermelho usado em saladas, molhos e guisados.', category: 'Comida' },
  { word: 'Banana', hint: 'Fruto alongado de casca amarela ou verde, conforme a variedade e maturação.', category: 'Comida' },
  { word: 'Manga', hint: 'Fruto tropical de polpa doce e caroço grande e achatado.', category: 'Comida' },
  { word: 'Sopa', hint: 'Preparação líquida ou cremosa feita com água ou caldo e outros ingredientes.', category: 'Comida' },
  { word: 'Batata', hint: 'Tubérculo comestível que pode ser cozido, assado ou frito.', category: 'Comida' },
]

const natureItems: GameItemContent[] = [
  { word: 'Terra', hint: 'Chão onde crescem as plantas.', category: 'Natureza' },
  { word: 'Água', hint: 'Líquido que bebemos.', category: 'Natureza' },
  { word: 'Sol', hint: 'Estrela que ilumina o dia.', category: 'Natureza' },
  { word: 'Lua', hint: 'Astro que vemos no céu à noite.', category: 'Natureza' },
  { word: 'Pedra', hint: 'Pedaço duro que se encontra no chão.', category: 'Natureza' },
  { word: 'Floresta', hint: 'Área extensa dominada por árvores e outras formas de vegetação.', category: 'Natureza' },
  { word: 'Savana', hint: 'Paisagem tropical com ervas, árvores dispersas e estação seca marcada.', category: 'Natureza' },
  { word: 'Cascata', hint: 'Queda de água de um rio ao atravessar um desnível rochoso.', category: 'Natureza' },
  { word: 'Praia', hint: 'Faixa de areia ou pedras junto ao mar, lago ou rio.', category: 'Natureza' },
  { word: 'Montanha', hint: 'Elevação natural do terreno que se destaca na paisagem.', category: 'Natureza' },
  { word: 'Vale', hint: 'Área baixa de terreno situada entre colinas ou montanhas.', category: 'Natureza' },
  { word: 'Estuário', hint: 'Zona onde um rio encontra o mar e a água doce se mistura com a salgada.', category: 'Natureza' },
  { word: 'Nascente', hint: 'Ponto onde a água emerge naturalmente e pode dar origem a um curso de água.', category: 'Natureza' },
  { word: 'Gruta', hint: 'Cavidade natural no interior de uma rocha ou montanha.', category: 'Natureza' },
  { word: 'Relâmpago', hint: 'Clarão produzido por uma descarga eléctrica durante uma tempestade.', category: 'Natureza' },
]

const travelItems: GameItemContent[] = [
  { word: 'Carro', hint: 'Veículo com rodas usado na estrada.', category: 'Viagens' },
  { word: 'Aeroporto', hint: 'Local com pistas e instalações para a chegada e partida de aviões.', category: 'Viagens' },
  { word: 'Comboio', hint: 'Meio de transporte composto por carruagens que circulam sobre carris.', category: 'Viagens' },
  { word: 'Autocarro', hint: 'Veículo rodoviário colectivo usado para transportar passageiros.', category: 'Viagens' },
  { word: 'Passaporte', hint: 'Documento de viagem usado para identificar o seu titular além-fronteiras.', category: 'Viagens' },
  { word: 'Mapa', hint: 'Representação gráfica de lugares, estradas ou características de uma região.', category: 'Viagens' },
  { word: 'Hotel', hint: 'Estabelecimento que oferece alojamento temporário a viajantes.', category: 'Viagens' },
  { word: 'Porto', hint: 'Instalação costeira onde embarcações podem atracar e transportar carga ou passageiros.', category: 'Viagens' },
  { word: 'Estrada', hint: 'Via terrestre preparada para a circulação de veículos.', category: 'Viagens' },
  { word: 'Bilhete de viagem', hint: 'Comprovativo que permite embarcar num meio de transporte.', category: 'Viagens' },
  { word: 'Bagagem', hint: 'Conjunto de malas e objectos levados por alguém numa viagem.', category: 'Viagens' },
]

const cinemaItems: GameItemContent[] = [
  { word: 'Realizador', hint: 'Pessoa que orienta a criação artística e técnica de um filme.', category: 'Cinema' },
  { word: 'Guião', hint: 'Texto que descreve diálogos e acções de uma obra audiovisual.', category: 'Cinema' },
  { word: 'Actor', hint: 'Artista que interpreta uma personagem numa peça ou produção audiovisual.', category: 'Cinema' },
  { word: 'Protagonista', hint: 'Personagem principal de uma história.', category: 'Cinema' },
  { word: 'Banda sonora', hint: 'Conjunto de músicas e sons usados numa obra audiovisual.', category: 'Cinema' },
  { word: 'Dobragem', hint: 'Substituição das vozes originais de uma obra por vozes noutra língua.', category: 'Cinema' },
  { word: 'Legendas', hint: 'Texto apresentado no ecrã para transcrever ou traduzir diálogos.', category: 'Cinema' },
  { word: 'Documentário', hint: 'Filme que apresenta pessoas, acontecimentos ou temas reais.', category: 'Cinema' },
  { word: 'Animação', hint: 'Técnica que cria a ilusão de movimento a partir de imagens sucessivas.', category: 'Cinema' },
  { word: 'Estreia', hint: 'Primeira apresentação pública de um filme ou espectáculo.', category: 'Cinema' },
]

const legacyItemPools = [
  identifyItems(cultureItems),
  identifyItems(geographyItems),
  identifyItems(historyItems),
  identifyItems(foodNatureItems),
  identifyItems(scienceArtsSportItems),
] as const
const itemPools: GameItem[][] = [
  ...legacyItemPools,
  ...[
    schoolItems,
    professionItems,
    homeItems,
    technologyItems,
    musicItems,
    sportItems,
    animalItems,
    foodItems,
    natureItems,
    travelItems,
    cinemaItems,
  ].map(identifyItems),
]
const preservedCardCount = 5000
const cardCount = 52000

function createCard(items: GameItem[], id: string): GameCard {
  if (items.some((item) => !item)) throw new Error(`Não foi possível compor a carta "${id}".`)
  return { id, category: mixCategory, items: items as GameCard['items'] }
}

function createCards(): GameCard[] {
  let state = 0x4d415841
  const random = (): number => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }

  const seenCombinations = new Set<string>()
  const cards: GameCard[] = []
  const legacyCardCount = Math.min(...legacyItemPools.map((pool) => pool.length))
  for (let index = 0; index < legacyCardCount; index++) {
    const items = legacyItemPools.map((pool) => pool[index]!)
    seenCombinations.add(items.map((item) => item.id).sort().join('|'))
    cards.push(createCard(items, `maxaka-${String(index + 1).padStart(4, '0')}`))
  }

  while (cards.length < preservedCardCount) {
    const indexes = legacyItemPools.map((pool) => Math.floor(random() * pool.length))
    const items = legacyItemPools.map((pool, poolIndex) => pool[indexes[poolIndex]!]!)
    const combination = items.map((item) => item.id).sort().join('|')
    if (seenCombinations.has(combination)) continue
    seenCombinations.add(combination)
    cards.push({
      ...createCard(items, `maxaka-v2-${indexes.map((index) => String(index).padStart(2, '0')).join('')}`),
    })
  }

  while (cards.length < cardCount) {
    const poolIndexes = Array.from({ length: itemPools.length }, (_, index) => index)
    for (let index = poolIndexes.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      ;[poolIndexes[index], poolIndexes[other]] = [poolIndexes[other]!, poolIndexes[index]!]
    }
    const items = poolIndexes.slice(0, 5).map((poolIndex) => {
      const pool = itemPools[poolIndex]!
      return pool[Math.floor(random() * pool.length)]!
    })
    if (new Set(items.map((item) => item.id)).size !== 5) continue
    const combination = items.map((item) => item.id).sort().join('|')
    if (seenCombinations.has(combination)) continue
    seenCombinations.add(combination)
    const cardNumber = cards.length - preservedCardCount + 1
    cards.push(createCard(items, `maxaka-v3-${String(cardNumber).padStart(5, '0')}`))
  }
  return cards
}

export const localCards: GameCard[] = createCards()
const seenCombinations = new Set(localCards.map((card) => card.items.map((item) => item.id).sort().join('|')))

for (const sourceCard of supplementalCatalog.cards) {
  const categories = sourceCard.category.replace(/^Mistura:\s*/u, '').split(' · ')
  if (sourceCard.items.length !== 5 || categories.length !== 5 || new Set(categories).size !== 5) {
    throw new Error(`A carta anexada "${sourceCard.id}" precisa de cinco itens e cinco categorias distintas.`)
  }
  const items = sourceCard.items.map((item, index) => ({
    id: `item-${canonicalGameContentName(item.word).replace(/\s+/gu, '-')}`,
    word: item.word,
    hint: item.hint,
    category: categories[index]!,
  }))
  if (new Set(items.map((item) => item.id)).size !== 5) continue
  const combination = items.map((item) => item.id).sort().join('|')
  if (seenCombinations.has(combination)) continue
  seenCombinations.add(combination)
  localCards.push({
    id: `maxaka-supplemental-${sourceCard.id.replace(/^maxaka-/u, '')}`,
    category: mixCategory,
    items: items as GameCard['items'],
  })
}

export function validateCatalog(cards: readonly GameCard[] = localCards): void {
  const itemsByName = new Map<string, GameItem>()
  const itemsById = new Map<string, GameItem>()

  for (const card of cards) {
    if (card.items.length !== 5) throw new Error(`A carta "${card.id}" não tem exactamente cinco itens.`)
    if (new Set(card.items.map((item) => item.id)).size !== 5) throw new Error(`A carta "${card.id}" repete um item.`)
    if (new Set(card.items.map((item) => item.category)).size !== 5) throw new Error(`A carta "${card.id}" não combina cinco categorias.`)

    for (const item of card.items) {
      const knownName = canonicalGameContentName(item.word)
      const previous = itemsByName.get(knownName)
      if (previous && previous.id !== item.id) throw new Error(`Conteúdo duplicado no catálogo: "${previous.word}" e "${item.word}".`)
      const previousId = itemsById.get(item.id)
      if (previousId && canonicalGameContentName(previousId.word) !== knownName) throw new Error(`O identificador "${item.id}" está atribuído a vários conteúdos.`)
      itemsByName.set(knownName, item)
      itemsById.set(item.id, item)
    }
  }

  const cardIds = new Set<string>()
  const combinations = new Set<string>()
  for (const card of cards) {
    if (cardIds.has(card.id)) throw new Error(`Identificador de carta duplicado: "${card.id}".`)
    cardIds.add(card.id)
    const combination = card.items.map((item) => item.id).sort().join('|')
    if (combinations.has(combination)) throw new Error(`Combinação de conteúdos repetida na carta "${card.id}".`)
    combinations.add(combination)
  }
}

validateCatalog()

export function getCardPoolSizes(): number[] {
  return itemPools.map((pool) => pool.length)
}

export function getContentItemCount(): number {
  return new Set(localCards.flatMap((card) => card.items.map((item) => item.id))).size
}
