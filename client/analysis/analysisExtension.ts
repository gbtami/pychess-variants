import type { AnalysisTreeNode } from './analysisTree';
import type { AnalysisController } from './analysisCtrl';

// Optional behavior layered on top of the shared analysis host. Study will use this
// seam for persistence/synchronization while ordinary analysis leaves it undefined.
export interface AnalysisExtension {
    // Extensions such as Study can replace the ordinary round socket with their own
    // transport while reusing AnalysisController's heartbeat/message plumbing.
    socketTarget?: string;
    treeStorageKey?: string;
    onSocketOpen?(): void;
    onSocketReconnect?(): void;
    onSocketClose?(): void;
    onInitialBoardLoaded?(): void;
    canActivatePath?(path: string): boolean;
    onPathChanged?(path: string, previousPath: string): void;
    onNodeAdded?(parentPath: string, node: AnalysisTreeNode): void;
    onNodeDeleted?(path: string): void;
    onVariationPromoted?(path: string, toMainline: boolean): void;
    onVariationForced?(path: string, force: boolean): void;
    onSocketMessage?(type: string, message: unknown): boolean;
}

export type AnalysisExtensionFactory = (ctrl: AnalysisController) => AnalysisExtension;
