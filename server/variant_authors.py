from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class VariantAuthor:
    """A person or group credited by one or more built-in variant rule pages."""

    name: str
    variants: tuple[str, ...]
    coauthors: tuple[str, ...] = ()
    bio: str = ""
    portrait: str = ""
    portrait_alt: str = ""
    source_url: str = ""
    portrait_source_url: str = ""
    portrait_credit: str = ""
    portrait_license: str = ""
    portrait_license_url: str = ""
    portrait_credit_label: str = "Portrait by"
    portrait_note: str = ""
    representative_artwork: bool = False
    portrait_contain: bool = False

    @property
    def credited_names(self) -> tuple[str, ...]:
        return (self.name, *self.coauthors)

    @property
    def display_name(self) -> str:
        if not self.coauthors:
            return self.name
        if len(self.coauthors) == 1:
            return f"{self.name} & {self.coauthors[0]}"
        return f"{self.name}, {', '.join(self.coauthors[:-1])} & {self.coauthors[-1]}"

    @property
    def is_collaboration(self) -> bool:
        return bool(self.coauthors)

    @property
    def publishable(self) -> bool:
        """Show complete records with licensed portraits or sourced representative images."""

        common_fields = bool(
            self.bio
            and self.portrait
            and self.portrait_alt
            and self.source_url
            and self.portrait_source_url
            and self.portrait_credit
        )
        reusable_portrait = bool(self.portrait_license and self.portrait_license_url)
        return common_fields and (self.representative_artwork or reusable_portrait)


