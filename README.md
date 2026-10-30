# MAXAKA

Jogo web de palavras em React, TypeScript e Vite. Inclui partidas locais jogáveis e um modo online com salas, equipas, bots, chat e persistência MySQL.

## Colocar online

O GitHub guarda o código e executa a validação automática. Para as salas online, o processo Node.js precisa de uma base de dados MySQL; Redis é opcional para uma única instância. A aplicação Node também serve o frontend Vite construído. O áudio usa WebRTC ponto a ponto (P2P), sem worker mediasoup nem portas de mídia no servidor.

### Hostinger Node.js Web App

1. Liga a aplicação ao repositório GitHub e à branch `main`, com Node.js 22 e npm.
2. Usa a raiz do repositório como diretório da aplicação, `npm ci` para instalar, `npm run build` como comando de construção e `npm run start:server` como comando de inicialização. O servidor Node escuta na porta `PORT` fornecida pela plataforma e em `0.0.0.0`; também serve os ficheiros da pasta `dist`, por isso não configures o domínio como um site estático separado.
3. Cria primeiro uma base de dados MySQL no hPanel e um utilizador com permissões para criar/alterar tabelas e ler/escrever nessa base. Define no ambiente da aplicação `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` e `CLIENT_ORIGIN` com os valores apresentados pela Hostinger e a origem HTTPS exacta do domínio. Não uses `127.0.0.1` como `MYSQL_HOST` sem confirmação da Hostinger. Para uma única instância, deixa `REDIS_URL` vazio.
4. O HTTPS é necessário para o navegador permitir o microfone. O áudio P2P usa STUN público por predefinição; algumas redes exigem um serviço TURN externo, configurado no servidor com `MEDIA_TURN_URLS` e `MEDIA_TURN_SHARED_SECRET`.

O host ainda precisa permitir um processo Node.js persistente, WebSockets e acesso de saída à Internet. O modo P2P limita a chamada a seis participantes por sala e não garante ligação em redes restritivas sem TURN. Não há vídeo nesta versão.

Mantém o frontend e o backend no mesmo domínio quando possível; nesse caso deixa `VITE_SERVER_URL` vazio. Se o frontend estiver num domínio separado, define `VITE_SERVER_URL` no ambiente de **build** com a origem pública do backend (por exemplo, `https://api.exemplo.com`) e `CLIENT_ORIGIN` no backend com a origem exacta do frontend. Para o frontend público do MAXAKA, a build usa `https://api.maxaka.com` como destino por predefinição quando `VITE_SERVER_URL` não está definido. Volta a construir e publicar o frontend depois de alterar `VITE_SERVER_URL`.

Depois do deploy, testa `https://o-teu-dominio/health`: uma resposta `200` com `{"status":"ok","database":"ok"}` confirma que o processo Node e a ligação MySQL estão operacionais. Uma resposta `503` com `database: "unavailable"` indica que deves verificar as credenciais, o host/porta e as permissões MySQL nos registos da aplicação. `https://o-teu-dominio/health/live` verifica apenas se o processo está a responder. Se qualquer um destes endereços devolver `404`, o domínio ainda não está encaminhado para esta aplicação Node ou o deploy não está a executar o comando de arranque correcto; corrige a associação do domínio no hPanel antes de investigar a base de dados. O proxy também tem de permitir WebSockets para as salas online.

### VPS com Docker Compose

Também é possível usar um VPS Linux com Docker Engine e Docker Compose v2. Aponta o DNS do domínio para o IPv4 público, cria `.env.production` a partir de `.env.production.example` e substitui os valores de exemplo. `PUBLIC_URL` é o domínio servido pelo Caddy; `CLIENT_ORIGIN` é a origem HTTPS do frontend; `VITE_SERVER_URL` é a origem HTTPS pública do Socket.IO, incorporada no frontend durante o build. Se frontend e backend estiverem no mesmo domínio, `PUBLIC_URL` e `CLIENT_ORIGIN` coincidem e `VITE_SERVER_URL` pode ficar vazio. Gera palavras-passe independentes para MySQL e Redis. Permite TCP 80/443 e UDP 443 para o Caddy/HTTP3; não é necessário abrir a antiga gama RTP do mediasoup.

Para manter o frontend na hospedagem existente e usar o VPS apenas como backend, cria um registo DNS `A` para `api` apontando ao IPv4 do VPS. No `.env.production` do VPS, define `PUBLIC_URL=https://api.teudominio`, `CLIENT_ORIGIN=https://teudominio` e `VITE_SERVER_URL=https://api.teudominio`; depois reconstrói e inicia os serviços. O Caddy obtém HTTPS automaticamente quando o DNS está propagado e as portas TCP 80 e 443 estão acessíveis. Na hospedagem do frontend, define também `VITE_SERVER_URL=https://api.teudominio` no ambiente de build e publica novamente o frontend. Não alteres o registo DNS raiz (`@`) se quiseres manter o site atual nessa hospedagem.

