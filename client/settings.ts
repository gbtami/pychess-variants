import { VNode } from 'snabbdom/vnode';

import { getDocumentData } from './document';

export interface ISettings<T> {
    readonly name: string;
    value: T;
    update(): void;
    view(): VNode;
}

abstract class Settings<T> implements ISettings<T> {
    readonly name: string;
    protected _value: T;

    constructor(name: string) {
        this.name = name;
    }

    get value(): T {
        return this._value;
    }
    set value(value: T) {
        // TODO some mechanism to save settings to server
        localStorage[this.name] = value;
        this._value = value;
        this.update();
    }

    abstract update(): void;
    abstract view(): VNode;
}

export abstract class StringSettings extends Settings<string> {
    constructor(name: string, defaultValue: string) {
        super(name);
        this._value = getDocumentData(name) ?? localStorage[name] ?? defaultValue;
    }
}

export abstract class NumberSettings extends Settings<number> {
    constructor(name: string, defaultValue: number) {
        super(name);
        this._value = Number(getDocumentData(name) ?? (localStorage[name] ?? defaultValue));
    }
}

export abstract class BooleanSettings extends Settings<boolean> {
    constructor(name: string, defaultValue: boolean) {
        super(name);
        if (getDocumentData(name))
            this._value = getDocumentData(name) === 'True';
        else if (localStorage[name])
            this._value = localStorage[name] === 'true';
        else
            this._value = defaultValue;
    }
}
