const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function readFunction(name) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0, `${name} must exist`);
    const brace = html.indexOf('{', html.indexOf(')', start));
    let depth = 0, quote = '', escaped = false;
    for(let index = brace; index < html.length; index++) {
        const char = html[index];
        if(quote) {
            if(escaped) escaped = false;
            else if(char === '\\') escaped = true;
            else if(char === quote) quote = '';
            continue;
        }
        if(char === '"' || char === "'" || char === '`') { quote = char; continue; }
        if(char === '{') depth++;
        if(char === '}' && --depth === 0) return html.slice(start, index + 1);
    }
    throw new Error(`unterminated ${name}`);
}

const now = new Date(2026, 7, 11, 12).getTime();
const todayStart = new Date(2026, 7, 11).getTime();
const yesterday = new Date(2026, 7, 10, 12).getTime();
const tomorrow = new Date(2026, 7, 12).getTime();
const stats = {
    A: { dueDate: todayStart, history:[{ time:yesterday }] },
    B: { dueDate: tomorrow, history:[{ time:yesterday }, { time:now, wasTodayReview:true }] },
    C: { dueDate: tomorrow, history:[{ time:now, wasTodayReview:false }] },
    D: { dueDate: tomorrow, history:[{ time:yesterday }, { time:now }] },
    E: { dueDate: tomorrow, history:[{ time:now }, { time:now + 1000 }] }
};
const context = {
    console, Date, Set, Map, Object, String, Array,
    library: {
        '행정법__총론': [{ id:'A', deck:'행정법__총론' }, { id:'B', deck:'행정법__총론' }, { id:'E', deck:'행정법__총론' }],
        '행정법__각론': [{ id:'A', deck:'행정법__각론' }, { id:'C', deck:'행정법__각론' }],
        '민법__총칙': [{ id:'D', deck:'민법__총칙' }]
    },
    getStatsStore: () => stats,
    findStatsForCard: card => stats[card.id] || {}
};
vm.createContext(context);
vm.runInContext('function getHistoryItemTime(item) { return Number(item && item.time) || 0; }', context);
['getTodayEssentialCardId', 'getLocalTodayBounds', 'isHistoryItemToday', 'isTodayReviewTarget', 'getUniqueLibraryCards', 'buildLearningStatsModel']
    .forEach(name => vm.runInContext(readFunction(name), context));

const model = context.buildLearningStatsModel(now);
assert.strictEqual(context.getUniqueLibraryCards().length, 5, 'library cards are unique by UUID');
assert.deepStrictEqual([...model.totals.todayReview].sort(), ['A', 'B', 'D'], 'due, processed review, and legacy processed review are included');
assert.deepStrictEqual([...model.totals.otherStudy].sort(), ['C', 'E'], 'today studies outside review targets are other');
assert.deepStrictEqual([...model.totals.totalStudy].sort(), ['B', 'C', 'D', 'E'], 'multiple events count once per UUID');
assert.deepStrictEqual([...model.decks.get('행정법').todayReview].sort(), ['A', 'B'], 'top deck includes all descendants');
assert.strictEqual(model.decks.get('행정법').totalStudy.size, 3, 'duplicate UUID across descendants is counted once');

const filterFunction = readFunction('applyFilterAndSort');
const selectorFunction = readFunction('buildTodayEssentialCandidates');
assert(filterFunction.includes("isTodayReviewTarget(s)"), 'today review filter reuses common predicate');
assert(selectorFunction.includes('isTodayReviewTarget(stat, todayStart)'), 'today essential selector reuses common predicate');
assert(!readFunction('buildLearningStatsModel').includes('setStorageItem'), 'statistics calculation is read-only');
assert(!html.includes('오늘 새로</span>'), 'Yople statistics UI has no today-new metric');

console.log('Yople learning stats scenarios passed');
