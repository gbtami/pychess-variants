# Perguntas Frequentes

## Pychess

*O que é o Pychess?*

O Pychess é um website dedicado a variantes de Xadrez interessantes (ambas variantes clássicas e modernas). Por favor deia uma leitura na [página do Acerca](https://www.pychess.org/about).

*Porque se chama Pychess?*

O código do servidor é feito em Python.

*Qual a diferença entre este site e o programa em si?*

Ambos são feitos com o intuito de jogar xadrez, e o seu programador é o mesmo ([gbtami](https://www.github.com/gbtami)). No entanto as diferenças acabam aqui. O nome completo deste site é "Pychess Variants" a fim de haver distinção, no entanto é chamado regularmente de Pychess. O software pychess está disponivel [aqui](https://pychess.github.io/).

*Qual a relação entre o Pychess e [Lichess](https://lichess.org/)?*

O design do Pychess foi baseado fortemente pelo Lichess e foi feito com o intuito de oferecer adaptação aos utilizadores do Lichess. O Pychess não tem uma relação oficial com o Lichess. No entanto usa as mesmas contas do Lichess a fim de facilitar a gestão de utilizadores. 

*O que é o Fairy-Stockfish?*

O Stockfish é um dos melhores computadores de xadrez (o melhor) feito para jogar Xadrez. O Fairy-Stockfish é uma adaptação desenvolvida por [Ianfab](https://www.github.com/ianfab) e tem como finalidade poder jogar várias variantes de Xadrez.

*O Stockfish nível 8 é o mais forte que existe?*

Este é o mais forte que está disponibilizado no nosso site mas isto não mostra o poder absoluto do Fairy-Stockfish usando o seu potencial completo. A fim de atingir o potencial completo é necessário algum tempo de análise e cálculo; No Pychess o Fairy-Stockfish está limitado a menos de um segundo por jogada.

*Encontrei um erro! Onde o posso reportar?*

Será necessário ir ao Github e adicionar uma issue tracker. Idealmente, tente encontrar uma maneira de reproduzir o erro na sua descrição (se necessário, indicar o navegador e o seu sistema operativo). Se não tiver inscrito no Github, pode ir ao Discord descrever o erro e alguém irá adicionar ao Github.

## Variantes

*Que jogos estão disponíveis?*

Consulte a página de [Aprendizagem](https://www.pychess.org/variant).

*Como posso jogar XXX?*

Consulte a página de [Aprendizagem](https://www.pychess.org/variant). Além disso dentro da página do jogo, pode clicar no nome da variante no canto superior esquerdo, isto irá redirecioná-lo para a página apropriada.

*Como escolhem as variantes a serem adicionadas?*

Variantes Regionais de grande popularidade têm maior prioridade. Para variantes de xadrez normal, as mais populares e conhecidas foram adicionadas. No entanto, existem algumas que não podem ser adicionadas. o Pychess tem grande incidência no suporte do Fairy-Stockfish às variantes, pelo facto do nosso código depender do Fairy-Stockfish para validação de jogadas. Isto significa que as variantes não suportadas pelo Fairy-Stockfish não podem ser adicionadas.

*Podem adicionar o Shatranj?*

O Shatranj é uma variante de Xadrez extinta e existem várias variantes semelhantes e ativas (ex: Makruk), portanto não. Se pretender jogar Shatranj existem outros sites que suportam este (ex: [VChess](https://vchess.club/#/))

*Podem adicionar XXX?*

Depende da sua popularidade e o quão interessante esta possa ser. Não podemos considerar adicionar variantes não suportadas pelo Fairy-Stockfish. Caso contrário, faça uma sugestão no Discord ou no Github.

## Interface

*Como posso modificar as definições?*

Clique no botão da roda no canto superior direito.

*Como posso modificar peças e tabuleiros? Existem peças ocidentais ou internacionais?*

Mesma resposta à pergunta anterior: Clique no botão da roda no canto superior direito. Todas as variantes orientais têm peças internacionalizadas.

*Como posso desenhar setas e circulos no tabuleiro?*

Clique no botão direito do rato. Ao clicar no tabuleiro irá ser desenhado um circulo, e ao arrastar será desenhado uma seta. A cor por defeito é o verde. Ao clicar no Shift ou no Control esta irá ter como cor Vermelho e clicando no Alt irá ter como cor o azul.

*O que significa "5+3" no tempo?*

Estes são os controles de relógio definidos na partida. Por defeito usamos o sistema de increment. "5+3" significa que cada jogador tem 5 *minutos* disponiveis, após cada lance são adicionados 3 *segundos* ao relógio. Pode definir o seu relógio da partida ao criar uma partida. O 5+3 é usado por defeito no Random Mover(Jogador Aleatório)

*O que significa o (b) em "5+3(b)"?*

O b tem como significado o byo-yomi, é um relógio de incremento um bocado diferente, e só é usado para determinadas variantes (ex: Shogi e Janggi). Cada jogador tem um tempo definido como reserva (5 minutos neste exemplo) e após este ser esgotado, o jogador só tem períodos byo-yomi definidos para o resto dos seus lances até perderem a partirda. Neste exemplo isto significa que é 3 segundos por lance. Tipicamente em Byo-yomi são usados mais do que 3 segundos de reserva... normalmente entre 10 a 30 segundos.

*O que é o Random-Mover?*

O Random-Mover é um bot que escolhe lances legais de forma aleatória. Este tem como propósito a adaptação a variantes com regras e peças diferentes do normal. É recomendado treinar contra o Fairy-Stockfish (mesmo em nível reduzido) quando se adaptar às novas regras.

## Social/Contas

*Como posso efetuar Log in?*

É necessário ter uma conta Lichess. Se não tiver, por favor entre em [Lichess](https://lichess.org/) para criar uma conta.

*Fazendo Login com a minha conta do Lichess irá comprometer a minha palavra-passe?*

Não! O login é feito a partir de OAuth e a sua password nunca irá ser revelada ao Pychess, tal como pode fazer login a outros websites a partir da sua conta Google ou Facebook.

*Qual a melhor maneira de entrar em contato com os desenvolvedores/programadores?*

Pode tentar o chat do Pychess, no entanto os desenvolvedores podem não responder. A melhor maneira será usando o [Discord](https://discord.gg/aPs8RKr).

*Como é que o site é suportado?*

Apenas por donativos. Pode tornar-se um [patron](https://www.pychess.org/patron) a fim de nos ajudar a desenvolver um site melhor!

*Posso contribuir?*

Pode contribuir! O Pychess é de código-aberto. Por favor partilhe as suas sugestões no Github ou no Discord.


