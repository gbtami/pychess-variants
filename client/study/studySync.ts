import type { DrawShape } from 'chessgroundx/draw';

import { updateMovelist } from '../movelist';
import {
    deleteNodePath,
    forceVariationAt,
    nodeAtPath,
    parentPath,
    promoteNodePath,
    type AnalysisAnnotations,
    type AnalysisTreeNode,
} from '../analysis/analysisTree';
import type { AnalysisController } from '../analysis/analysisCtrl';
import type { AnalysisExtension, AnalysisExtensionFactory } from '../analysis/analysisExtension';
import type { JSONObject } from '../types';
import {
    addStudyNodeToAnalysisTree,
    analysisAnnotationsFromStudy,
    analysisTreeFromStudy,
    isStudyNodeId,
    newStudyNodeId,
    parseStudyAnnotations,
    refreshStudyMainline,
    studyAnnotationsFromAnalysis,
    studyTreeFromAnalysisTree,
    type StudyAnnotationsDto,
    type StudyTreeDto,
    type StudyTreeNodeDto,
} from './studyTree';
import { renderStudyChapterPgn, type StudyPgnChapterData, type StudyPgnContext } from './studyPgn';

const STUDY_SOCKET_TYPES = new Set([
    'study_user_connected',
    'study_add_node',
    'study_delete_node',
    'study_promote_variation',
    'study_force_variation',
    'study_set_shapes',
    'study_set_comment',
    'study_set_nags',
    'study_clear_annotations',
    'study_set_description',
    'study_set_tags',
    'study_error',
    'study_reload',
]);

const POSITION_ANNOTATION_MUTATIONS = new Set([
    'study_set_shapes',
    'study_set_comment',
    'study_set_nags',
    'study_clear_annotations',
]);

type StudyMutationType =
    | 'study_add_node'
    | 'study_delete_node'
    | 'study_promote_variation'
    | 'study_force_variation'
    | 'study_set_shapes'
    | 'study_set_comment'
    | 'study_set_nags'
    | 'study_clear_annotations'
    | 'study_set_description'
    | 'study_set_tags';

type PendingMutation = {
    type: StudyMutationType;
    clientOpId: string;
    body: JSONObject;
    sent: boolean;
};

export interface StudyAnnotationState {
    path: string;
    annotations: StudyAnnotationsDto;
    description: string;
    tags: Record<string, string>;
}

export interface StudySyncOptions {
    studyId: string;
    chapterId: string;
    revision: number;
    tree?: StudyTreeDto;
    orientation?: 'white' | 'black';
    description?: string;
    tags?: Record<string, string>;
    studyName?: string;
    chapterName?: string;
    chapterOrder?: number;
    owner?: string;
    home?: string;
    variant?: string;
    chess960?: boolean;
    initialFen?: string;
    variantIni?: string;
    createdAt?: string;
    onAnnotationStateChanged?: (state: StudyAnnotationState) => void;
    onReloadRequired?: (reason: string) => void;
    opIdFactory?: () => string;
}

function record(message: unknown): Record<string, unknown> | undefined {
    if (message === null || typeof message !== 'object' || Array.isArray(message)) return undefined;
    return message as Record<string, unknown>;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
    const data = record(value);
    if (!data) return undefined;
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(data)) {
        if (typeof entry !== 'string') return undefined;
        result[key] = entry;
    }
    return result;
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

    let annotations: StudyAnnotationsDto | undefined;
    if (node.annotations !== undefined) {
        try {
            annotations = parseStudyAnnotations(node.annotations);
        } catch {
            return undefined;
        }
    }

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
        annotations,
    };
}

function emptyAnnotations(): StudyAnnotationsDto {
    return { shapes: [], comments: [], nags: [] };
}

function cloneAnnotations(value: AnalysisAnnotations | undefined): StudyAnnotationsDto {
    return studyAnnotationsFromAnalysis(value) ?? emptyAnnotations();
}