# Keep every identifiable creator credited by the English built-in rules here,
# even when there is not enough reliable public material for a gallery tile yet.
# Adding a sourced biography plus either a licensed portrait or explicitly marked
# representative image automatically makes a record publishable on /authors.
VARIANT_AUTHORS: tuple[VariantAuthor, ...] = (
    VariantAuthor(
        name="José Raúl Capablanca",
        variants=("capablanca",),
        bio=(
            "José Raúl Capablanca (1888–1942) was a Cuban chess prodigy and the third "
            "world chess champion, holding the title from 1921 to 1927. Famous for his "
            "clear positional play and endgame technique, he also designed Capablanca "
            "Chess in the 1920s, expanding the board and adding two compound pieces."
        ),
        portrait="images/variant-authors/jose-raul-capablanca.jpg",
        portrait_alt="Portrait of José Raúl Capablanca",
        source_url="https://en.wikipedia.org/wiki/Jos%C3%A9_Ra%C3%BAl_Capablanca",
        portrait_source_url=(
            "https://commons.wikimedia.org/wiki/File:Jos%C3%A9_Ra%C3%BAl_Capablanca_1920.jpg"
        ),
        portrait_credit="Unknown photographer",
        portrait_license="Public domain",
        portrait_license_url="https://creativecommons.org/publicdomain/mark/1.0/",
    ),
    VariantAuthor(
        name="Bobby Fischer",
        variants=("chess960",),
        bio=(
            "Bobby Fischer (1943–2008) was an American grandmaster and the eleventh "
            "world chess champion. In 1996 he introduced Fischer Random Chess, now "
            "usually called Chess960, to reduce dependence on memorized openings and "
            "make original play begin with the first move."
        ),
        portrait="images/variant-authors/bobby-fischer.jpg",
        portrait_alt="Portrait of Bobby Fischer in 1972",
        source_url="https://en.wikipedia.org/wiki/Chess960",
        portrait_source_url=("https://commons.wikimedia.org/wiki/File:Bobby_Fischer_1972.jpg"),
        portrait_credit="Bert Verhoeff / Anefo",
        portrait_license="CC0 1.0",
        portrait_license_url="https://creativecommons.org/publicdomain/zero/1.0/",
    ),
    VariantAuthor(
        name="David Bronstein",
        variants=("placement",),
        bio=(
            "David Bronstein (1924–2006) was a Soviet and Russian grandmaster, world "
            "championship challenger, and one of chess's most celebrated creative "
            "players. In the late 1940s he promoted the player-built starting-position "
            "idea later known as Placement Chess, Pre-Chess, or Shuffle-Chess, in which "
            "the back-rank pieces are placed alternately before normal play begins."
        ),
        portrait="images/variant-authors/david-bronstein.jpg",
        portrait_alt="David Bronstein playing at the 1968 IBM chess tournament in Amsterdam",
        source_url="https://www.fide.com/history-of-chess960/",
        portrait_source_url=("https://commons.wikimedia.org/wiki/File:David_Bronstein_1968.jpg"),
        portrait_credit="Eric Koch / Anefo / Dutch National Archives",
        portrait_license="CC BY-SA 3.0 NL",
        portrait_license_url="https://creativecommons.org/licenses/by-sa/3.0/nl/deed.en",
    ),
    VariantAuthor(
        name="Yasser Seirawan",
        variants=("seirawan",),
        bio=(
            "Yasser Seirawan is an American grandmaster, 1979 World Junior Champion, "
            "four-time United States champion, author, and commentator. Together with "
            "Bruce Harper he unveiled Seirawan Chess in 2007, adding the hawk and "
            "elephant to orthodox chess through a new gating mechanism."
        ),
        portrait="images/variant-authors/yasser-seirawan.jpg",
        portrait_alt="Portrait of Yasser Seirawan",
        source_url="https://en.wikipedia.org/wiki/Yasser_Seirawan",
        portrait_source_url=("https://commons.wikimedia.org/wiki/File:Yasser_Seirawan.jpg"),
        portrait_credit="Georgios Souleidis",
        portrait_license="CC BY 2.0",
        portrait_license_url="https://creativecommons.org/licenses/by/2.0/",
    ),
    VariantAuthor(
        name="Christian Freeling",
        variants=("grand",),
        bio=(
            "Christian Freeling (1947–2026) was a Dutch designer of abstract strategy "
            "games. His many designs include Havannah, Dameo, and Grand Chess, the "
            "highly regarded 10×10 chess variant he created in 1984."
        ),
        portrait="images/variant-authors/christian-freeling.jpg",
        portrait_alt="Portrait of Christian Freeling",
        source_url="https://en.wikipedia.org/wiki/Christian_Freeling",
        portrait_source_url=("https://commons.wikimedia.org/wiki/File:Christian_Freeling.jpg"),
        portrait_credit="Christian Freeling, inventor of abstract games",
        portrait_license="CC BY-SA 3.0",
        portrait_license_url="https://creativecommons.org/licenses/by-sa/3.0/",
    ),
    VariantAuthor(
        name="Madoka Kitao",
        variants=("dobutsu",),
        bio=(
            "Madoka Kitao is a retired Japanese women's professional shogi player, "
            "teacher, and promoter of the game. She devised the rules of Dōbutsu Shogi "
            "as an approachable introduction for young children; illustrator Maiko "
            "Fujita created its friendly animal-piece artwork."
        ),
        portrait="images/variant-authors/madoka-kitao.jpg",
        portrait_alt="Portrait of Madoka Kitao",
        source_url="https://en.wikipedia.org/wiki/Madoka_Kitao",
        portrait_source_url=("https://commons.wikimedia.org/wiki/File:MADOKA_(retouched).JPG"),
        portrait_credit="Unknownspb; retouched by PawełMM",
        portrait_license="CC BY-SA 4.0",
        portrait_license_url="https://creativecommons.org/licenses/by-sa/4.0/",
    ),
    VariantAuthor(
        name="Miguel Illescas",
        variants=("dragon",),
        bio=(
            "Miguel Illescas is a Spanish grandmaster, eight-time Spanish champion, "
            "trainer, author, and computer scientist. He worked on IBM's Deep Blue team "
            "and later created Dragon Chess, whose reserve dragon combines the moves of "
            "a bishop and a knight."
        ),
        portrait="images/variant-authors/miguel-illescas.jpg",
        portrait_alt="Portrait of Miguel Illescas",
        source_url="https://en.wikipedia.org/wiki/Miguel_Illescas",
        portrait_source_url=(
            "https://commons.wikimedia.org/wiki/File:Miguel_Illescas_C%C3%B3rdoba_2013.jpg"
        ),
        portrait_credit="Przemysław Jahr / Wikimedia Commons",
        portrait_license="CC BY-SA 3.0",
        portrait_license_url="https://creativecommons.org/licenses/by-sa/3.0/",
    ),
    VariantAuthor(
        name="V. R. Parton",
        variants=("alice", "racingkings"),
        bio=(
            "Vernon Rylands Parton (1897–1974) was an English teacher and prolific "
            "inventor of chess variants whose designs were often inspired by Lewis "
            "Carroll. He created Alice Chess in 1953 and Racing Kings in 1961, two "
            "of his best-known games and both playable on PyChess."
        ),
        portrait="images/variant-authors/v-r-parton.jpg",
        portrait_alt=("John Tenniel illustration of Alice stepping through the looking-glass"),
        source_url="https://en.wikipedia.org/wiki/V._R._Parton",
        portrait_source_url=("https://commons.wikimedia.org/wiki/File:Aliceroom3.jpg"),
        portrait_credit="Sir John Tenniel",
        portrait_license="Public domain",
        portrait_license_url="https://creativecommons.org/publicdomain/mark/1.0/",
        portrait_credit_label="Illustration by",
        portrait_note=(
            "Representative Alice artwork is used because no freely reusable portrait "
            "of Parton is currently known."
        ),
        representative_artwork=True,
    ),
    VariantAuthor(name="ASEAN-Chess Council", variants=("asean",)),
    VariantAuthor(name="Dave Crummack", variants=("ataxx",)),
    VariantAuthor(name="Craig Galley", variants=("ataxx",)),
    VariantAuthor(name="RadarUndetectable", variants=("battleofideologies",)),
    VariantAuthor(name="dpldgr", variants=("borderlands",)),
    VariantAuthor(
        name="Peter Michaelsen",
        variants=("cannonshogi",),
        bio=(
            "Peter Michaelsen is the designer of Cannon Shogi, introduced in February "
            "1998. The variant keeps the standard 9×9 shogi framework while adding four "
            "cannon families inspired by Xiangqi and Janggi and replacing the normal pawn "
            "array with five more mobile soldiers."
        ),
        portrait="images/variant-authors/peter-michaelsen.jpg",
        portrait_alt="Cannon Shogi starting position",
        source_url="https://ftp.chessvariants.com/index/displayitem.php?itemid=zCannonShogi",
        portrait_source_url="https://www.pychess.org/variants/cannonshogi",
        portrait_credit="the PyChess Cannon Shogi rules guide",
        portrait_credit_label="Representative image from",
        portrait_note=(
            "Representative Cannon Shogi artwork is used instead of an author portrait."
        ),
        representative_artwork=True,
        portrait_contain=True,
    ),
    VariantAuthor(
        name="Couch Tomato",
        variants=(
            "chak",
            "chennis",
            "empire",
            "khans",
            "orda",
            "ordamirror",
            "shinobi",
            "shinobiplus",
            "shogun",
            "synochess",
            "yokai",
        ),
    ),
    VariantAuthor(name="Omshinwa", variants=("chess_xiangqi",)),
    VariantAuthor(name="Ralph Betza", variants=("cwda",)),
    VariantAuthor(
        name="Dr Tim Paulden",
        variants=("duck",),
        bio=(
            "Dr Tim Paulden was president of Exeter Chess Club in Devon, England, when "
            "he invented Duck Chess in early 2016. The game adds a jointly controlled "
            "rubber duck that blocks one square and must be repositioned after every "
            "ordinary chess move."
        ),
        portrait="images/variant-authors/tim-paulden.jpg",
        portrait_alt="Two players playing Duck Chess at Exeter Chess Club",
        source_url="https://www.exeterchessclub.org.uk/content/duckchess2017jpg",
        portrait_source_url="https://www.exeterchessclub.org.uk/content/duckchess2017jpg",
        portrait_credit="Exeter Chess Club",
        portrait_credit_label="Photo published by",
        portrait_note=("The source photograph shows Duck Chess being played at Exeter Chess Club."),
        representative_artwork=True,
        portrait_contain=True,
    ),
    VariantAuthor(
        name="Jens Bæk Nielsen",
        coauthors=("Torben Osted",),
        variants=("fogofwar",),
        bio=(
            "Jens Bæk Nielsen and Torben Osted created Dark Chess together in 1989 after "
            "experimenting with a correspondence game under altered visibility rules. "
            "Now widely known as Fog of War Chess, their design hides most of the opposing "
            "army and makes capture of the king, rather than checkmate, the goal."
        ),
        portrait="images/variant-authors/fog-of-war.jpg",
        portrait_alt="Fog of War Chess position from White's limited-information view",
        source_url="https://ftp.chessvariants.com/incinf.dir/darkness.html",
        portrait_source_url="https://www.pychess.org/variants/fogofwar",
        portrait_credit="the PyChess Fog of War rules guide",
        portrait_credit_label="Representative image from",
        portrait_note=("Representative Fog of War artwork is used instead of author portraits."),
        representative_artwork=True,
        portrait_contain=True,
    ),
    VariantAuthor(name="Bruce Harper", variants=("seirawan",)),
    VariantAuthor(
        name="Jean-Louis Cazaux",
        variants=("shako",),
        bio=(
            "Jean-Louis Cazaux is a French historian of chess and board games, author, "
            "and prolific game designer. His creations include Rollerball, Metamachy, "
            "and Shako, the 10×10 chess variant he completed in 1990 by adding the "
            "cannon and elephant to the orthodox army."
        ),
        portrait="images/variant-authors/jean-louis-cazaux.jpg",
        portrait_alt="Shako starting position",
        source_url="https://www.chessvariants.com/who/jean-louiscazaux",
        portrait_source_url="https://www.pychess.org/variants/shako",
        portrait_credit="the PyChess Shako rules guide",
        portrait_credit_label="Representative image from",
        portrait_note="Representative Shako artwork is used instead of an author portrait.",
        representative_artwork=True,
        portrait_contain=True,
    ),
    VariantAuthor(name="Fables", variants=("shinobi", "shinobiplus")),
    VariantAuthor(
        name="S. D. Streetman",
        variants=("spartan",),
        bio=(
            "S. D. Streetman, also credited as Steven Streetman, created Spartan Chess. "
            "Recorded in 2010, the deliberately asymmetric design pits an orthodox "
            "Persian army against Spartans with two kings and an entirely different set "
            "of pieces. Streetman has also described how he designed and balanced the game."
        ),
        portrait="images/variant-authors/steven-streetman.jpg",
        portrait_alt="Spartan Chess starting position",
        source_url="https://www.youtube.com/watch?v=gq90ib3fYuM",
        portrait_source_url="https://www.pychess.org/variants/spartan",
        portrait_credit="the PyChess Spartan Chess rules guide",
        portrait_credit_label="Representative image from",
        portrait_note=(
            "Representative Spartan Chess artwork is used instead of an author portrait."
        ),
        representative_artwork=True,
        portrait_contain=True,
    ),
    VariantAuthor(name="Watermelonely", variants=("melonvariant",)),
    VariantAuthor(name="Shigenobu Kusumoto", variants=("minishogi", "minixiangqi")),
    VariantAuthor(
        name="Tamiya Katsuya",
        variants=("kyotoshogi",),
        bio=(
            "Tamiya Katsuya is the Japanese game designer credited with inventing "
            "Kyoto Shogi around 1976. The compact 5×5 game is distinguished by pieces "
            "that flip after every move between paired identities, including the "
            "lance and tokin whose names combine to form ‘Kyoto’."
        ),
        portrait="images/variant-authors/tamiya-katsuya.jpg",
        portrait_alt="Kyoto Shogi starting position with international pieces",
        source_url="https://en.wikipedia.org/wiki/Kyoto_shogi",
        portrait_source_url="https://www.pychess.org/variants/kyotoshogi",
        portrait_credit="the PyChess Kyoto Shogi rules guide",
        portrait_credit_label="Representative image from",
        portrait_note=("Representative Kyoto Shogi artwork is used instead of an author portrait."),
        representative_artwork=True,
        portrait_contain=True,
    ),
    VariantAuthor(name="Bannermen", variants=("manchu",)),
    VariantAuthor(name="HaruN Y", variants=("sinting",)),
    VariantAuthor(
        name="Toyota Genryu",
        variants=("torishogi",),
        bio=(
            "Toyota Genryu was a pupil of the ninth shogi Meijin, Ōhashi Sōei. Modern "
            "accounts credit Toyota with inventing Tori Shogi in 1799, although the "
            "bird-themed 7×7 game was traditionally attributed to his master. It is "
            "one of the oldest shogi variants to use captured-piece drops."
        ),
        portrait="images/variant-authors/toyota-genryu.jpg",
        portrait_alt="Tori Shogi starting position with international bird pieces",
        source_url="https://history.chess.free.fr/torishogi.htm",
        portrait_source_url="https://www.pychess.org/variants/torishogi",
        portrait_credit="the PyChess Tori Shogi rules guide",
        portrait_credit_label="Representative image from",
        portrait_note=("Representative Tori Shogi artwork is used instead of an author portrait."),
        representative_artwork=True,
        portrait_contain=True,
    ),
    VariantAuthor(name="Ōhashi Sōei", variants=("torishogi",)),
    VariantAuthor(name="Eventlesstew", variants=("xiangfu",)),
)


def public_variant_authors() -> tuple[VariantAuthor, ...]:
    return tuple(author for author in VARIANT_AUTHORS if author.publishable)
