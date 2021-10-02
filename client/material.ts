import * as cg from 'chessgroundx/types';

import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import RoundController from "./roundCtrl";

function mapPiece(piece: string, variant: string): string {
	piece = piece.split('-')[0];
	if (variant === 'makruk' || variant === 'makpong' || variant === 'cambodian') {
		if (piece === '~m') return 'm';
		return piece;
	}
	if (variant === 'shinobi') {
		if (piece === '+l' || piece === 'pl') return 'r';
		if (piece === '+h' || piece === 'ph') return 'n';
		if (piece === '+m' || piece === 'pm') return 'b';
		if (piece === '+p' || piece === 'pp') return 'c';
		return piece;
	}
	return piece;
}

function calculateImbalance(ctrl: RoundController) : {[index: string]:number} {
	var imbalances : {[index: string]:number} = {};
	var top_material_color = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, bottom_material_color = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
	for (var piece of ctrl.variant.pieceRoles('white')) imbalances[mapPiece(piece, ctrl.variant.name)] = 0;
	for (var piece of ctrl.variant.pieceRoles('black')) imbalances[mapPiece(piece, ctrl.variant.name)] = 0;
	for (var coord of Object.keys(ctrl.chessground.state.pieces)) {
		var pieceObject = ctrl.chessground.state.pieces[coord];
		var mappedPiece = mapPiece(pieceObject!.role, ctrl.variant.name);
		if (pieceObject!.color == 'white') {
			imbalances[mappedPiece]++;
		}
		else {
			imbalances[mappedPiece]--;
		}
	}
	if (ctrl.hasPockets) {
		for (var piece in ctrl.pockets[0]) {
			imbalances[mapPiece(piece, ctrl.variant.name)] += (top_material_color === 'white' ? 1 : -1) * ctrl.pockets[0][piece as cg.Role]!;
		}
		for (var piece in ctrl.pockets[1]) {
			imbalances[mapPiece(piece, ctrl.variant.name)] += (bottom_material_color === 'white' ? 1 : -1) * ctrl.pockets[1][piece as cg.Role]!;
		}
	}
	return imbalances;
}

export function updateMaterial (ctrl: RoundController, vmaterial0?: VNode | HTMLElement, vmaterial1?: VNode | HTMLElement) {
	if (ctrl.variant.drop) return;
    if (!ctrl.materialDifference) {
        ctrl.vmaterial0 = patch(vmaterial0? vmaterial0 : ctrl.vmaterial0, h('div'));
        ctrl.vmaterial1 = patch(vmaterial1? vmaterial1 : ctrl.vmaterial1, h('div'));
        return;
    }
	var white_material_content : VNode[] = [], black_material_content : VNode[] = [];
	var imbalances = calculateImbalance(ctrl);
	var top_material_color = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, bottom_material_color = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
	for (var piece of ctrl.variant.pieceRoles('white')) {
		var mappedPiece = mapPiece(piece, ctrl.variant.name);
		var difference = imbalances[mappedPiece];
		for (var i = 0; i < difference; ++i) {
			white_material_content.push(h('mpiece.' + mappedPiece))
		}
		if (difference > 0) {
			imbalances[mappedPiece] = 0;
		}
	}
	for (var piece of ctrl.variant.pieceRoles('black')) {
		var mappedPiece = mapPiece(piece, ctrl.variant.name);
		var difference = imbalances[mappedPiece];
		for (var i = 0; i < -difference; ++i) {
			black_material_content.push(h('mpiece.' + mappedPiece));
		}
		if (difference < 0) {
			imbalances[mappedPiece] = 0;
		}
	}
	ctrl.vmaterial0 = patch(vmaterial0? vmaterial0 : ctrl.vmaterial0, h('div.' + top_material_color, top_material_color == 'white' ? white_material_content : black_material_content));
	ctrl.vmaterial1 = patch(vmaterial1? vmaterial1 : ctrl.vmaterial1, h('div.' + bottom_material_color, bottom_material_color == 'white' ? white_material_content : black_material_content));
}
