# MAXAKA

Jogo web de palavras em React, TypeScript e Vite. Inclui partidas locais jogáveis e um modo online com salas, equipas, bots, chat e persistência MySQL.

## Colocar online

O GitHub guarda o código e executa a validação automática; o site completo precisa de um servidor Linux com Docker porque as salas online, o MySQL, o Redis e as chamadas mediasoup não funcionam no GitHub Pages. O projeto inclui um `Dockerfile`, um `docker-compose.yml` para uma instalação de servidor único e GitHub Actions para validar as alterações.

1. Cria um repositório no GitHub e envia o conteúdo desta pasta. Não envies `.env`, `.env.production` nem palavras-passe.
2. Usa um servidor Linux com Docker Engine e Docker Compose v2. Aponta o DNS do teu domínio para o endereço IPv4 público do servidor.
3. No servidor, clona o repositório, cria `.env.production` a partir de `.env.production.example` e substitui todos os valores de exemplo. Define `PUBLIC_URL` com o domínio HTTPS final e `MEDIA_ANNOUNCED_ADDRESS` com o IPv4 público do servidor. Gera palavras-passe independentes com `openssl rand -hex 32`; usa também uma password hexadecimal para Redis, para manter o respetivo URL válido.
4. Permite no firewall TCP 80 e 443, UDP 443 e TCP/UDP na gama `40000–49999`. O Caddy obtém e renova o certificado HTTPS automaticamente quando o DNS e as portas 80/443 estão corretos.
5. Inicia a aplicação:

   ```sh
   docker compose --env-file .env.production up --build -d
   docker compose ps
   docker compose logs -f server
   ```

O Compose inicia o site, backend, MySQL e Redis; guarda os dados persistentes em volumes Docker e aplica as migrações MySQL no primeiro arranque. Não publiques as portas MySQL ou Redis na Internet. Faz cópias de segurança regulares dos volumes/bancos de dados antes de atualizações.

As chamadas de áudio/vídeo exigem que a gama de mídia esteja permitida no firewall e que `MEDIA_ANNOUNCED_ADDRESS` seja alcançável pelos clientes. Em algumas redes será necessário configurar TURN. Esta instalação é de uma instância de jogo; Redis está incluído, mas não torna o estado das partidas replicado nem garante capacidade para 1.000 pessoas.

O workflow `.github/workflows/ci.yml` compila e testa o projeto e constrói ambas as imagens Docker em cada push para `main`/`master` e em pull requests. O workflow não publica as imagens nem liga ao teu servidor automaticamente.

## Executar o modo local

Requer Node.js 20.19+ ou 22.12+.

```sh
npm install
npm run dev
```

## Executar com salas online

O modo online requer MySQL 8.0 ou compatível. Cria primeiro a base de dados:

O `.npmrc` do projeto define Meson 1.6.1 para os scripts Node executados pelo npm. Isto permite que o `mediasoup` compile o worker em ambientes Linux com Python anterior a 3.10, desde que o ambiente também tenha Python 3.7 ou superior, compilador C/C++ e `pkg-config`. A versão pode ser substituída definindo `MESON_VERSION` no ambiente de build. Para áudio e vídeo em produção, confirma que o host permite executar o worker e abrir as portas RTP configuradas.

