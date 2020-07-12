import { VNode } from "snabbdom/vnode";

// TODO Ideally all settings should be bound to account and fetched from server like the LanguageSettings
// In the meantime, the default for settings is local storage
export abstract class Settings<T> {
    readonly name: string;
    protected _value: T;

    constructor(name: string, defaultValue: T) {
        this.name = name;
        this._value = localStorage[name] ?? defaultValue;
    }

    get value(): T {
        return this._value;
    }
    set value(value: T) {
        localStorage[this.name] = value;
        this._value = value;
        this.update();
    }

    abstract update(): void;
    abstract view(): VNode;
}
