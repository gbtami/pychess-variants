import { afterEach, expect, jest, test } from '@jest/globals';

import {
    CataloguedVariantClientDocument,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    variantConfigIni,
} from '../client/variants';

const variantNames = [
    'config-parent-test',
    'config-child-test',
    'config-unrelated-test',
    'config-cycle-a',
    'config-cycle-b',
];

function cataloguedVariant(name: string, baseVariant: string): CataloguedVariantClientDocument {
    return {
        name,
        displayName: name,
        ini: `[${name}:${baseVariant}]\nstartFen = 4k3/8/8/8/8/8/8/4K3 w - - 0 1`,
        baseVariant,
        startFen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k'],
        kingRoles: ['k'],
    };
}

afterEach(() => {
    variantNames.forEach(unregisterCataloguedVariant);
    jest.restoreAllMocks();
});

test('site variants keep only the checked-in base INI', () => {
    registerCataloguedVariant(cataloguedVariant('config-unrelated-test', 'chess'));

    expect(variantConfigIni('SITE INI', 'chess')).toBe('SITE INI');
});

test('catalogued variants load only their required catalogued inheritance chain', () => {
    const parent = cataloguedVariant('config-parent-test', 'chess');
    const child = cataloguedVariant('config-child-test', parent.name);
    const unrelated = cataloguedVariant('config-unrelated-test', 'chess');
    registerCataloguedVariant(parent);
    registerCataloguedVariant(child);
    registerCataloguedVariant(unrelated);

    expect(variantConfigIni('SITE INI', child.name)).toBe(`SITE INI\n${parent.ini}\n${child.ini}`);
});

test('catalogued inheritance cycles cannot make config collection loop forever', () => {
    const cycleA = cataloguedVariant('config-cycle-a', 'config-cycle-b');
    const cycleB = cataloguedVariant('config-cycle-b', 'config-cycle-a');
    registerCataloguedVariant(cycleA);
    registerCataloguedVariant(cycleB);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(variantConfigIni('SITE INI', cycleA.name)).toBe(`SITE INI\n${cycleB.ini}\n${cycleA.ini}`);
    expect(consoleError).toHaveBeenCalledWith(
        'Cyclic catalogued variant inheritance involving config-cycle-a',
    );
});