function simpleShapes(shapes: DrawShape[]): StudyAnnotationsDto['shapes'] {
    const brushes = new Set(['green', 'red', 'blue', 'yellow']);
    return shapes
        .filter(shape => !shape.piece && !shape.customSvg && typeof shape.orig === 'string')
        .map(shape => ({
            orig: shape.orig,
            ...(shape.dest ? { dest: shape.dest } : {}),
            brush: (brushes.has(shape.brush ?? 'green') ? (shape.brush ?? 'green') : 'green') as
                | 'green'
                | 'red'
                | 'blue'
                | 'yellow',
        }));
}

export class StudyAnalysisExtension implements AnalysisExtension {
    readonly socketTarget: string;
    readonly treeStorageKey: string;
    private currentRevision: number;
    private connected = false;
    private openedOnce = false;
    private reconnecting = false;
    private reloadRequested = false;
    private initialTreeLoaded = false;
    private description: string;
    private tags: Record<string, string>;
    private readonly pending: PendingMutation[] = [];
    private readonly onReloadRequired: (reason: string) => void;
    private readonly onAnnotationStateChanged?: (state: StudyAnnotationState) => void;
    private readonly opIdFactory: () => string;

    constructor(
        private readonly ctrl: AnalysisController,
        private readonly options: StudySyncOptions,
    ) {
        if (!Number.isInteger(options.revision) || options.revision < 0) {
            throw new Error('Study revision must be a non-negative integer');
        }
        this.currentRevision = options.revision;
        this.description = options.description ?? '';
        this.tags = { ...options.tags };
        if (options.orientation) {
            ctrl.mycolor = options.orientation;
            ctrl.oppcolor = options.orientation === 'white' ? 'black' : 'white';
        }
        this.socketTarget = `wsstudy/${options.studyId}`;
        this.treeStorageKey = `study:${options.studyId}:${options.chapterId}`;
        this.onReloadRequired = options.onReloadRequired ?? (() => window.location.reload());
        this.onAnnotationStateChanged = options.onAnnotationStateChanged;
        this.opIdFactory = options.opIdFactory ?? newStudyNodeId;
    }

    get revision(): number {
        return this.currentRevision;
    }

    get pendingCount(): number {
        return this.pending.length;
    }

    get annotationState(): StudyAnnotationState {
        const node = this.currentNode();
        return {
            path: this.ctrl.analysisPath ?? '',
            annotations: cloneAnnotations(node?.annotations),
            description: this.description,
            tags: { ...this.tags },
        };
    }

    get pgnStudy(): StudyPgnContext | undefined {
        const { studyName, owner, home } = this.options;
        if (!studyName || !owner || !home) return undefined;
        return { id: this.options.studyId, name: studyName, owner, home };
    }

    get pgnChapter(): StudyPgnChapterData | undefined {
        const { chapterName, chapterOrder, variant, initialFen, orientation } = this.options;
        if (!chapterName || !Number.isInteger(chapterOrder) || !variant || !initialFen || !orientation)
            return undefined;
        const tree =
            this.initialTreeLoaded && this.ctrl.analysisTree
                ? studyTreeFromAnalysisTree(this.ctrl.analysisTree)
                : this.options.tree;
        if (!tree) return undefined;
        return {
            id: this.options.chapterId,
            name: chapterName,
            order: chapterOrder as number,
            variant,
            chess960: this.options.chess960 ?? false,
            initialFen,
            orientation,
            description: this.description,
            tags: { ...this.tags },
            tree,
            ...(this.options.variantIni ? { variantIni: this.options.variantIni } : {}),
            ...(this.options.createdAt ? { createdAt: this.options.createdAt } : {}),
        };
    }

