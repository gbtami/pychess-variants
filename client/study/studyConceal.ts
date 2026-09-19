import { nodeAtPath, parentPath, type AnalysisTree, type AnalysisTreeNode } from '../analysis/analysisTree';
import type { AnalysisNavigationOrigin } from '../analysis/analysisExtension';
import type { StudySessionPolicy } from './studyMode';

interface StudyConcealHost {
    analysisTree?: AnalysisTree;
    analysisPath?: string;
}

export function isConcealPlayback(policy: StudySessionPolicy): boolean {
    return policy.session === 'conceal-reader';
}

function pathContains(outerPath: string, innerPath: string): boolean {
    return outerPath === '' || innerPath === outerPath || innerPath.startsWith(`${outerPath}.`);
}

/**
 * Presentation-only controller for concealed Study chapters.
 *
 * The persisted reveal boundary is global Study state. Reader exploration is not:
 * the active attempted path is revealed only in this browser and disappears again
 * when the reader leaves it or reloads the authoritative chapter.
 */
export class StudyConcealController {
    private concealPly: number;
    private policy: StudySessionPolicy;

    constructor(
        private readonly host: StudyConcealHost,
        concealPly: number,
        policy: StudySessionPolicy,
    ) {
        this.concealPly = concealPly;
        this.policy = policy;
    }

    setPolicy(policy: StudySessionPolicy): void {
        this.policy = policy;
    }

    setConcealPly(concealPly: number): void {
        this.concealPly = concealPly;
    }

    canActivatePath(path: string, origin: AnalysisNavigationOrigin): boolean {
        if (!isConcealPlayback(this.policy)) return true;

        const tree = this.host.analysisTree;
        const currentPath = this.host.analysisPath ?? '';
        if (!tree || !nodeAtPath(tree, path)) return false;

        // Backward navigation is always safe: it cannot disclose a continuation.
        if (path === currentPath || pathContains(path, currentPath)) return true;

        // A contributor may explicitly present an otherwise concealed sideline. It
        // becomes visible only as this reader's current path; the persisted reveal
        // boundary remains unchanged unless the server separately advances it.
        if (origin === 'shared-position') return true;

        // Board input has already been validated by Fairy-Stockfish. Allow exactly
        // one child of the current position so both a stored expected move and a new
        // legal exploratory move can be tried without first exposing its SAN.
        if (origin === 'played-move' && parentPath(path) === currentPath) return true;

        const node = nodeAtPath(tree, path);
        return node !== undefined && this.revealedByBoundary(node);
    }

    isTreeNodeVisible(node: AnalysisTreeNode): boolean {
        if (!isConcealPlayback(this.policy)) return true;
        if (this.revealedByBoundary(node)) return true;
        return pathContains(node.path, this.host.analysisPath ?? '');
    }

    isTreeNodeConcealed(node: AnalysisTreeNode): boolean {
        return this.policy.session === 'conceal-author' && !this.revealedByBoundary(node);
    }

    areTreeNodeAnnotationsVisible(node: AnalysisTreeNode): boolean {
        return !isConcealPlayback(this.policy) || this.revealedByBoundary(node);
    }

    areBoardShapesVisible(): boolean {
        // Lichess concealment hides future move-tree content, not the drawings
        // attached to the position the reader is currently viewing. Those
        // arrows/circles are useful during live coaching and are already safe
        // once the position itself has been revealed (or explicitly shared).
        return true;
    }

    allowTreeContextMenu(): boolean {
        return !isConcealPlayback(this.policy);
    }

    private revealedByBoundary(node: AnalysisTreeNode): boolean {
        return node.path === '' || (node.mainlinePly !== undefined && node.mainlinePly <= this.concealPly);
    }
}
