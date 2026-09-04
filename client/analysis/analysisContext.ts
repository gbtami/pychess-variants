import type { PyChessModel } from '../types';

export type AnalysisMode = 'standalone' | 'game' | 'puzzle' | 'embed';

export type AnalysisCapabilities = {
    resizableCharts: boolean;
    localAnalysisAllowed: boolean;
    editableTree: boolean;
    gamePanels: boolean;
    roundChat: boolean;
    engineTools: boolean;
    analysisTabs: boolean;
    usesRoundSocket: boolean;
    positionMetadata: boolean;
    evalCharts: boolean;
    positionEvaluation: boolean;
    serverAnalysisRequest: boolean;
    moveTimeChart: boolean;
};

export type AnalysisContext = {
    mode: AnalysisMode;
    analysisBoard: boolean;
    embed: boolean;
    puzzle: boolean;
    ongoing: boolean;
    capabilities: AnalysisCapabilities;
};

export function analysisContext(model: PyChessModel): AnalysisContext {
    const embed = model.embed;
    const puzzle = model.puzzle !== '';
    const analysisBoard = model.gameId === '' && !puzzle;
    const ongoing = model.status <= -1;

    const mode: AnalysisMode = puzzle ? 'puzzle' : embed ? 'embed' : analysisBoard ? 'standalone' : 'game';

    return {
        mode,
        analysisBoard,
        embed,
        puzzle,
        ongoing,
        capabilities: {
            // These capability values intentionally mirror the legacy boolean gates in
            // AnalysisController. Phase 0B centralizes the answers without changing
            // behavior; later modes such as Study can extend this vocabulary cleanly.
            resizableCharts: !embed,
            localAnalysisAllowed: !ongoing,
            editableTree: !ongoing && !embed,
            gamePanels: !analysisBoard && !embed && !ongoing,
            roundChat: !analysisBoard && !embed && !puzzle && !ongoing,
            engineTools: !embed && !ongoing,
            analysisTabs: !puzzle && !ongoing && !embed,
            usesRoundSocket: !puzzle && !ongoing && model.gameId !== '',
            positionMetadata: !puzzle && !ongoing,
            evalCharts: !puzzle && !ongoing,
            positionEvaluation: !ongoing,
            serverAnalysisRequest: !analysisBoard && !embed,
            moveTimeChart: !embed,
        },
    };
}