    getPgn(): string | undefined {
        const study = this.pgnStudy;
        const chapter = this.pgnChapter;
        return study && chapter ? renderStudyChapterPgn(study, chapter) : undefined;
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
            this.initialTreeLoaded = true;
            this.refreshPreferredMainline();
            this.restoreCurrentShapes();
            this.notifyAnnotationState();
            updateMovelist(this.ctrl, true, false);
            this.ctrl.refreshPgnView?.();
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

    onPathChanged(): void {
        this.restoreCurrentShapes();
        this.notifyAnnotationState();
    }

    onShapesChanged(shapes: DrawShape[]): void {
        const node = this.currentNode();
        if (!node) {
            this.requestReload('missing_tree_position');
            return;
        }
        const annotations = cloneAnnotations(node.annotations);
        annotations.shapes = simpleShapes(shapes);
        node.annotations = analysisAnnotationsFromStudy(annotations);
        this.notifyAnnotationState();
        const shapePayload: JSONObject[] = annotations.shapes.map(shape => {
            const payload: JSONObject = { orig: shape.orig, brush: shape.brush };
            if (shape.dest) payload.dest = shape.dest;
            return payload;
        });
        this.enqueue('study_set_shapes', { path: node.path, shapes: shapePayload });
    }

    addComment(text: string): string | undefined {
        const trimmed = text.trim();
        if (!trimmed) return undefined;
        const commentId = newStudyNodeId();
        this.setComment(commentId, trimmed);
        return commentId;
    }

    setComment(commentId: string, text: string): void {
        const node = this.currentNode();
        if (!node || !isStudyNodeId(commentId)) return;
        const annotations = cloneAnnotations(node.annotations);
        annotations.comments = annotations.comments.filter(comment => comment.id !== commentId);
        if (text.trim()) {
            annotations.comments.push({ id: commentId, author: this.ctrl.username, text: text.trim() });
        }
        node.annotations = analysisAnnotationsFromStudy(annotations);
        this.notifyAnnotationState();
        updateMovelist(this.ctrl, true, false);
        this.enqueue('study_set_comment', { path: node.path, commentId, text });
    }

    setNags(nags: number[]): void {
        const node = this.currentNode();
        if (!node) return;
        const annotations = cloneAnnotations(node.annotations);
        annotations.nags = [...new Set(nags.filter(nag => Number.isInteger(nag) && nag >= 1 && nag <= 255))];
        node.annotations = analysisAnnotationsFromStudy(annotations);
        this.notifyAnnotationState();
        updateMovelist(this.ctrl, true, false);
        this.enqueue('study_set_nags', { path: node.path, nags: annotations.nags });
    }

    clearAnnotations(): void {
        const node = this.currentNode();
        if (!node) return;
        node.annotations = undefined;
        this.ctrl.chessground.setShapes([]);
        this.notifyAnnotationState();
        updateMovelist(this.ctrl, true, false);
        this.enqueue('study_clear_annotations', { path: node.path });
    }

    setDescription(description: string): void {
        this.description = description;
        this.notifyAnnotationState();
        this.enqueue('study_set_description', { description });
    }

    setTags(tags: Record<string, string>): void {
        this.tags = { ...tags };
        this.notifyAnnotationState();
        this.enqueue('study_set_tags', { tags });
    }

    onNodeAdded(parentPath: string, node: AnalysisTreeNode): void {
        if (!node.step.move || !isStudyNodeId(node.id)) {
            this.requestReload('invalid_local_node');
            return;
        }
        this.refreshPreferredMainline();
        this.ctrl.refreshPgnView?.();
        this.enqueue('study_add_node', {
            parentPath,
            move: node.step.move,
            nodeId: node.id,
        });
    }

    onNodeDeleted(path: string): void {
        this.refreshPreferredMainline();
        this.ctrl.refreshPgnView?.();
        this.enqueue('study_delete_node', { path });
    }

    onVariationPromoted(path: string, toMainline: boolean): void {
        this.refreshPreferredMainline();
        this.ctrl.refreshPgnView?.();
        this.enqueue('study_promote_variation', { path, toMainline });
    }

    onVariationForced(path: string, force: boolean): void {
        this.refreshPreferredMainline();
        this.ctrl.refreshPgnView?.();
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

    private currentNode(): AnalysisTreeNode | undefined {
        const tree = this.ctrl.analysisTree;
        if (!tree) return undefined;
        return nodeAtPath(tree, this.ctrl.analysisPath ?? '');
    }

    private notifyAnnotationState(): void {
        this.onAnnotationStateChanged?.(this.annotationState);
        this.ctrl.refreshPgnView?.();
    }

    private restoreCurrentShapes(): void {
        const node = this.currentNode();
        this.ctrl.chessground.setShapes(node?.annotations?.shapes ?? []);
    }

    private setPositionAnnotations(path: string, annotations: StudyAnnotationsDto): boolean {
        const tree = this.ctrl.analysisTree;
        if (!tree) return false;
        const node = nodeAtPath(tree, path);
        if (!node) return false;
        node.annotations = analysisAnnotationsFromStudy(annotations);
        if (path === (this.ctrl.analysisPath ?? '')) {
            this.restoreCurrentShapes();
            this.notifyAnnotationState();
        }
        updateMovelist(this.ctrl, true, false);
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
            type !== 'study_user_connected' &&
            type !== 'study_error' &&
            type !== 'study_reload' &&
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
        } else if (POSITION_ANNOTATION_MUTATIONS.has(pending.type)) {
            const path = data.path;
            if (typeof path !== 'string') {
                this.requestReload('invalid_annotation_ack');
                return;
            }
            let annotations: StudyAnnotationsDto;
            try {
                annotations = parseStudyAnnotations(data.annotations);
            } catch {
                this.requestReload('invalid_annotation_ack');
                return;
            }
            if (!this.setPositionAnnotations(path, annotations)) {
                this.requestReload('tree_mismatch');
                return;
            }
        } else if (pending.type === 'study_set_description') {
            if (typeof data.description !== 'string') {
                this.requestReload('invalid_description_ack');
                return;
            }
            this.description = data.description;
            this.notifyAnnotationState();
        } else if (pending.type === 'study_set_tags') {
            const tags = asStringRecord(data.tags);
            if (!tags) {
                this.requestReload('invalid_tags_ack');
                return;
            }
            this.tags = tags;
            this.notifyAnnotationState();
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
        } else if (type === 'study_force_variation') {
            const path = data.path;
            const force = data.force;
            if (typeof path !== 'string' || typeof force !== 'boolean' || !nodeAtPath(tree, path)) {
                this.requestReload('tree_mismatch');
                return;
            }
            forceVariationAt(tree, path, force);
        } else if (POSITION_ANNOTATION_MUTATIONS.has(type)) {
            const path = data.path;
            if (typeof path !== 'string') {
                this.requestReload('invalid_remote_annotation');
                return;
            }
            let annotations: StudyAnnotationsDto;
            try {
                annotations = parseStudyAnnotations(data.annotations);
            } catch {
                this.requestReload('invalid_remote_annotation');
                return;
            }
            if (!this.setPositionAnnotations(path, annotations)) {
                this.requestReload('tree_mismatch');
                return;
            }
        } else if (type === 'study_set_description') {
            if (typeof data.description !== 'string') {
                this.requestReload('invalid_remote_description');
                return;
            }
            this.description = data.description;
            this.notifyAnnotationState();
        } else if (type === 'study_set_tags') {
            const tags = asStringRecord(data.tags);
            if (!tags) {
                this.requestReload('invalid_remote_tags');
                return;
            }
            this.tags = tags;
            this.notifyAnnotationState();
        }

        this.refreshPreferredMainline();
        this.currentRevision = data.revision as number;
        updateMovelist(this.ctrl, true, false);
        this.ctrl.refreshPgnView?.();
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
