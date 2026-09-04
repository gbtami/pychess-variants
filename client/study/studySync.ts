import { updateMovelist } from '../movelist';
import {
    deleteNodePath,
    forceVariationAt,
    nodeAtPath,
    parentPath,
    promoteNodePath,
    type AnalysisTreeNode,
} from '../analysis/analysisTree';
import type { AnalysisController } from '../analysis/analysisCtrl';
import type { AnalysisExtension, AnalysisExtensionFactory } from '../analysis/analysisExtension';
import type { JSONObject } from '../types';
import {
    addStudyNodeToAnalysisTree,
    analysisTreeFromStudy,
    isStudyNodeId,
    newStudyNodeId,
    refreshStudyMainline,
    type StudyTreeDto,
    type StudyTreeNodeDto,
} from './studyTree';

const STUDY_SOCKET_TYPES = new Set([
    'study_user_connected',
    'study_add_node',
    'study_delete_node',
    'study_promote_variation',
    'study_force_variation',
    'study_error',
    'study_reload',
]);

type StudyMutationType = 'study_add_node' | 'study_delete_node' | 'study_promote_variation' | 'study_force_variation';

type PendingMutation = {
    type: StudyMutationType;
    clientOpId: string;
    body: JSONObject;
    sent: boolean;
};

export interface StudySyncOptions {
    studyId: string;
    chapterId: string;
    revision: number;
    tree?: StudyTreeDto;
    orientation?: 'white' | 'black';
    onReloadRequired?: (reason: string) => void;
    opIdFactory?: () => string;
}

function record(message: unknown): Record<string, unknown> | undefined {
    if (message === null || typeof message !== 'object' || Array.isArray(message)) return undefined;
    return message as Record<string, unknown>;
}

function asStudyTreeNode(value: unknown): StudyTreeNodeDto | undefined {
    const node = record(value);
    if (!node) return undefined;
    if (!isStudyNodeId(node.id)) return undefined;
    if (node.parentId !== null && !isStudyNodeId(node.parentId)) return undefined;
    if (!Number.isInteger(node.order) || (node.order as number) < 0) return undefined;
    if (typeof node.move !== 'string' || !node.move) return undefined;
    if (typeof node.fen !== 'string' || !node.fen) return undefined;
    if (node.turnColor !== 'white' && node.turnColor !== 'black') return undefined;
    if (typeof node.check !== 'boolean') return undefined;
    if (node.san !== undefined && typeof node.san !== 'string') return undefined;
    if (node.sanSAN !== undefined && typeof node.sanSAN !== 'string') return undefined;
    if (node.forceVariation !== undefined && typeof node.forceVariation !== 'boolean') return undefined;

    return {
        id: node.id,
        parentId: node.parentId,
        order: node.order as number,
        move: node.move,
        fen: node.fen,
        turnColor: node.turnColor,
        check: node.check,
        san: node.san as string | undefined,
        sanSAN: node.sanSAN as string | undefined,
        forceVariation: node.forceVariation as boolean | undefined,
    };
}

export class StudyAnalysisExtension implements AnalysisExtension {
    readonly socketTarget: string;
    readonly treeStorageKey: string;
    private currentRevision: number;
    private connected = false;
    private openedOnce = false;
    private reconnecting = false;
    private reloadRequested = false;
    private readonly pending: PendingMutation[] = [];
    private readonly onReloadRequired: (reason: string) => void;
    private readonly opIdFactory: () => string;

    constructor(
        private readonly ctrl: AnalysisController,
        private readonly options: StudySyncOptions,
    ) {
        if (!Number.isInteger(options.revision) || options.revision < 0) {
            throw new Error('Study revision must be a non-negative integer');
        }
        this.currentRevision = options.revision;
        if (options.orientation) {
            ctrl.mycolor = options.orientation;
            ctrl.oppcolor = options.orientation === 'white' ? 'black' : 'white';
        }
        this.socketTarget = `wsstudy/${options.studyId}`;
        this.treeStorageKey = `study:${options.studyId}:${options.chapterId}`;
        this.onReloadRequired = options.onReloadRequired ?? (() => window.location.reload());
        this.opIdFactory = options.opIdFactory ?? newStudyNodeId;
    }

