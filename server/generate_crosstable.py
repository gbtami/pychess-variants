async def generate_crosstable(db):
    ct = {}
    cursor = db.game.find().sort('d')
    async for doc in cursor:
        game_id = doc["_id"]
        wp, bp = doc["us"]
        result = doc["r"]

        if wp < bp:
            s1p = wp
            s2p = bp
        else:
            s1p = bp
            s2p = wp
        ct_id = s1p + "/" + s2p

        # R2C = {"1-0": "a", "0-1": "b", "1/2-1/2": "c", "*": "d"}
        if result == "d" or wp.startswith("Anonymous") or bp.startswith("Anonymous") or wp == "Random-Mover" or wp == "Fairy-Stockfish" or bp == "Random-Mover" or bp == "Fairy-Stockfish":
            continue

        if result == "c":
            s1 = s2 = 5
            tail = "="
        elif (result == "a" and s1p == wp) or (result == "b" and s1p == bp):
            s1 = 10
            s2 = 0
            tail = "+"
        else:
            s1 = 0
            s2 = 10
            tail = "-"

        if ct_id not in ct:
            ct[ct_id] = {
                "_id": ct_id,
                "s1": s1,
                "s2": s2,
                "r": ["%s%s" % (game_id, tail)]
            }
        else:
            ct[ct_id]["s1"] += s1
            ct[ct_id]["s2"] += s2
            ct[ct_id]["r"].append("%s%s" % (game_id, tail))

    for i, item in enumerate(sorted(ct.values(), key=lambda x: x["_id"])):
        # print(i, item)
        assert item["s1"] + item["s2"] == len(item["r"]) * 10
        ct[item["_id"]]["r"] = ct[item["_id"]]["r"][-20:]
        # print(i, item)

    await db.crosstable.drop()
    # bulk insert to crosstable
    if len(ct) > 0:
        await db.crosstable.insert_many(ct.values())
