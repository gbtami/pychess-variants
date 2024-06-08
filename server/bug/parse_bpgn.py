# -*- coding: utf-8 -*-
import re

if __name__ == "__main__":
    # unittest.main(verbosity=2)
    # f = open("./sample_bpgns/1283326.bpgn")
    s = "1A. e4{58.345} 1B. e4{58.324} 1a. Nf6{59.43} 2A. Nc3{56.925} 2a. d5{59.33} 3A. exd5{56.53} 3a. Nxd5{58.428} 4A. Bc4{56.276} 1b. e5{56.288} 4a. e6{57.93} 2B. Nf3{57.245} 5A. d4{55.144} 5a. Nc6{56.923} 6A. Nf3{53.364} 2b. Nc6{51.972} 6a. Bb4{55.924} 7A. Bd2{52.792} 7a. Nxc3{55.129} 8A. bxc3{52.692} 8a. Be7{54.081} 9A. O-O{52.235} 9a. O-O{53.003} 10A. Re1{51.881} 10a. Bf6{52.067} 11A. Ne5{50.947} 3B. P@e3{47.131} 11a. Na5{48.224} 12A. Bd3{48.976} 3b. P@d4{49.403} 12a. g6{46.903} 4B. Bb5{43.636} 13A. Qf3{46.448} 13a. Bg7{45.755} 14A. Ng4{44.008} 4b. dxe3{44.525} 5B. dxe3{42.887} 5b. N@h4{39.957} 6B. Nxh4{41.387} 14a. P@g5{37.342} 6b. Qxh4{38.243} 15A. P@f6{42.228} 7B. Bxc6{39.774} 15a. N@d5{33.238} 7b. dxc6{35.067} 16A. N@h6+{36.318} 8B. Nc3{33.501} 16a. Kh8{30.564} 8b. Bg4{32.298} 17A. fxg7+{34.46} 9B. N@f3{31.772} 9b. Bxf3{30.907} 10B. Qxf3{30.528} 17a. Kxg7{26.635} 10b. B@g4{26.872} 11B. Qg3{23.54} 18A. B@e5+{21.868} 11b. Qxg3{24.354} 12B. hxg3{22.856} 18a. f6{24.461} 12b. Bb4{22.628} 13B. O-O{21.267} 13b. Bxc3{21.556} 14B. bxc3{20.074} 19A. Nxf6{16.404} 19a. Nxf6{24.361} 20A. Bxg5{14.328} 14b. P@e2{16.113} 20a. B@e7{21.991} 15B. Re1{17.968} 15b. P@f3{14.389} 21A. Bgxf6+{8.683} 21a. Bxf6{21.891} 16B. Ba3{15.598} 22A. N@g5{7.287} 16b. N@d6{8.269} 22a. B@d5{15.707} 23A. Bxf6+{4.351} 23a. Rxf6{13.995} 24A. N@e8+{3.188} 17B. N@c4{8.346} 17b. fxg2{8.169} 24a. Kxh6{12.496} 18B. Nxd6+{6.375} 25A. Qxf6{2.178} 18b. cxd6{6.959} 25a. Qxf6{11.251} 26A. Q@h4+{2.078} 19B. N@c7+{3.582} 26a. N@h5{8.488} 27A. N@g4#{1.978}"
    s1 = re.findall("\\d+[AaBb]\\.[^{}]*(?:{[^{}]*})", s)
    print(s1)
