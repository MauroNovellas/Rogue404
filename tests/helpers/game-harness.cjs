const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'game.js'), 'utf8')
    .replace(/GameLogic\.init\(\);\s*$/, '');

module.exports = function harness({ renderInventory = false } = {}) {
    const elements = new Map(), listeners = new Map(), timers = new Map();
    let timerId = 0;
    const document = { hidden: false };
    const element = (tagName = 'DIV') => {
        const classes = new Set();
        return {
            tagName: tagName.toUpperCase(), style: {}, dataset: {}, children: [], isConnected: true,
            get textContent() { return (this._text || '') + this.children.map(child => child.textContent || '').join(''); },
            set textContent(value) { this._text = String(value); this.children = []; },
            classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) },
            appendChild(child) { child.parentNode = this; child.isConnected = true; this.children.push(child); return child; },
            prepend(child) { child.parentNode = this; child.isConnected = true; this.children.unshift(child); },
            remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.isConnected = false; },
            get innerHTML() { return this._html || ''; },
            set innerHTML(value) { this._html = value; this._text = ''; this.children.forEach(child => { child.isConnected = false; }); this.children = []; },
            get firstElementChild() { return this.children[0] || null; },
            get lastElementChild() { return this.children[this.children.length - 1] || null; },
            setAttribute(name, value) { this[name] = value; },
            focus() { document.activeElement = this; }
        };
    };
    const listen = (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
    };
    document.body = element(); document.head = element('HEAD');
    document.activeElement = document.body;
    document.getElementById = id => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    };
    document.createElement = element;
    document.addEventListener = listen;
    const context = {
        document, console, alert() {}, confirm: () => false,
        fetch: async () => ({ ok: true, json: async () => [] }),
        setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        addEventListener: (type, fn) => listen(`window:${type}`, fn)
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(`${source}\n;globalThis.core = { CONFIG, GameState, STATE_ENUM, DOM, MovementInput, ProgressionSystem, BalanceSystem, EquipmentSystem, EntityFactory, ShopSystem, CombatSystem, GameLogic, MapSystem, FloorSystem, Renderer, UISystem, StateController, Utils, InventorySystem, GroundSystem, Network };`, context);
    const core = context.core;
    core.GameState.current = core.STATE_ENUM.PLAYING;
    Object.assign(core.GameState.player, { hp: 100, maxHp: 100, food: 100, water: 100, baseAtk: 3, x: 20, y: 12, xp: 0, nextXp: 100 });
    if (!renderInventory) core.UISystem.renderInventory = () => {};
    const emit = (type, key, extra = {}) => {
        const event = { key, target: document.activeElement, repeat: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
        for (const fn of listeners.get(type) || []) fn(event);
        return event;
    };
    const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
    const tick = async () => {
        const [id, timer] = timers.entries().next().value || [];
        assert.ok(timer, 'Debe existir un temporizador pendiente');
        timers.delete(id); timer.fn(); await flush(); return timer.delay;
    };
    return { ...core, context, elements, document, timers, emit, flush, tick };
};
