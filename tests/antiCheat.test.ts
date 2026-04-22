import { beforeEach, describe, expect, test } from "@jest/globals";

import {
    CEVAL_ACTIVE_ROUNDS_STORAGE_KEY,
    hasActiveEligibleLiveGame,
    minCevalReportPly,
    removeActiveCevalRound,
    upsertActiveCevalRound,
} from "../client/antiCheat";

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});

describe("anti-cheat live round tracking", () => {
    test("tracks an active eligible live round and prunes stale entries", () => {
        upsertActiveCevalRound("game-live", 1_000);

        expect(hasActiveEligibleLiveGame(1_000)).toBe(true);
        expect(hasActiveEligibleLiveGame(61_001)).toBe(false);
        expect(localStorage.getItem(CEVAL_ACTIVE_ROUNDS_STORAGE_KEY)).toBe("{}");
    });

    test("removes only the current tab entry from shared live round state", () => {
        upsertActiveCevalRound("game-a", 5_000);

        const stored = JSON.parse(localStorage.getItem(CEVAL_ACTIVE_ROUNDS_STORAGE_KEY) ?? "{}");
        stored["other-tab"] = { gameId: "game-b", updatedAt: 5_000 };
        localStorage.setItem(CEVAL_ACTIVE_ROUNDS_STORAGE_KEY, JSON.stringify(stored));

        removeActiveCevalRound(5_000);

        expect(hasActiveEligibleLiveGame(5_000)).toBe(true);
        expect(localStorage.getItem(CEVAL_ACTIVE_ROUNDS_STORAGE_KEY)).toContain("other-tab");
    });

    test("uses a lower ceval report threshold for chess960", () => {
        expect(minCevalReportPly(false)).toBe(6);
        expect(minCevalReportPly(true)).toBe(1);
    });
});