    get revision(): number {
        return this.currentRevision;
    }

    get pendingCount(): number {
        return this.pending.length;
    }

    onInitialBoardLoaded(): void {
        if (!this.options.tree) return;
        const rootStep = this.ctrl.steps[0];
        if (!rootStep) {
            this.requestReload('missing_root_position');
            return;
        }
        try {
            const tree = analysisTreeFromStudy(rootStep, this.options.tree);
            this.ctrl.tree.loadAnalysisTree(tree);
            this.refreshPreferredMainline();
            updateMovelist(this.ctrl, true, false);
        } catch {
            this.requestReload('invalid_initial_tree');
        }
    }

    onSocketOpen(): void {
        this.connected = true;
        if (this.openedOnce && this.reconnecting) {
            this.requestReload('reconnected');
            return;
        }
        this.openedOnce = true;
        this.reconnecting = false;
        this.pump();
    }

    onSocketReconnect(): void {
        this.connected = false;
        if (this.openedOnce) this.reconnecting = true;
    }

    onSocketClose(): void {
        this.connected = false;
    }

    onNodeAdded(parentPath: string, node: AnalysisTreeNode): void {
        if (!node.step.move || !isStudyNodeId(node.id)) {
            this.requestReload('invalid_local_node');
            return;
        }
        this.refreshPreferredMainline();
        this.enqueue('study_add_node', {
            parentPath,
            move: node.step.move,
            nodeId: node.id,
        });
    }

    onNodeDeleted(path: string): void {
        this.refreshPreferredMainline();
        this.enqueue('study_delete_node', { path });
    }

    onVariationPromoted(path: string, toMainline: boolean): void {
        this.refreshPreferredMainline();
        this.enqueue('study_promote_variation', { path, toMainline });
    }

    onVariationForced(path: string, force: boolean): void {
        this.refreshPreferredMainline();
        this.enqueue('study_force_variation', { path, force });
    }

    onSocketMessage(type: string, message: unknown): boolean {
        if (!STUDY_SOCKET_TYPES.has(type)) return false;
        const data = record(message);
        if (!data || data.type !== type) {
            this.requestReload('invalid_socket_message');
            return true;
        }

        if (type === 'study_user_connected') {
            if (data.studyId !== this.options.studyId) this.requestReload('wrong_study');
            return true;
        }

        if (data.studyId !== this.options.studyId) {
            this.requestReload('wrong_study');
            return true;
        }
        if (data.chapterId !== this.options.chapterId) return true;

        if (type === 'study_error' || type === 'study_reload') {
            this.requestReload(typeof data.reason === 'string' ? data.reason : type);
            return true;
        }
        if (!this.isAcceptedMutation(type, data)) {
            this.requestReload('invalid_mutation_ack');
            return true;
        }

        const pending = this.pending[0];
        if (pending && data.clientOpId === pending.clientOpId) {
            this.acceptOwnMutation(pending, data);
        } else if (pending) {
            this.requestReload('concurrent_edit');
        } else {
            this.applyRemoteMutation(type as StudyMutationType, data);
        }
        return true;
    }

    private enqueue(type: StudyMutationType, body: JSONObject): void {
        if (this.reloadRequested) return;
        const clientOpId = this.opIdFactory();
        if (!clientOpId) {
            this.requestReload('invalid_client_operation_id');
            return;
        }
        this.pending.push({ type, clientOpId, body, sent: false });
        this.pump();
    }

    private pump(): void {
        if (!this.connected || this.reloadRequested) return;
        const pending = this.pending[0];
        if (!pending || pending.sent) return;
        pending.sent = true;
        this.ctrl.doSend({
            type: pending.type,
            studyId: this.options.studyId,
            chapterId: this.options.chapterId,
            clientOpId: pending.clientOpId,
            expectedRevision: this.currentRevision,
            ...pending.body,
        });
    }