Inicia a aplicação:

   ```sh
   docker compose --env-file .env.production up --build -d
   docker compose ps
   docker compose logs -f server
   ```

O Compose inicia o site, backend, MySQL e Redis; guarda os dados persistentes em volumes Docker e aplica as migrações MySQL no primeiro arranque. Não publiques as portas MySQL ou Redis na Internet. Faz cópias de segurança regulares dos volumes/bancos de dados antes de atualizações.

As chamadas de áudio usam WebRTC P2P. Em algumas redes será necessário configurar um serviço TURN externo. Esta instalação é de uma instância de jogo; Redis está incluído, mas não torna o estado das partidas replicado nem garante capacidade para 1.000 pessoas.

O workflow `.github/workflows/ci.yml` compila e testa o projeto e constrói ambas as imagens Docker em cada push para `main`/`master` e em pull requests. O workflow não publica as imagens nem liga ao teu servidor automaticamente.

## Executar o modo local

Requer Node.js 20.19+ ou 22.12+.

```sh
npm install
npm run dev
```

## Executar com salas online

O modo online requer MySQL 8.0 ou compatível. Cria primeiro a base de dados:

```sql
CREATE DATABASE maxaka CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Copia `.env.example` para `.env` (em PowerShell: `Copy-Item .env.example .env`) e configura `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` e `MYSQL_PASSWORD`. O utilizador MySQL precisa de permissões para criar e alterar tabelas, bem como ler e escrever dados. Depois inicia o frontend e o backend:

```sh
npm run dev:full
```

O backend aplica as migrações e sincroniza o catálogo para MySQL ao arrancar. O catálogo base é combinado com as 15.000 cartas do JSON complementar anexado; a importação preserva os itens e as cinco categorias por carta, atribui IDs próprios e descarta combinações que já existam. O catálogo contém 29.982 combinações candidatas, mas cada baralho de partida é montado e embaralhado uma vez sem reutilizar nenhum item: os cinco conteúdos de uma carta não aparecem em nenhuma outra carta daquela partida. No modo online, o MySQL reserva cada conteúdo globalmente, inclusive entre equipes, salas, partidas e reconexões; um bloqueio serializa reservas concorrentes e o histórico sobrevive a reinícios. Nas partidas locais, o navegador guarda os conteúdos usados. Quando não houver cartas com cinco conteúdos inéditos, a distribuição pára sem criar um novo ciclo automaticamente.

As 29.982 combinações candidatas usam os conteúdos anexados e o catálogo base. Como cada conteúdo é consumido no máximo uma vez, o número de turnos disponíveis é limitado pelo número de termos inéditos divididos por cinco, não pelas combinações possíveis. Para ampliar as campanhas, é necessário validar e adicionar mais conteúdos diferentes. O histórico local é específico a cada navegador e não é sincronizado com o histórico online. Em alternativa, inicia `npm run dev` e `npm run dev:server` em terminais separados. Para outro endereço do frontend, configura também `CLIENT_ORIGIN`. `HOST_RECONNECT_GRACE_MS` controla durante quanto tempo (1–300 segundos; predefinição 20 segundos) uma sala espera pela reconexão do anfitrião após uma desconexão inesperada.

Executa `npm test` para os testes do catálogo e do motor. Com MySQL configurado e as migrações aplicadas, `npm run test:db` testa a persistência entre ligações e a rejeição concorrente de uma reserva duplicada.

As salas aceitam entre 2 e 5 equipas com 2 a 6 participantes por equipa; o anfitrião pode adicionar bots. Cada turno fica à espera do jogador designado carregar em START; só então o servidor inicia os 30 segundos. A equipa activa recebe apenas as pistas e o jogador que dá as pistas vê as respostas; as equipas adversárias recebem a carta completa para acompanhar a ronda. O servidor controla turnos, cronómetro, validação de acertos, chat, posições oficiais do tabuleiro e gravação dos resultados agregados. Nenhum conteúdo online volta a ser atribuído depois de reservado, nem a outra equipe, partida, sala ou instância. O tabuleiro inclui início, percurso numerado e chegada; as peças avançam com base no estado confirmado pelo servidor e cada navegador anima os passos localmente. Se o anfitrião sair voluntariamente, a sala é encerrada para todos; numa desconexão inesperada, há um período de tolerância para reconexão e, depois, a sala é encerrada.

### Escalar para várias instâncias

Sem Redis, o backend continua a funcionar numa única instância. Para distribuir salas por várias instâncias, configura em todas o mesmo `REDIS_URL` e a mesma `CLIENT_ORIGIN`; em cada instância define `INSTANCE_PUBLIC_URL` com um endereço HTTP(S) único e diretamente alcançável pelos navegadores. O Redis mantém a localização e a concessão temporária de cada sala e o adaptador Socket.IO partilha eventos. Os participantes que chegam a outra instância são encaminhados para a instância que detém a sala. Usa um balanceador de carga para as ligações iniciais, TLS/HTTPS, Redis e MySQL geridos/monitorizados e instâncias de aplicação separadas.

O estado autoritativo da partida permanece na memória da instância proprietária. Assim, esta arquitetura distribui salas entre instâncias, mas não replica uma partida nem faz failover transparente se a instância proprietária cair; a concessão expira e a sala é encerrada quando alguém tenta voltar a entrar. Um encerramento normal também encerra as salas daquela instância. As chamadas P2P não passam pelo servidor de mídia; uma instância Socket.IO única ainda é necessária para sinalização. A meta de 1.000 ligações simultâneas ainda precisa de um ensaio de carga no ambiente e na infraestrutura de produção; não é uma capacidade garantida apenas por instalar Redis.

Define `MYSQL_CONNECTION_LIMIT` e `MYSQL_QUEUE_LIMIT` por instância para limitar ligações e pedidos em espera; dimensiona o limite total do MySQL pela soma de todas as instâncias e monitoriza recusas/latências. A aplicação usa um bloqueio MySQL para impedir que instâncias iniciadas em paralelo executem as migrações ao mesmo tempo.

Com as instâncias e o Redis já em execução, mede ligações e latências no PowerShell:

```powershell
$env:LOAD_SERVER_URLS = 'https://node-1.example,https://node-2.example'
$env:LOAD_USERS = '1000'
$env:LOAD_ROOM_SIZE = '20'
npm.cmd run test:load:online
```

O ensaio mantém as ligações abertas, distribui participantes por salas e segue os redirecionamentos; não testa mídia WebRTC nem substitui um teste com carga realista de partidas.

### Chamadas de áudio nas salas

As chamadas são opcionais, apenas de áudio e ponto a ponto entre navegadores; não usam mediasoup nem exigem portas RTP abertas no servidor da aplicação. HTTPS é necessário para acesso ao microfone. A chamada suporta até seis pessoas por sala, pois cada navegador envia áudio diretamente aos restantes participantes.

Por predefinição, a aplicação usa STUN público para tentar estabelecer a ligação direta. Algumas redes com NAT restritivo, firewalls ou bloqueios UDP precisam de um servidor TURN externo. Para o usar, configura `MEDIA_TURN_URLS` (URLs `turn:`/`turns:` separadas por vírgulas) e `MEDIA_TURN_SHARED_SECRET` no backend; o servidor emite credenciais temporárias com validade de duas horas. Mantém o segredo apenas no servidor. Sem um TURN acessível, não é possível garantir chamadas em todas as redes. O anfitrião controla a permissão de áudio e cada pessoa decide quando ativa o próprio microfone.

Não são necessárias contas: perfis são temporários e eliminados no fim da partida ou quando a instância proprietária encerra a sala. Sem Redis, esta configuração é para uma única instância do servidor.

## Personagens e avatares

O perfil disponibiliza uma galeria responsiva com seis categorias de emojis. A escolha é validada pelo servidor, guardada no registo temporário do jogador no MySQL durante a sala e conservada localmente no dispositivo para visitantes. Sem contas, a escolha local não sincroniza entre dispositivos. O avatar aparece na lista da sala, no chat e junto às equipas durante a partida; não altera a cor nem a posição da peça da equipa.

## Tipografia

O MAXAKA carrega localmente as famílias variáveis Inter e Cascadia Code através dos pacotes Fontsource, ambas sob a licença SIL Open Font License 1.1. Inter mantém a função da fonte principal e Cascadia Code a função monoespaçada; os ficheiros WOFF2 são servidos pela própria aplicação, sem depender de serviços externos nem de fontes instaladas no dispositivo.

## Validar

```sh
npm run build
npm test
npm run lint
```

Os testes cobrem as regras do motor local, o catálogo de avatares e a geração de credenciais temporárias para TURN. A compilação verifica também os tipos do servidor.

## Funcionalidades e regras

- Partidas locais e online, com cartas originais em português e cinco itens por carta.
- Nas equipas mistas, os papéis alternam entre a pessoa a adivinhar pistas do bot e a dar pistas à equipa.
- O anfitrião escolhe antes da partida se as pistas ficam activadas; por predefinição estão desactivadas e, quando activadas, cada pessoa pode carregá-las durante a sua vez.
- Cronómetro de 30 segundos, acerto, passagem de item, avanço de uma casa e vitória ao alcançar a casa 30.
- Falar, escrever e fazer mímica são permitidos. Quem recebe a carta confirma os acertos.
- Os bots usam simulação simples; não são um modelo de IA.
- Chamadas de áudio P2P opcionais nas salas online, limitadas a seis participantes; não inclui vídeo e pode exigir um serviço TURN externo.
- A secção “Apoiar o MAXAKA” apresenta opções de transferência manual e não confirma pagamentos automaticamente.
- A secção “Suporte” reúne contacto por WhatsApp/telefone, FAQ e um formulário que apenas prepara uma mensagem para o WhatsApp; não cria tickets nem envia anexos automaticamente.
