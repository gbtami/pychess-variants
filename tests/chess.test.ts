import { getJanggiPoints, variants, VARIANTS, getPockets, isHandicap, validFen, cg2uci, uci2cg, UCIMove } from '../client/chess';
import { expect } from 'chai';

describe('getPockets test', 
    () => { 
        it('should return empty for chess', () => { 
            const result = getPockets(VARIANTS['chess'].startFen);
            expect(result).to.be.empty; 
    }); 
});

describe('getPockets test', 
    () => { 
        it('should return [HEhe] for S-chess', () => { 
            const result = getPockets(VARIANTS['seirawan'].startFen);
            expect(result).to.be.equal("[HEhe]"); 
    }); 
});

describe('isHandicap test', 
    () => { 
        it('should return true for HC tail', () => { 
            const result = isHandicap('10-PC HC');
            expect(result).to.be.true; 
    }); 
});

describe('validFen test', 
    () => { 
        it('should return true for all variants initial position', () => {
            variants.forEach( (variant) => {
                const result = validFen(VARIANTS[variant], VARIANTS[variant].startFen);
                expect(result).to.be.true; 
            });
    }); 
});

describe('uci2cg test', 
    () => { 
        it('should chnage all occurences of "10" to ":" in UCI moves', () => { 
            const result = uci2cg('a10j10' as UCIMove);
            expect(result).to.be.equal('a:j:'); 
    }); 
});

describe('cg2uci test', 
    () => { 
        it('should chnage all occurences of ":" to "10" in UCI moves', () => { 
            const result = cg2uci('a:j:');
            expect(result).to.be.equal('a10j10'); 
    }); 
});

describe('getJanggiPoints test',
    () => { 
        it('should return [72, 73.5]', () => { 
            const result = getJanggiPoints(VARIANTS['janggi'].startFen);
            expect(result).to.have.members([72, 73.5]); 
    }); 
});