    private isAcceptedMutation(type: string, data: Record<string, unknown>): boolean {
        return (
            (type === 'study_add_node' ||
                type === 'study_delete_node' ||
                type === 'study_promote_variation' ||
                type === 'study_force_variation') &&
            typeof data.clientOpId === 'string' &&
            Number.isInteger(data.revision) &&
            (data.revision as number) >= 0 &&
            typeof data.changed === 'boolean'
        );
    }

    private acceptOwnMutation(pending: PendingMutation, data: Record<string, unknown>): void {
        if (data.type !== pending.type) {
            this.requestReload('operation_mismatch');
            return;
        }
        const expectedRevision = this.currentRevision + (data.changed ? 1 : 0);
        if (data.revision !== expectedRevision) {
            this.requestReload('revision_mismatch');
            return;
        }

        if (pending.type === 'study_add_node') {
            const node = asStudyTreeNode(data.node);
            const localNodeId = pending.body.nodeId;
            const parent = pending.body.parentPath;
            const expectedPath = parent ? `${parent}.${localNodeId}` : localNodeId;
            if (!node || node.id !== localNodeId || data.path !== expectedPath) {
                this.requestReload('node_canonicalized');
                return;
            }
        }

        this.currentRevision = data.revision as number;
        this.pending.shift();
        this.pump();
    }

    private applyRemoteMutation(type: StudyMutationType, data: Record<string, unknown>): void {
        if (!data.changed || data.revision !== this.currentRevision + 1) {
            this.requestReload('revision_mismatch');
            return;
        }
        const tree = this.ctrl.analysisTree;
        if (!tree) {
            this.requestReload('missing_tree');
            return;
        }

        if (type === 'study_add_node') {
            const parentPathValue = data.parentPath;
            const path = data.path;
            const node = asStudyTreeNode(data.node);
            if (typeof parentPathValue !== 'string' || typeof path !== 'string' || !node) {
                this.requestReload('invalid_remote_add');
                return;
            }
            const attachedPath = addStudyNodeToAnalysisTree(tree, parentPathValue, node);
            if (attachedPath !== path) {
                this.requestReload('tree_mismatch');
                return;
            }
        } else if (type === 'study_delete_node') {
            const path = data.path;
            if (typeof path !== 'string' || !path || !nodeAtPath(tree, path)) {
                this.requestReload('tree_mismatch');
                return;
            }
            const activePath = this.ctrl.analysisPath;
            const nextPath = activePath === path || activePath.startsWith(`${path}.`) ? parentPath(path) : activePath;
            deleteNodePath(tree, path);
            this.refreshPreferredMainline();
            if (nextPath !== activePath) this.ctrl.activateTreePath(nextPath, true, false);
        } else if (type === 'study_promote_variation') {
            const path = data.path;
            const toMainline = data.toMainline;
            if (typeof path !== 'string' || typeof toMainline !== 'boolean' || !nodeAtPath(tree, path)) {
                this.requestReload('tree_mismatch');
                return;
            }
            promoteNodePath(tree, path, toMainline);
        } else {
            const path = data.path;
            const force = data.force;
            if (typeof path !== 'string' || typeof force !== 'boolean' || !nodeAtPath(tree, path)) {
                this.requestReload('tree_mismatch');
                return;
            }
            forceVariationAt(tree, path, force);
        }

        this.refreshPreferredMainline();
        this.currentRevision = data.revision as number;
        updateMovelist(this.ctrl, true, false);
    }

    private refreshPreferredMainline(): void {
        const tree = this.ctrl.analysisTree;
        if (!tree) return;
        this.ctrl.steps = refreshStudyMainline(tree);
        // A Study line is an editable preferred line, not the immutable recorded
        // mainline of a finished game. Tree node metadata remains authoritative.
        this.ctrl.recordedMainlinePly = undefined;
    }

    private requestReload(reason: string): void {
        if (this.reloadRequested) return;
        this.reloadRequested = true;
        this.connected = false;
        this.onReloadRequired(reason);
    }
}

export function studyAnalysisExtension(options: StudySyncOptions): AnalysisExtensionFactory {
    return ctrl => new StudyAnalysisExtension(ctrl, options);
}