```sql
CREATE DATABASE maxaka CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Copia `.env.example` para `.env` (em PowerShell: `Copy-Item .env.example .env`) e configura `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` e `MYSQL_PASSWORD`. O utilizador MySQL precisa de permissões para criar e alterar tabelas, bem como ler e escrever dados. Depois inicia o frontend e o backend:

```sh
npm run dev:full
```

O backend aplica as migrações e carrega as cartas iniciais na primeira execução. Em alternativa, inicia `npm run dev` e `npm run dev:server` em terminais separados. Para outro endereço do frontend, configura também `CLIENT_ORIGIN`. `HOST_RECONNECT_GRACE_MS` controla durante quanto tempo (1–300 segundos; predefinição 20 segundos) uma sala espera pela reconexão do anfitrião após uma desconexão inesperada.

As salas aceitam entre 2 e 5 equipas com 2 a 6 participantes por equipa; o anfitrião pode adicionar bots. O servidor controla turnos, cronómetro, validação de acertos, chat, posições oficiais do tabuleiro e gravação dos resultados agregados. O tabuleiro inclui início, percurso numerado e chegada; as peças avançam com base no estado confirmado pelo servidor e cada navegador anima os passos localmente. Se o anfitrião sair voluntariamente, a sala é encerrada para todos; numa desconexão inesperada, há um período de tolerância para reconexão e, depois, a sala é encerrada.

### Escalar para várias instâncias

Sem Redis, o backend continua a funcionar numa única instância. Para distribuir salas por várias instâncias, configura em todas o mesmo `REDIS_URL` e a mesma `CLIENT_ORIGIN`; em cada instância define `INSTANCE_PUBLIC_URL` com um endereço HTTP(S) único e diretamente alcançável pelos navegadores. O Redis mantém a localização e a concessão temporária de cada sala e o adaptador Socket.IO partilha eventos. Os participantes que chegam a outra instância são encaminhados para a instância que detém a sala. Usa um balanceador de carga para as ligações iniciais, TLS/HTTPS, Redis e MySQL geridos/monitorizados e instâncias de aplicação separadas.

O estado autoritativo da partida e os workers mediasoup permanecem na memória da instância proprietária. Assim, esta arquitetura distribui salas entre instâncias, mas não replica uma partida nem faz failover transparente se a instância proprietária cair; a concessão expira e a sala é encerrada quando alguém tenta voltar a entrar. Um encerramento normal também encerra as salas daquela instância. Configura `MEDIA_ANNOUNCED_ADDRESS` e as portas RTP para cada nó de mídia, permitindo a gama no firewall. A meta de 1.000 ligações simultâneas ainda precisa de um ensaio de carga no ambiente e na infraestrutura de produção; não é uma capacidade garantida apenas por instalar Redis.

Define `MYSQL_CONNECTION_LIMIT` e `MYSQL_QUEUE_LIMIT` por instância para limitar ligações e pedidos em espera; dimensiona o limite total do MySQL pela soma de todas as instâncias e monitoriza recusas/latências. A aplicação usa um bloqueio MySQL para impedir que instâncias iniciadas em paralelo executem as migrações ao mesmo tempo.

Com as instâncias e o Redis já em execução, mede ligações e latências no PowerShell:

```powershell
$env:LOAD_SERVER_URLS = 'https://node-1.example,https://node-2.example'
$env:LOAD_USERS = '1000'
$env:LOAD_ROOM_SIZE = '20'
npm.cmd run test:load:online
```

O ensaio mantém as ligações abertas, distribui participantes por salas e segue os redirecionamentos; não testa mídia WebRTC nem substitui um teste com carga realista de partidas.

### Áudio e vídeo nas salas

As chamadas são opcionais e usam mediasoup como SFU. Instala as dependências num host compatível (Node.js 22 ou superior; no Windows é necessário MSVC com suporte C++17) para obter o worker nativo. Na rede local, a configuração de exemplo usa `127.0.0.1`; para produção, define `MEDIA_ANNOUNCED_ADDRESS` com o endereço público alcançável pelos jogadores, permite tráfego UDP/TCP na gama `MEDIA_RTC_MIN_PORT`–`MEDIA_RTC_MAX_PORT` e configura HTTPS no frontend para acesso a câmara/microfone fora de localhost. O backend aplica também a migração `002_room_communication_settings.sql`; só o anfitrião pode mudar as permissões e essas alterações ficam bloqueadas quando a partida começa.

Para redes que exigem relay, configura um servidor coturn com autenticação REST e define `MEDIA_TURN_URLS` (URLs `turn:`/`turns:` separadas por vírgulas) e `MEDIA_TURN_SHARED_SECRET`. O servidor emite credenciais TURN temporárias com validade de duas horas; mantém o segredo apenas no servidor. Sem TURN, algumas redes restritivas poderão não conseguir estabelecer a chamada. Os participantes entram explicitamente na chamada e só concedem acesso à câmara ou ao microfone quando ativam cada controlo. Ao sair ou perder a ligação, os transports e faixas são fechados.

Não são necessárias contas: perfis são temporários e eliminados no fim da partida ou quando a instância proprietária encerra a sala. Sem Redis, esta configuração é para uma única instância do servidor.

## Personagens e avatares

O perfil disponibiliza uma galeria responsiva com seis categorias de emojis. A escolha é validada pelo servidor, guardada no registo temporário do jogador no MySQL durante a sala e conservada localmente no dispositivo para visitantes. Sem contas, a escolha local não sincroniza entre dispositivos. O avatar aparece na lista da sala, no chat e junto às equipas durante a partida; não altera a cor nem a posição da peça da equipa.

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
- Cronómetro de 30 segundos, acerto, passagem de item, avanço de uma casa e vitória ao alcançar a casa 25.
- Falar, escrever e fazer mímica são permitidos. Quem recebe a carta confirma os acertos.
- Os bots usam simulação simples; não são um modelo de IA.
- Áudio e vídeo opcionais em salas online através de mediasoup SFU; a disponibilidade em produção depende do endereço público, firewall e TURN quando necessário.
