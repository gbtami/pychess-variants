# ![Crazyhouse](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Crazyhouse.svg) Crazyhouse

Le crazyhouse est une variante d'échecs occidentaux très populaire, où les pièces adverses capturées peuvent être parachutées sur l'échiquier en tant que les vôtres (comme au shogi). Ceci amène à une jeu bien différent du jeu classique. Il y a aussi la compétition de haut niveau au crazyhouse.

## Règles

Pendant notre tour, on peut parachuter une pièce adverse capturée sur l'échiquier au lieu de faire un coup normal. En notation algébrique, le parachutage est noté par une arobase (@). Par exemple, R@e4 indique une tour parachutée sur la case e4. Les règles gouvernant le parachutage sont les suivantes :

* Il est permis de donner échec et mat avec un parachutage, même avec un pion (contrairement au shogi).
* Il est illégal de parachuter un pion sur la 1ère et la 8ème rangées.
* Un pion promu et puis capturé se parachutera en tant que pion.
* Un pion blanc (resp. noir) parachuté sur la 2ème rangée (resp. 7ème rangée) peut avancer de deux cases lors de son premier coup après être parachuté.
* Il est illégal de roquer avec une tour parachutée.

## Conseils

Quelques conseils pour bien jouer au crazyhouse, tirés du [page de Lichess](https://lichess.org/variant/crazyhouse) :

* Le pion et le cavalier ont une importance élevée au crazyhouse par rapport aux échecs occidentaux, alors que la tour, la dame et le fou deviennent moins importants. Si le roi s'est fait mettre en échec par une de ces trois dernières pièces, d'une distance d'au moins deux cases, il serait intéressant de parachuter un pion adjacent au roi pour renforcer sa défense. Par contre, on ne peut parer l'attaque d'un cavalier en interposant une pièce défensive, d'où son valeur offensive. Le cavalier s'avère donc efficace pour maintenir une influence stratégique sur une région.
* Après un échange de dames près du début de la partie, souvent il vaut mieux de ne pas la parachuter trop vite, d'autant plus si elle se ferait chasser par le parachutage des pièces mineures. Une préparation soigneuse précède un parachutage de dame efficace.
* Pions peut être parachuter au fond du camp adverse où ils peuvent effectuer des fourchettes ou donner un échec dérangeant.
* L'initiative est clé.
