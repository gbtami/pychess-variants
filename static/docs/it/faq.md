# FAQ

## Pychess

*Cos'è Pychess?* 

Pychess è un sito web dedicato a permettere alle persone di giocare le principali e interessanti varianti degli scacchi (sia regionali che più moderne). Si prega di leggere [la pagina Info](https://www.pychess.org/about).

*Perché si chiama Pychess?*

Il codice del server è scritto in Python.

*Qual è la differenza tra il sito e il software?*

Entrambi sono progettati per giocare a scacchi, ed entrambi condividono lo stesso sviluppatore ([gbtami](https://www.github.com/gbtami)). Tuttavia, le differenze finiscono qui. Il nome completo di questo sito è "Pychess Variants" per distinzione, ma è spesso chiamato semplicemente Pychess. Il sito per l'applicazione desktop è [qui](https://pychess.github.io/).

*In che modo il sito è legato a [Lichess](https://lichess.org/)?*

Il design di Pychess è fortemente influenzato da Lichess ed è pensato per essere comodo per gli utenti di Lichess. Pychess non ha alcuna relazione ufficiale con Lichess. Tuttavia, usa gli account Lichess per facilitare la gestione degli utenti.

*Cos'è Fairy-Stockfish?*

Stockfish è uno dei principali motori progettati per giocare a scacchi. Fairy-Stockfish è un fork di quello creato da [Ianfab](https://www.github.com/ianfab) per gestire diverse varianti di scacchi.

*Stockfish livello 8 è il più forte disponibile?*

È il più forte disponibile su questo sito, ma non rappresenta Fairy-Stockfish a piena potenza. La piena forza richiede più tempo per pensare e analizzare; su Pychess, Stockfish è limitato a meno di un secondo per ogni mossa.

*Ho trovato un bug! A chi dovrei riferirlo?*

Alla fine dei conti deve in ogni caso essere archiviato nell'issue tracker di Github. Se puoi, cerca di trovare un modo per riprodurre questo bug nella tua descrizione (se necessario, includi il browser e il sistema operativo). Se non sei su Github, puoi anche parlarne sul server Discord di Pychess, e qualcuno può archiviarlo.

## Varianti

*Quali giochi sono disponibili?*

Puoi controllare la [pagina Impara](https://www.pychess.org/variant) per avere una lista completa.

*Come si gioca a XXX?*

Controlla la [pagina Impara](https://www.pychess.org/variant). Inoltre, mentre sei in partita, puoi cliccare sul nome della variante che stai giocando in alto a sinistra e verrai indirizzato alla pagina Impara della variante

*Come scegliete quali varianti aggiungere?*

Major regional variants have high precedence. For western chess variants, often the most popular or well-known variants are added. However, there are still some that can't be added. Pychess relies on Fairy-Stockfish to support the variant, as our code also depends on Fairy-Stockfish for move validation. This also means no variants that aren't supported by Fairy-Stockfish can be on Pychess.

Le varianti regionali più importanti hanno la precedenza. Per le varianti scacchistiche occidentali, spesso vengono aggiunte le varianti più popolari o conosciute. Tuttavia, ce ne sono ancora alcune che non possono essere aggiunte. Pychess si basa su Fairy-Stockfish per supportare la variante, visto che il nostro codice dipende anche da Fairy-Stockfish per la validazione delle mosse. Questo significa anche che nessuna variante che non sia supportata da Fairy-Stockfish può essere presente su Pychess.

*Potete aggiungere lo Shatranj?*

Lo Shatranj è una variante morta, e ci sono giochi simili che sono ancora giocati (ad esempio il Makruk), quindi no. Se vuoi giocare a Shatranj, ci sono altri siti che lo offrono (per esempio [VChess](https://vchess.club/#/))

*Potete aggiungere XXX?*

Dipende da quanto popolare o interessante sia la variante. Non possiamo nemmeno considerare l'aggiunta di varianti che non sono supportate da Fairy-Stockfish. Altrimenti, puoi chiedercelo su Discord o Github.

## Interfaccia

*Come cambio le impostazioni?*

Clicca la rotellina in alto a destra.

*Come cambio i pezzi e la scacchiera? Ci sono set di pezzi internazionali e occidentali?*

Come descritto sopra, troverai la voce "Opzioni scacchiera". Per tutte le varianti asiatiche sono disponibili pezzi internazionalizzati.

*Come disegno cerchi e frecce sulla scacchiera?*

Usa il clic destro. Cliccando si ottiene un cerchio e trascinando si ottiene una freccia. Queste sono verdi per impostazione predefinita. Puoi renderle rosse tenendo premuto Shift o Ctrl, e puoi renderle blu tenendo premuto Alt. Premi Shift/Ctrl + Alt per ottenere il giallo.

*Che significa "5+3" quanto si parla di tempo?"*

Questa è la cadenza per la partita. Per default usiamo un sistema di incremento. "5+3" significa che ogni giocatore ha 5 *minuti*, e dopo ogni mossa aggiungono 3 *secondi* all'orologio. Puoi impostare la candenza come vuoi quando crei la partita. Il 5+3 è solo l'impostazione predefinita per il bot Random-Mover.

*Okay, e invece che mi dici della (b) in "5+3(b)?"*

La b indica la cadenza byo-yomi, che è diversa dall'incremento, ed è usata solo in alcune varianti (cioè Shogi e Janggi). Ogni giocatore ha una quantità di tempo fisso (5 minuti, in questo esempio), dopo di che hanno solo il periodo di byo-yomi per il resto delle loro mosse prima di perdere. In questo esempio, ciò significa solo 3 secondi per mossa. In genere, il byo-yomi si gioca con più di 3 secondi... di solito dai 10 secondi ai 30 secondi.

*Cos'è il Random-Mover?*

Random-Mover è un bot che sceglie semplicemente una mossa casuale dalla lista delle opzioni disponibili. Serve come un ottimo modo per familiarizzare con i movimenti dei pezzi e alcune regole. Si raccomanda vivamente di allenarsi contro Fairy-Stockfish (anche un livello basso) una volta che si conoscono le regole.

## Social/Account

*Come faccio il log in?*

Hai bisogno di un account Licess. Se non lo possiedi, vai su [Lichess](https://lichess.org/) per crearne uno.

*Accedere con il mio account Lichess non comprometterebbe il mio account/la mia password?*

No! Questo processo avviene tramite OAuth e la tua password non viene rivelata a Pychess, proprio nello stesso modo in cui puoi accedere a siti web di terzi con i tuoi account Google o Facebook.

*Qual è il modo migliore di contattare gli sviluppatori?*

Puoi provare la chat della lobby, anche se gli sviluppatori potrebbero non essere presenti per rispondere. Se desideri un modo più affidabile, puoi usare il [server Discord di Pychess](https://discord.gg/aPs8RKr).

*Come viene supportato il sito?*

Puramente attraverso le donazioni. Puoi [diventare un Mecenate](https://www.pychess.org/patron) per aiutarci a rendere questo sito migliore!

*Posso contribuire?*

Certo che puoi! Pychess è open source. Per favore comunica i tuoi suggerimenti attraverso Github e Discord.



