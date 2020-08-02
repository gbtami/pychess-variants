import { VARIANTS, getPockets, isHandicap, validFen } from '../client/chess';
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
        it('should return true for standard chess initial position', () => { 
            const result = validFen('chess', VARIANTS['chess'].startFen);
            expect(result).to.be.true; 
    }); 
});
