import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bufferToCents,
  centsToBuffer,
  formatBuffer,
  clampCycleDay,
  formatDayLabel,
  formatMoney,
  formatPeriodTitle,
  groupRecordsByDay,
  isOverspent,
  normalizeLook,
  resolveLook,
  monthKeyFromDate,
  nextBuffer,
  periodBounds,
  periodKeyFromDate,
  recordingDate,
  rulerMarks,
  shiftDay,
  shiftMonth,
  totals
} from './app.js'

test('金额按分计算，避开浮点误差', () => {
  assert.equal(bufferToCents('1.15'), 115)
  assert.equal(bufferToCents('0.29'), 29)
  assert.equal(bufferToCents('10.10'), 1010)
  assert.equal(bufferToCents('0.'), 0)
  assert.equal(bufferToCents('0.5'), 50)
  assert.equal(bufferToCents(''), 0)
})

test('键盘输入遵守小数位和上限', () => {
  assert.equal(nextBuffer('0', '8'), '8')
  assert.equal(nextBuffer('1', '0'), '10')
  assert.equal(nextBuffer('12.3', '4'), '12.34')
  assert.equal(nextBuffer('12.34', '5'), '12.34')
  assert.equal(nextBuffer('12', '.'), '12.')
  assert.equal(nextBuffer('12.3', '.'), '12.3')
  assert.equal(nextBuffer('0', '.'), '0.')
  assert.equal(nextBuffer('12.', 'back'), '12')
  assert.equal(nextBuffer('0', 'back'), '0')
  assert.equal(nextBuffer('9999999.9', '9'), '9999999.99')
  assert.equal(nextBuffer('9999999', '9'), '9999999')
})

test('显示金额时分组，输入过程保留小数点', () => {
  assert.equal(formatMoney(1010), '10.10')
  assert.equal(formatMoney(100000), '1,000.00')
  assert.equal(formatMoney(-50), '-0.50')
  assert.equal(formatMoney(5), '0.05')
  assert.equal(formatBuffer('1234.5'), '1,234.5')
  assert.equal(formatBuffer('0.'), '0.')
  assert.equal(formatBuffer('0.50'), '0.50')
  assert.equal(formatBuffer('0'), '0')
})

test('分和输入框可以来回转', () => {
  assert.equal(centsToBuffer(1200), '12')
  assert.equal(centsToBuffer(1250), '12.5')
  assert.equal(centsToBuffer(1205), '12.05')
  assert.equal(centsToBuffer(5), '0.05')
  assert.equal(bufferToCents(centsToBuffer(1205)), 1205)
})

test('月份和日期跨年、跨月', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29')
  assert.equal(monthKeyFromDate(new Date(2026, 9, 19)), '2026-10')
})

test('今天和昨天的标题', () => {
  const now = new Date(2026, 9, 19, 10, 30)
  assert.equal(formatDayLabel(now.getTime(), now), '今天 · 10月19日 周一')
  const yesterday = new Date(2026, 9, 18, 8, 0)
  assert.equal(formatDayLabel(yesterday.getTime(), now), '昨天 · 10月18日 周日')
})

test('跨天后记账日期回到今天，当天主动选择的日期保留', () => {
  assert.equal(recordingDate('2026-10-19', '2026-10-20'), '2026-10-20')
  assert.equal(recordingDate('2026-10-19', '2026-10-20', { editing: true }), '2026-10-19')
  assert.equal(
    recordingDate('2026-10-19', '2026-10-20', { pinnedDay: '2026-10-20' }),
    '2026-10-19'
  )
  assert.equal(
    recordingDate('2026-10-19', '2026-10-20', { pinnedDay: '2026-10-19' }),
    '2026-10-20'
  )
})

test('账单按时间倒序，新的一天排在前面', () => {
  const groups = groupRecordsByDay([
    { id: 'a', at: new Date(2026, 9, 19, 20, 32).getTime() },
    { id: 'b', at: new Date(2026, 9, 19, 15, 16).getTime() },
    { id: 'c', at: new Date(2026, 9, 20, 10, 55).getTime() },
    { id: 'd', at: new Date(2026, 9, 19, 18, 19).getTime() }
  ])
  assert.deepEqual(
    groups.map(([day, list]) => [day, list.map((rec) => rec.id)]),
    [
      ['2026-10-20', ['c']],
      ['2026-10-19', ['a', 'd', 'b']]
    ]
  )
})

test('月结周期从起始日到下月同一天之前', () => {
  assert.equal(clampCycleDay(15), 15)
  assert.equal(clampCycleDay(31), 28)
  assert.equal(clampCycleDay(0), 1)
  assert.equal(periodKeyFromDate(new Date(2026, 9, 20), 15), '2026-10')
  assert.equal(periodKeyFromDate(new Date(2026, 9, 10), 15), '2026-09')
  assert.equal(periodKeyFromDate(new Date(2026, 9, 20), 1), '2026-10')
  const aug = periodBounds('2026-08', 15)
  assert.equal(aug.start, new Date(2026, 7, 15).getTime())
  assert.equal(aug.end, new Date(2026, 8, 15).getTime())
  assert.equal(new Date(2026, 8, 14, 23, 59).getTime() < aug.end, true)
  assert.equal(new Date(2026, 8, 15).getTime() < aug.end, false)
  assert.equal(formatPeriodTitle('2026-08', 15), '8月15日 – 9月14日')
  assert.equal(formatPeriodTitle('2026-10', 1), '2026年10月')
})

test('只有超过支出上限才算超支', () => {
  assert.equal(isOverspent(5000, 0), false)
  assert.equal(isOverspent(5000, 8000), false)
  assert.equal(isOverspent(8000, 8000), false)
  assert.equal(isOverspent(8001, 8000), true)
})

test('外观配色能回到线装，自定颜色不接受坏值', () => {
  assert.equal(normalizeLook(null).id, 'radio')
  assert.equal(normalizeLook({ id: 'thread', rev: 2 }).id, 'radio')
  assert.equal(normalizeLook({ id: 'thread', rev: 3 }).id, 'thread')
  assert.equal(normalizeLook({ id: 'nope' }).id, 'radio')
  assert.equal(normalizeLook({ id: 'night' }).pattern, 'none')
  assert.equal(normalizeLook({ id: 'night', rev: 2, pattern: 'grid' }).pattern, 'none')
  assert.equal(normalizeLook({ id: 'night', rev: 3, particles: 'dust' }).particles, 'none')
  assert.equal(normalizeLook({ id: 'night', rev: 3, particles: 'firefly' }).particles, 'firefly')
  const custom = normalizeLook({ id: 'custom', colors: { sheet: 'red', ink: '#112233' } })
  assert.equal(custom.colors.sheet, '#f6f4f1')
  assert.equal(custom.colors.ink, '#112233')
  const night = resolveLook({ id: 'night' })
  assert.equal(night.dark, true)
  assert.equal(night.ink, '#e7eef4')
  assert.notEqual(night.card, night.ink)
})

test('每日支出的柱子标出有账的日期', () => {
  const marks = rulerMarks(31, [19])
  assert.ok(marks.includes(0))
  assert.ok(marks.includes(19))
  assert.ok(marks.includes(30))
  assert.ok(marks.every((n, i) => i === 0 || n - marks[i - 1] >= 3))
})

test('结余等于收入减支出', () => {
  assert.deepEqual(
    totals([
      { type: 'income', cents: 800000 },
      { type: 'expense', cents: 3550 },
      { type: 'expense', cents: 1200 }
    ]),
    { income: 800000, expense: 4750, balance: 795250 }
  )
})
