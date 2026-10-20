/** 记账本：金额以分存储，界面以元输入。 */

const STORAGE_KEY = 'ledger-book-v1'
const MAX_CENTS = 999999999
const WEEK = ['日', '一', '二', '三', '四', '五', '六']

const LOOKS = {
  radio: { name: '电台', sheet: '#08090b', ink: '#e8ecef', ticket: '#00f5d4', chop: '#f4d28a', green: '#45d68f' },
  thread: { name: '线装', sheet: '#f6f4f1', ink: '#1c1b19', ticket: '#8d7350', chop: '#8f3d38', green: '#3e6b56' },
  paper: { name: '素纸', sheet: '#f7f9fa', ink: '#1a3a52', ticket: '#f6c445', chop: '#c23a2e', green: '#1b7a4e' },
  night: { name: '夜账', sheet: '#1c2430', ink: '#e7eef4', ticket: '#e3b341', chop: '#e15a4a', green: '#7dcea0' },
  cinnabar: { name: '朱印', sheet: '#fbf6f3', ink: '#3a1c1c', ticket: '#f3d27a', chop: '#c23a2e', green: '#1b7a4e' },
  pine: { name: '松烟', sheet: '#f4f7f4', ink: '#1a3328', ticket: '#f0c95a', chop: '#b8452e', green: '#1f7a4a' }
}

const HEX = /^#[0-9a-fA-F]{6}$/

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbHex(r, g, b) {
  const part = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function mixHex(a, b, t) {
  const from = hexRgb(a)
  const to = hexRgb(b)
  return rgbHex(
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  )
}

function luminance(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function normalizeLook(raw) {
  let id = raw?.id === 'custom' || LOOKS[raw?.id] ? raw.id : 'radio'
  if (raw?.rev !== 3 && id === 'thread' && raw?.pattern !== 'photo') id = 'radio'
  const button = raw?.button === 'square' || raw?.button === 'pill' ? raw.button : 'round'
  const space = raw?.space === 'tight' || raw?.space === 'loose' ? raw.space : 'cozy'
  const kept = raw?.rev === 2 || raw?.rev === 3
  const pattern = raw?.pattern === 'photo' ? 'photo' : 'none'
  const particles = kept && (raw?.particles === 'gold' || raw?.particles === 'firefly') ? raw.particles : 'none'
  const look = { id, button, space, pattern, particles, rev: 3, colors: null }
  if (id === 'custom') {
    const base = LOOKS.thread
    const pick = (key) => (HEX.test(raw?.colors?.[key] || '') ? raw.colors[key] : base[key])
    look.colors = {
      sheet: pick('sheet'),
      ink: pick('ink'),
      ticket: pick('ticket'),
      chop: pick('chop'),
      green: pick('green')
    }
  }
  return look
}

export function resolveLook(look) {
  const safe = normalizeLook(look)
  const base = safe.id === 'custom' ? safe.colors : LOOKS[safe.id]
  const dark = luminance(base.sheet) < 0.35
  const sheet = base.sheet
  const ink = base.ink
  return {
    sheet,
    ink,
    ticket: base.ticket,
    chop: base.chop,
    green: base.green,
    paper: mixHex(sheet, ink, dark ? 0.22 : 0.16),
    muted: mixHex(ink, sheet, 0.42),
    line: mixHex(ink, sheet, dark ? 0.72 : 0.84),
    track: mixHex(ink, sheet, dark ? 0.78 : 0.9),
    card: dark ? mixHex(sheet, ink, 0.1) : mixHex(sheet, '#ffffff', 0.72),
    onInk: luminance(ink) > 0.55 ? sheet : '#ffffff',
    rule: dark ? 'rgba(255,255,255,0.08)' : 'rgba(44,36,22,0.1)',
    dark
  }
}

const CATS = {
  expense: [
    { id: 'food', name: '餐饮', glyph: '食' },
    { id: 'transit', name: '交通', glyph: '行' },
    { id: 'shop', name: '购物', glyph: '购' },
    { id: 'daily', name: '日用', glyph: '用' },
    { id: 'fun', name: '娱乐', glyph: '乐' },
    { id: 'home', name: '住房', glyph: '住' },
    { id: 'health', name: '医疗', glyph: '医' },
    { id: 'social', name: '人情', glyph: '礼' },
    { id: 'other', name: '其他', glyph: '其' }
  ],
  income: [
    { id: 'salary', name: '工资', glyph: '薪' },
    { id: 'bonus', name: '奖金', glyph: '奖' },
    { id: 'gift', name: '红包', glyph: '红' },
    { id: 'invest', name: '理财', glyph: '理' },
    { id: 'other-in', name: '其他', glyph: '其' }
  ]
}

const state = {
  tab: 'record',
  type: 'expense',
  expenseCat: 'food',
  incomeCat: 'salary',
  buffer: '0',
  note: '',
  date: '',
  editingId: null,
  month: '',
  cycleDay: 1,
  limitCents: 0,
  query: '',
  kind: 'all',
  records: [],
  lastId: null,
  look: normalizeLook(null)
}

let draftBackup = null
let datePinnedDay = ''
let flashTicket = false
let undoFn = null
let toastTimer = 0
let holdTimer = 0
let storageWarned = false

export function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function isoFromTs(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  return monthKeyFromDate(new Date(y, m - 1 + delta, 1))
}

export function shiftDay(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  return isoFromTs(new Date(y, m - 1, d + delta).getTime())
}

/** 结算日取 1–28，保证每个月都有这一天。 */
export function clampCycleDay(day) {
  const n = Math.round(Number(day))
  if (!Number.isInteger(n) || n < 1) return 1
  return Math.min(28, n)
}

/** 周期从当月 cycleDay 开始，到下月同一天之前结束。1 号就是自然月。 */
export function periodKeyFromDate(date, cycleDay) {
  const day = clampCycleDay(cycleDay)
  const d = date instanceof Date ? date : new Date(date)
  let y = d.getFullYear()
  let m = d.getMonth()
  if (d.getDate() < day) {
    m -= 1
    if (m < 0) {
      m = 11
      y -= 1
    }
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export function periodBounds(key, cycleDay) {
  const day = clampCycleDay(cycleDay)
  const [y, m] = String(key).split('-').map(Number)
  return {
    start: new Date(y, m - 1, day).getTime(),
    end: new Date(y, m, day).getTime()
  }
}

export function formatPeriodTitle(key, cycleDay) {
  const day = clampCycleDay(cycleDay)
  if (day === 1) {
    const [y, m] = String(key).split('-')
    return `${y}年${Number(m)}月`
  }
  const { start, end } = periodBounds(key, day)
  const a = new Date(start)
  const b = new Date(end - 1)
  const left = `${a.getMonth() + 1}月${a.getDate()}日`
  const right = `${b.getMonth() + 1}月${b.getDate()}日`
  if (a.getFullYear() !== b.getFullYear()) return `${a.getFullYear()}年${left} – ${b.getFullYear()}年${right}`
  return `${left} – ${right}`
}

/** 只有设了上限，并且支出超过它，才算超支。 */
export function isOverspent(expenseCents, limitCents) {
  const limit = Math.round(Number(limitCents) || 0)
  if (limit <= 0) return false
  return Math.round(Number(expenseCents) || 0) > limit
}

export function bufferToCents(buf) {
  if (!buf || buf === '.') return 0
  const [iRaw, dRaw = ''] = String(buf).split('.')
  if (iRaw !== '' && !/^\d+$/.test(iRaw)) return 0
  if (dRaw && !/^\d+$/.test(dRaw)) return 0
  const yuan = iRaw === '' ? 0 : Number(iRaw)
  if (!Number.isSafeInteger(yuan)) return 0
  const dec = (dRaw + '00').slice(0, 2)
  return yuan * 100 + Number(dec)
}

export function nextBuffer(buf, key) {
  const cur = buf || '0'
  if (key === 'back') {
    const cut = cur.slice(0, -1)
    return cut === '' ? '0' : cut
  }
  if (key === 'clear') return '0'
  if (key === '.') {
    if (cur.includes('.')) return cur
    return `${cur}.`
  }
  if (!/^\d$/.test(key)) return cur
  const base = cur === '0' ? '' : cur
  const next = base + key
  if ((next.split('.')[1] || '').length > 2) return cur
  if (bufferToCents(next) > MAX_CENTS) return cur
  return next
}

function groupInt(intStr) {
  return String(intStr).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatMoney(cents) {
  const n = Math.round(Number(cents) || 0)
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const yuan = Math.floor(abs / 100)
  const dec = String(abs % 100).padStart(2, '0')
  return `${sign}${groupInt(yuan)}.${dec}`
}

export function formatBuffer(buf) {
  if (!buf || buf === '0') return '0'
  const hasDot = buf.includes('.')
  let [i, d = ''] = buf.split('.')
  if (!i) i = '0'
  i = i.replace(/^0+(?=\d)/, '')
  return `${groupInt(i)}${hasDot ? `.${d}` : ''}`
}

export function centsToBuffer(cents) {
  const abs = Math.abs(Math.round(Number(cents) || 0))
  const yuan = Math.floor(abs / 100)
  const dec = abs % 100
  if (dec === 0) return String(yuan)
  if (dec % 10 === 0) return `${yuan}.${dec / 10}`
  return `${yuan}.${String(dec).padStart(2, '0')}`
}

export function totals(records) {
  let income = 0
  let expense = 0
  for (const rec of records) {
    if (rec.type === 'income') income += rec.cents
    else expense += rec.cents
  }
  return { income, expense, balance: income - expense }
}

/** 没在改旧账、也没在今天主动选过日期时，记账日期回到今天。 */
export function recordingDate(savedDate, today, { editing = false, pinnedDay = '' } = {}) {
  const saved = /^\d{4}-\d{2}-\d{2}$/.test(savedDate || '') ? savedDate : ''
  if (editing && saved) return saved
  if (pinnedDay === today && saved) return saved
  return today
}

/** 先按天从新到旧，同一天内再按时间从新到旧。 */
export function groupRecordsByDay(records) {
  const sorted = [...records].sort((a, b) => b.at - a.at || String(b.id).localeCompare(String(a.id)))
  const groups = new Map()
  for (const rec of sorted) {
    const key = isoFromTs(rec.at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(rec)
  }
  return [...groups.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => [key, groups.get(key)])
}

export function formatDayLabel(ts, now = new Date()) {
  const d = new Date(ts)
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  const w = `周${WEEK[d.getDay()]}`
  const today = isoFromTs(now.getTime())
  const iso = isoFromTs(ts)
  if (iso === today) return `今天 · ${md} ${w}`
  if (iso === shiftDay(today, -1)) return `昨天 · ${md} ${w}`
  if (d.getFullYear() !== now.getFullYear()) return `${d.getFullYear()}年${md} ${w}`
  return `${md} ${w}`
}

function todayISO() {
  return isoFromTs(Date.now())
}

function formatMD(iso) {
  const [, m, d] = iso.split('-')
  return `${Number(m)}月${Number(d)}日`
}

function formatHM(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  )
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function catById(type, id) {
  const list = CATS[type] || CATS.expense
  return list.find((cat) => cat.id === id) || { id: id || 'other', name: '其他', glyph: '其' }
}

function knownCat(type, id) {
  const list = CATS[type] || CATS.expense
  if (list.some((cat) => cat.id === id)) return id
  return list[list.length - 1].id
}

function currentCatId() {
  return state.type === 'expense' ? state.expenseCat : state.incomeCat
}

function setCat(id) {
  const safe = knownCat(state.type, id)
  if (state.type === 'expense') state.expenseCat = safe
  else state.incomeCat = safe
}

function recordsInMonth(key) {
  const { start, end } = periodBounds(key, state.cycleDay)
  return state.records.filter((rec) => rec.at >= start && rec.at < end)
}

function currentPeriodKey() {
  return periodKeyFromDate(new Date(), state.cycleDay)
}

function visibleRecords() {
  const q = state.query.trim()
  return recordsInMonth(state.month)
    .filter((rec) => {
      if (state.kind !== 'all' && rec.type !== state.kind) return false
      if (!q) return true
      const cat = catById(rec.type, rec.cat)
      return cat.name.includes(q) || (rec.note || '').includes(q)
    })
    .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
}

function isRecord(rec) {
  if (!rec || typeof rec !== 'object') return false
  if (typeof rec.id !== 'string' || !rec.id) return false
  if (rec.type !== 'expense' && rec.type !== 'income') return false
  if (typeof rec.cat !== 'string') return false
  const cents = Math.round(Number(rec.cents))
  if (!Number.isInteger(cents) || cents <= 0 || cents > MAX_CENTS) return false
  if (typeof rec.at !== 'number' || !Number.isFinite(rec.at)) return false
  rec.cents = cents
  if (typeof rec.note !== 'string') rec.note = ''
  rec.note = rec.note.slice(0, 40)
  return true
}

function cleanBuffer(buf) {
  if (typeof buf !== 'string' || !/^\d+\.\d{0,2}$|^\d+$/.test(buf)) return '0'
  if (bufferToCents(buf) > MAX_CENTS) return '0'
  return buf
}

function load() {
  state.date = todayISO()
  state.cycleDay = 1
  state.limitCents = 0
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.records)) state.records = raw.records.filter(isRecord)
    const prefs = raw.prefs || {}
    if (prefs.type === 'expense' || prefs.type === 'income') state.type = prefs.type
    if (typeof prefs.expenseCat === 'string') state.expenseCat = knownCat('expense', prefs.expenseCat)
    if (typeof prefs.incomeCat === 'string') state.incomeCat = knownCat('income', prefs.incomeCat)
    if (typeof prefs.note === 'string') state.note = prefs.note.slice(0, 40)
    state.buffer = cleanBuffer(prefs.buffer)
    if (typeof prefs.editingId === 'string') state.editingId = prefs.editingId
    if (typeof prefs.lastId === 'string') state.lastId = prefs.lastId
    if (state.editingId && !state.records.some((rec) => rec.id === state.editingId)) state.editingId = null
    if (state.editingId && /^\d{4}-\d{2}-\d{2}$/.test(prefs.date || '')) state.date = prefs.date
    state.cycleDay = clampCycleDay(prefs.cycleDay)
    const limit = Math.round(Number(prefs.limitCents) || 0)
    state.limitCents = limit > 0 && limit <= MAX_CENTS ? limit : 0
    state.look = normalizeLook(prefs.look)
    }
  } catch {
    /* 坏掉的本地账本当空账本打开 */
  }
  state.month = currentPeriodKey()
}

function payload() {
  return {
    records: state.records,
    prefs: {
      type: state.type,
      expenseCat: state.expenseCat,
      incomeCat: state.incomeCat,
      buffer: state.buffer,
      note: state.note,
      date: state.date,
      editingId: state.editingId,
      lastId: state.lastId,
      cycleDay: state.cycleDay,
      limitCents: state.limitCents,
      look: state.look
    }
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload()))
  } catch {
    if (!storageWarned) {
      storageWarned = true
      showToast('这台浏览器没能存下，关掉页面后这笔可能找不回')
    }
  }
}

function speak(text) {
  const live = document.getElementById('live')
  if (live) live.textContent = text
}

function showToast(text, onUndo) {
  const el = document.getElementById('toast')
  if (!el) return
  undoFn = onUndo || null
  el.replaceChildren()
  const span = document.createElement('span')
  span.textContent = text
  el.append(span)
  if (onUndo) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.act = 'undo'
    button.textContent = '撤销'
    el.append(button)
  }
  el.hidden = false
  speak(text)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el.hidden = true
    undoFn = null
  }, onUndo ? 5000 : 2200)
}

function buzz() {
  try {
    navigator.vibrate?.(12)
  } catch {
    /* 部分浏览器不允许震动 */
  }
}

function amountLen(text) {
  if (text.length > 11) return 's'
  if (text.length > 8) return 'm'
  return 'l'
}

function enteringAmount() {
  return Boolean(state.editingId) || state.buffer !== '0'
}

function selectedDayCents() {
  const day = state.date || todayISO()
  return state.records
    .filter((rec) => rec.type === state.type && isoFromTs(rec.at) === day)
    .reduce((sum, rec) => sum + rec.cents, 0)
}

function displayKicker() {
  if (state.editingId) return '正在修改'
  if (state.buffer !== '0') return '这笔'
  const word = state.type === 'income' ? '收入' : '支出'
  const today = todayISO()
  const day = state.date || today
  if (day === today) return `今日${word}`
  if (day === shiftDay(today, -1)) return `昨日${word}`
  return `${formatMD(day)}${word}`
}

function displayAmountText() {
  if (enteringAmount()) return formatBuffer(state.buffer)
  return formatMoney(selectedDayCents())
}

function paintAmount() {
  const el = document.querySelector('[data-amount]')
  if (!el) return
  const text = displayAmountText()
  if (el.textContent !== text) {
    el.textContent = text
    el.classList.remove('is-tick')
    void el.offsetWidth
    el.classList.add('is-tick')
  }
  el.dataset.len = amountLen(text)
  const kicker = document.querySelector('.kicker')
  if (kicker) kicker.textContent = displayKicker()
  const cents = bufferToCents(state.buffer)
  const save = document.querySelector('[data-act="save"]')
  if (save) save.setAttribute('aria-disabled', cents <= 0 ? 'true' : 'false')
  const ticket = document.querySelector('.ticket')
  if (ticket) ticket.classList.toggle('is-total', !enteringAmount())
  if (cents > 0) ticket?.classList.remove('is-invalid')
  const last = document.querySelector('[data-last]')
  if (last) last.style.visibility = state.buffer === '0' && !state.editingId && last.dataset.copy ? 'visible' : 'hidden'
}

function syncTabs() {
  for (const button of document.querySelectorAll('.tabs button')) {
    if (button.dataset.tab === state.tab) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  const view = document.getElementById('view')
  const labels = { record: '记账', bills: '账单', month: '月结', look: '外观' }
  view?.setAttribute('aria-label', labels[state.tab] || '记账')
}

function afterRender() {
  syncTabs()
  const chip = document.querySelector('.chips .chip.is-on')
  const scroller = document.querySelector('.chips')
  if (chip && scroller) {
    scroller.scrollLeft = chip.offsetLeft - (scroller.clientWidth - chip.clientWidth) / 2
  }
  paintAmount()
}

function render() {
  const view = document.getElementById('view')
  if (!view) return
  if (state.tab === 'bills') view.innerHTML = renderBills()
  else if (state.tab === 'month') view.innerHTML = renderMonth()
  else if (state.tab === 'look') view.innerHTML = renderLook()
  else view.innerHTML = renderRecord()
  afterRender()
}

function lastLineText() {
  const rec = state.records.find((item) => item.id === state.lastId)
  if (!rec) return ''
  const cat = catById(rec.type, rec.cat)
  const sign = rec.type === 'income' ? '+' : '−'
  return `上一笔 · ${cat.name} ${sign}${formatMoney(rec.cents)}`
}

function renderRecord() {
  const today = todayISO()
  const yesterday = shiftDay(today, -1)
  const cats = CATS[state.type]
  const selected = currentCatId()
  const chips = cats
    .map(
      (cat) =>
        `<button type="button" class="chip${cat.id === selected ? ' is-on' : ''}" data-act="cat" data-id="${esc(cat.id)}" aria-pressed="${cat.id === selected}">${esc(cat.name)}</button>`
    )
    .join('')
  const editing = state.editingId
    ? `<div class="editing">正在改这一笔<button type="button" data-act="cancel-edit">取消</button></div>`
    : ''
  const last = lastLineText()
  const saveLabel = state.editingId ? '保存修改' : '记下来'
  return `<section class="screen screen-record">
    <p class="record-mark">记账</p>
    <div class="record-scroll">
      ${editing}
      <div class="seg two" role="group" aria-label="收入或支出">
        <button type="button" data-act="type" data-type="expense" class="${state.type === 'expense' ? 'is-on' : ''}" aria-pressed="${state.type === 'expense'}">支出</button>
        <button type="button" data-act="type" data-type="income" class="${state.type === 'income' ? 'is-on' : ''}" aria-pressed="${state.type === 'income'}">收入</button>
      </div>
      <div class="dates">
        <button type="button" class="chip${state.date === yesterday ? ' is-on' : ''}" data-act="date" data-date="yesterday" aria-pressed="${state.date === yesterday}">昨天</button>
        <button type="button" class="chip${state.date === today ? ' is-on' : ''}" data-act="date" data-date="today" aria-pressed="${state.date === today}">今天</button>
        <input id="when" type="date" aria-label="选择日期" value="${esc(state.date)}" class="${state.date !== today && state.date !== yesterday ? 'is-on' : ''}">
      </div>
      <div class="chips" aria-label="分类">${chips}</div>
      <input id="note" class="note" type="text" maxlength="40" placeholder="备注，可不填" value="${esc(state.note)}" enterkeyhint="done" autocomplete="off" aria-label="备注">
      <div class="ticket${flashTicket ? ' is-saved' : ''}">
        <p class="kicker">${esc(displayKicker())}</p>
        <div class="ticket-amt"><span class="yen">¥</span><span data-amount>${esc(displayAmountText())}</span></div>
        <i class="chop" aria-hidden="true">${state.type === 'income' ? '收' : '支'}</i>
        <p class="last" data-last data-copy="${esc(last)}">${esc(last)}</p>
      </div>
    </div>
    <div class="pad-wrap">
      <div class="pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
          .map((n) => `<button type="button" class="key" data-act="key" data-key="${n}">${n}</button>`)
          .join('')}
        <button type="button" class="key" data-act="key" data-key="dot" aria-label="小数点">.</button>
        <button type="button" class="key" data-act="key" data-key="0">0</button>
        <button type="button" class="key" data-act="key" data-key="back" aria-label="删除一位，长按清空">⌫</button>
        <button type="button" class="key-save" data-act="save" data-long="${saveLabel.length > 3 ? '1' : '0'}" aria-label="${esc(saveLabel)}">${[...saveLabel].map((ch) => `<span>${esc(ch)}</span>`).join('')}</button>
      </div>
    </div>
  </section>`
}

function monthBarHtml() {
  const current = currentPeriodKey()
  const back =
    state.month === current
      ? ''
      : '<button type="button" class="textbtn" data-act="month-now">回到本月</button>'
  return `<div class="monthbar">
    <button type="button" class="iconbtn" data-act="month" data-delta="-1" aria-label="上个月">‹</button>
    <div class="monthbar-mid"><h1>${formatPeriodTitle(state.month, state.cycleDay)}</h1>${back}</div>
    <button type="button" class="iconbtn" data-act="month" data-delta="1" aria-label="下个月">›</button>
  </div>`
}

function sumlineHtml(records) {
  if (!records.length) return ''
  const sum = totals(records)
  const filtered = state.kind !== 'all' || state.query.trim()
  const prefix = filtered ? '筛选结果 · ' : ''
  const bits = []
  if (sum.income) bits.push(`收入 <strong>¥${formatMoney(sum.income)}</strong>`)
  if (sum.expense) bits.push(`支出 <strong>¥${formatMoney(sum.expense)}</strong>`)
  return `${prefix}${records.length} 笔${bits.length ? ` · ${bits.join(' · ')}` : ''}`
}

function billListInnerHtml(records) {
  if (!recordsInMonth(state.month).length) {
    return `<div class="empty">
      <h2>这个月还是空白的</h2>
      <p>记下一笔午餐或地铁，它会按天出现在这里。</p>
      <button type="button" class="primary" data-act="tab" data-tab="record">去记一笔</button>
    </div>`
  }
  if (!records.length) {
    return `<div class="empty">
      <h2>没有符合的账单</h2>
      <p>换个分类，或清空搜索。</p>
      <button type="button" class="primary" data-act="clear-filter">清空筛选</button>
    </div>`
  }
  let html = ''
  for (const [, list] of groupRecordsByDay(records)) {
    const sum = totals(list)
    const bits = []
    if (sum.expense) bits.push(`支 ${formatMoney(sum.expense)}`)
    if (sum.income) bits.push(`收 ${formatMoney(sum.income)}`)
    html += `<div class="dayhead"><span>${esc(formatDayLabel(list[0].at))}</span><span>${esc(bits.join(' · '))}</span></div>`
    for (const rec of list) {
      const cat = catById(rec.type, rec.cat)
      const sign = rec.type === 'income' ? '+' : '−'
      const meta = rec.note ? `${rec.note} · ${formatHM(rec.at)}` : formatHM(rec.at)
      html += `<div class="row">
        <button type="button" class="row-main" data-act="edit" data-id="${esc(rec.id)}">
          <i class="chop" aria-hidden="true">${esc(cat.glyph)}</i>
          <span class="name">${esc(cat.name)}</span>
          <span class="meta">${esc(meta)}</span>
          <span class="amt ${rec.type}">${sign}${formatMoney(rec.cents)}</span>
        </button>
        <button type="button" class="row-del" data-act="del" data-id="${esc(rec.id)}">删除</button>
      </div>`
    }
  }
  return html
}

function renderBills() {
  const records = visibleRecords()
  const kinds = [
    ['all', '全部'],
    ['expense', '支出'],
    ['income', '收入']
  ]
  const seg = kinds
    .map(
      ([id, label]) =>
        `<button type="button" data-act="kind" data-kind="${id}" class="${state.kind === id ? 'is-on' : ''}" aria-pressed="${state.kind === id}">${label}</button>`
    )
    .join('')
  return `<section class="screen screen-bills">
    ${monthBarHtml()}
    <div class="seg three" role="group" aria-label="账单类型">${seg}</div>
    <div class="search-wrap">
      <input id="q" class="search" type="search" placeholder="搜分类或备注" value="${esc(state.query)}" autocomplete="off" aria-label="搜索账单" enterkeyhint="search">
      <button type="button" class="clear-q" data-act="clear-q" aria-label="清空搜索"${state.query ? '' : ' hidden'}>×</button>
    </div>
    <p class="sumline" id="sumline">${sumlineHtml(records)}</p>
    <div class="bill-scroll" id="bill-list">${billListInnerHtml(records)}</div>
  </section>`
}

function paintBills() {
  const records = visibleRecords()
  const list = document.getElementById('bill-list')
  if (list) list.innerHTML = billListInnerHtml(records)
  const sum = document.getElementById('sumline')
  if (sum) sum.innerHTML = sumlineHtml(records)
  const clear = document.querySelector('[data-act="clear-q"]')
  if (clear) clear.hidden = !state.query
}

function catLinesHtml(records, type) {
  const list = records.filter((rec) => rec.type === type)
  const sum = list.reduce((total, rec) => total + rec.cents, 0)
  if (!sum) {
    return `<p class="quiet">${type === 'income' ? '这个月还没有收入。' : '这个月还没有支出。'}</p>`
  }
  const byCat = new Map()
  for (const rec of list) byCat.set(rec.cat, (byCat.get(rec.cat) || 0) + rec.cents)
  const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  return rows
    .map(([id, cents]) => {
      const cat = catById(type, id)
      const width = Math.max(4, Math.round((cents / sum) * 100))
      return `<div class="catline">
        <i class="chop sm" aria-hidden="true">${esc(cat.glyph)}</i>
        <span class="name">${esc(cat.name)} <em>${Math.round((cents / sum) * 100)}%</em></span>
        <span class="meter ${type}"><span style="width:${width}%"></span></span>
        <span class="fig">¥${formatMoney(cents)}</span>
      </div>`
    })
    .join('')
}

function periodIsos(key) {
  const { start, end } = periodBounds(key, state.cycleDay)
  const isos = []
  const cursor = new Date(start)
  while (cursor.getTime() < end) {
    isos.push(isoFromTs(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return isos
}

/** 柱下标出有支出的日期，并均匀带上月初月末，太近的弱标让位。 */
export function rulerMarks(count, hotIndexes) {
  const n = count
  if (!n) return []
  const hot = new Set(hotIndexes)
  const wanted = new Set([0, n - 1])
  const step = Math.max(1, Math.round((n - 1) / 4))
  for (let i = step; i < n - 1; i += step) wanted.add(i)
  for (const i of hot) {
    if (i >= 0 && i < n) wanted.add(i)
  }
  const rank = (i) => (hot.has(i) ? 1 : 0)
  const chosen = []
  const order = [...wanted].sort((a, b) => rank(b) - rank(a) || a - b)
  for (const i of order) {
    const clashes = chosen.filter((j) => Math.abs(j - i) < 3)
    if (clashes.some((j) => rank(j) >= rank(i))) continue
    for (const j of clashes) chosen.splice(chosen.indexOf(j), 1)
    chosen.push(i)
  }
  return chosen.sort((a, b) => a - b)
}

function dayTick(iso, originMonth) {
  const [, month, day] = iso.split('-').map(Number)
  return month === originMonth ? String(day) : `${month}/${day}`
}

function rulerHtml(records) {
  const byDay = new Map()
  for (const rec of records) {
    if (rec.type !== 'expense') continue
    const iso = isoFromTs(rec.at)
    byDay.set(iso, (byDay.get(iso) || 0) + rec.cents)
  }
  let peak = 0
  for (const value of byDay.values()) peak = Math.max(peak, value)
  const today = todayISO()
  const isos = periodIsos(state.month)
  const hot = []
  isos.forEach((iso, index) => {
    if (byDay.get(iso) || iso === today) hot.push(index)
  })
  const marks = new Set(rulerMarks(isos.length, hot))
  const originMonth = isos.length ? Number(isos[0].split('-')[1]) : 1
  let cols = ''
  isos.forEach((iso, index) => {
    const cents = byDay.get(iso) || 0
    const height = cents && peak ? Math.max(8, Math.round((cents / peak) * 100)) : 0
    const cls = [cents ? 'has' : 'is-empty', iso === today ? 'is-today' : ''].filter(Boolean).join(' ')
    const on = marks.has(index) && (cents || iso === today)
    const label = marks.has(index) ? dayTick(iso, originMonth) : ''
    const title = cents ? `${formatMD(iso)} ¥${formatMoney(cents)}` : formatMD(iso)
    cols += `<span class="col" title="${esc(title)}"><i class="${cls}" style="--h:${height}"></i><b class="${on ? 'is-on' : ''}">${label}</b></span>`
  })
  return `<div class="ruler">${cols}</div>`
}

function peakSentence(records) {
  const byDay = new Map()
  for (const rec of records) {
    if (rec.type !== 'expense') continue
    const iso = isoFromTs(rec.at)
    byDay.set(iso, (byDay.get(iso) || 0) + rec.cents)
  }
  let best = null
  for (const [iso, cents] of byDay) {
    if (!best || cents > best.cents || (cents === best.cents && iso > best.iso)) best = { iso, cents }
  }
  if (!best) return ''
  return `支出最多的一天是 ${formatMD(best.iso)}，¥${formatMoney(best.cents)}。`
}

function capLiveHtml(records) {
  const spent = totals(records).expense
  const limit = state.limitCents
  if (limit <= 0) {
    return `<p class="cap-status" id="cap-status">没设上限，支出再多也不算超支</p>`
  }
  const over = isOverspent(spent, limit)
  const width = Math.min(100, Math.round((spent / limit) * 100))
  const status = over
    ? `超支 ¥${formatMoney(spent - limit)}`
    : `还剩 ¥${formatMoney(limit - spent)}`
  return `<p class="cap-status${over ? ' is-over' : ''}" id="cap-status">${status}</p>
    <div class="meter cap-meter${over ? ' is-over' : ''}" aria-hidden="true"><span style="width:${width}%"></span></div>`
}

function settleHtml(records) {
  const limitValue = state.limitCents > 0 ? centsToBuffer(state.limitCents) : ''
  return `<div class="settle">
    <label class="settle-row">
      <span>每月从</span>
      <input id="cycle-day" type="number" min="1" max="28" inputmode="numeric" aria-label="每月起始日" value="${state.cycleDay}">
      <span>号开始</span>
    </label>
    <p class="settle-range">${esc(formatPeriodTitle(state.month, state.cycleDay))}</p>
    <label class="settle-row">
      <span>支出上限</span>
      <input id="limit-yuan" class="wide" type="text" inputmode="decimal" placeholder="可不填" aria-label="每月支出上限，单位元" value="${esc(limitValue)}">
      <span>元</span>
    </label>
    <div id="cap-live">${capLiveHtml(records)}</div>
  </div>`
}

function renderMonth() {
  const records = recordsInMonth(state.month)
  const sum = totals(records)
  const nowKey = currentPeriodKey()
  const { start, end } = periodBounds(state.month, state.cycleDay)
  const span = Math.max(1, Math.round((end - start) / 86400000))
  const days = state.month === nowKey ? Math.max(1, Math.min(span, Math.floor((Date.now() - start) / 86400000) + 1)) : span
  const avg = sum.expense ? Math.round(sum.expense / days) : 0
  const balance = sum.balance
  const body = records.length
    ? `<p class="balance-label">结余</p>
      <p class="balance-num">${balance < 0 ? '<span class="sign">−</span>' : ''}<span class="yen">¥</span>${formatMoney(Math.abs(balance))}</p>
      <dl class="pair">
        <div><dt>收入</dt><dd class="income">¥${formatMoney(sum.income)}</dd></div>
        <div><dt>支出</dt><dd>¥${formatMoney(sum.expense)}</dd></div>
      </dl>
      ${avg ? `<p class="avg">${state.month === nowKey ? '截至今天，' : ''}日均支出 ¥${formatMoney(avg)}</p>` : ''}
      <h2 class="section-title">每日支出</h2>
      ${rulerHtml(records)}
      <p class="peak">${peakSentence(records) || '这个月还没有支出。'}</p>
      <h2 class="section-title">支出去向</h2>
      ${catLinesHtml(records, 'expense')}
      <h2 class="section-title">收入来源</h2>
      ${catLinesHtml(records, 'income')}`
    : `<div class="empty">
        <h2>这个月还没有账</h2>
        <p>记一笔之后，这里会给出结余、每天支出和分类占比。</p>
        <button type="button" class="primary" data-act="tab" data-tab="record">去记一笔</button>
      </div>`
  return `<section class="screen screen-month">
    ${monthBarHtml()}
    <div class="sheet-pad">
      ${settleHtml(records)}
      ${body}
      <button type="button" class="ghost" data-act="tab" data-tab="look">外观</button>
    </div>
  </section>`
}

function renderLook() {
  const theme = resolveLook(state.look)
  const swatches = Object.entries(LOOKS)
    .map(([id, item]) => {
      const on = state.look.id === id
      return `<button type="button" class="swatch${on ? ' is-on' : ''}" data-act="look" data-key="id" data-val="${id}" aria-pressed="${on}"><i style="--swatch:${item.ticket}"></i><span>${item.name}</span></button>`
    })
    .join('')
  const customOn = state.look.id === 'custom'
  const choice = (key, val, label) => {
    const on = state.look[key] === val
    return `<button type="button" class="${on ? 'is-on' : ''}" data-act="look" data-key="${key}" data-val="${val}" aria-pressed="${on}">${label}</button>`
  }
  const color = (key, label) =>
    `<label>${label}<input type="color" data-look-color="${key}" value="${theme[key]}" aria-label="${label}"></label>`
  const photoOn = state.look.pattern === 'photo'
  return `<section class="screen screen-month screen-look">
    <div class="monthbar">
      <button type="button" class="textbtn" data-act="tab" data-tab="month">完成</button>
      <div class="monthbar-mid"><h1>外观</h1></div>
      <span></span>
    </div>
    <div class="sheet-pad look-pad">
      <section class="look-card">
        <h2>配色</h2>
        <div class="swatches">${swatches}<button type="button" class="swatch${customOn ? ' is-on' : ''}" data-act="look" data-key="id" data-val="custom" aria-pressed="${customOn}"><i style="--swatch:${theme.ticket}"></i><span>自定</span></button></div>
        ${customOn ? `<div class="colors">${color('sheet', '底色')}${color('ink', '文字')}${color('ticket', '强调')}${color('chop', '点缀')}</div>` : ''}
      </section>
      <section class="look-card">
        <h2>按钮</h2>
        <div class="look-row">${choice('button', 'round', '圆角')}${choice('button', 'square', '方正')}${choice('button', 'pill', '胶囊')}</div>
      </section>
      <section class="look-card">
        <h2>间距</h2>
        <div class="look-row">${choice('space', 'tight', '紧凑')}${choice('space', 'cozy', '适中')}${choice('space', 'loose', '疏松')}</div>
      </section>
      <section class="look-card">
        <h2>背景</h2>
        <div class="look-row">${choice('pattern', 'none', '纯色')}${choice('pattern', 'photo', '图片')}</div>
        ${photoOn ? `<div class="bg-actions"><button type="button" data-act="pick-bg">从相册选图</button>${bgUrl ? '<button type="button" data-act="clear-bg">去掉图片</button>' : ''}</div>` : ''}
        <input id="bg-file" type="file" accept="image/*" hidden>
      </section>
      <section class="look-card">
        <h2>粒子</h2>
        <div class="look-row">${choice('particles', 'none', '关')}${choice('particles', 'gold', '金粉')}${choice('particles', 'firefly', '萤火')}</div>
      </section>
    </div>
  </section>`
}

function snapshot() {
  return {
    tab: state.tab,
    type: state.type,
    expenseCat: state.expenseCat,
    incomeCat: state.incomeCat,
    buffer: state.buffer,
    note: state.note,
    date: state.date,
    editingId: state.editingId
  }
}

function combineDate(iso, originalTs) {
  const [y, m, d] = iso.split('-').map(Number)
  const src = originalTs ? new Date(originalTs) : new Date()
  return new Date(y, m - 1, d, src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds()).getTime()
}

function rejectEmpty() {
  const ticket = document.querySelector('.ticket')
  if (ticket) {
    ticket.classList.remove('is-shake')
    void ticket.offsetWidth
    ticket.classList.add('is-shake', 'is-invalid')
  }
  buzz()
  showToast('先输入金额')
}

function pinRecordingDate() {
  datePinnedDay = todayISO()
}

function commit() {
  if (!state.editingId) {
    state.date = recordingDate(state.date, todayISO(), { pinnedDay: datePinnedDay })
  }
  const cents = bufferToCents(state.buffer)
  if (cents <= 0) {
    rejectEmpty()
    return
  }
  const wasEdit = Boolean(state.editingId)
  const previous = wasEdit ? state.records.find((rec) => rec.id === state.editingId) : null
  const cat = catById(state.type, currentCatId())
  const rec = {
    id: state.editingId || uid(),
    type: state.type,
    cat: cat.id,
    cents,
    note: state.note.trim().slice(0, 40),
    at: combineDate(state.date || todayISO(), previous?.at)
  }
  if (previous) {
    const index = state.records.findIndex((item) => item.id === previous.id)
    if (index >= 0) state.records[index] = rec
    else state.records.push(rec)
  } else {
    state.records.push(rec)
  }
  state.lastId = rec.id
  state.editingId = null
  state.buffer = '0'
  state.note = ''
  state.date = todayISO()
  datePinnedDay = ''
  state.month = periodKeyFromDate(new Date(rec.at), state.cycleDay)
  state.query = ''
  state.kind = 'all'
  draftBackup = null
  if (wasEdit) state.tab = 'bills'
  const text = wasEdit
    ? `已保存 · ${cat.name} ¥${formatMoney(cents)}`
    : `已记下 · ${cat.name} ¥${formatMoney(cents)}`
  flashTicket = !wasEdit
  persist()
  buzz()
  render()
  flashTicket = false
  showToast(text)
}

function startEdit(rec) {
  draftBackup = snapshot()
  state.editingId = rec.id
  state.type = rec.type
  setCat(rec.cat)
  state.note = rec.note || ''
  state.date = isoFromTs(rec.at)
  state.buffer = centsToBuffer(rec.cents)
  state.tab = 'record'
  persist()
  render()
}

function cancelEdit() {
  if (draftBackup) Object.assign(state, draftBackup)
  else {
    state.editingId = null
    state.buffer = '0'
    state.note = ''
    state.date = todayISO()
  }
  draftBackup = null
  state.tab = 'bills'
  persist()
  render()
}

function deleteRecord(id) {
  const index = state.records.findIndex((rec) => rec.id === id)
  if (index < 0) return
  const [removed] = state.records.splice(index, 1)
  if (state.editingId === id) {
    state.editingId = null
    draftBackup = null
  }
  persist()
  render()
  const cat = catById(removed.type, removed.cat)
  showToast(`已删除 · ${cat.name} ¥${formatMoney(removed.cents)}`, () => {
    state.records.push(removed)
    persist()
    render()
    showToast('已撤销删除')
  })
}

function onClick(event) {
  const button = event.target.closest('[data-act]')
  if (!button || !document.getElementById('app')?.contains(button)) return
  const act = button.dataset.act
  if (act === 'tab') {
    state.tab = button.dataset.tab || 'record'
    render()
    document.getElementById('view')?.focus()
    return
  }
  if (act === 'type') {
    state.type = button.dataset.type === 'income' ? 'income' : 'expense'
    persist()
    render()
    return
  }
  if (act === 'cat') {
    setCat(button.dataset.id)
    persist()
    render()
    return
  }
  if (act === 'date') {
    const today = todayISO()
    state.date = button.dataset.date === 'yesterday' ? shiftDay(today, -1) : today
    pinRecordingDate()
    persist()
    render()
    return
  }
  if (act === 'key') {
    const key = button.dataset.key === 'dot' ? '.' : button.dataset.key
    state.buffer = nextBuffer(state.buffer, key)
    paintAmount()
    persist()
    return
  }
  if (act === 'save') {
    commit()
    return
  }
  if (act === 'cancel-edit') {
    cancelEdit()
    return
  }
  if (act === 'month') {
    state.month = shiftMonth(state.month, Number(button.dataset.delta) || 0)
    render()
    return
  }
  if (act === 'month-now') {
    state.month = currentPeriodKey()
    render()
    return
  }
  if (act === 'kind') {
    state.kind = button.dataset.kind || 'all'
    render()
    return
  }
  if (act === 'clear-q' || act === 'clear-filter') {
    state.query = ''
    if (act === 'clear-filter') state.kind = 'all'
    render()
    return
  }
  if (act === 'edit') {
    const rec = state.records.find((item) => item.id === button.dataset.id)
    if (rec) startEdit(rec)
    return
  }
  if (act === 'del') {
    deleteRecord(button.dataset.id)
    return
  }
  if (act === 'undo') {
    const fn = undoFn
    undoFn = null
    const toast = document.getElementById('toast')
    if (toast) toast.hidden = true
    clearTimeout(toastTimer)
    fn?.()
    return
  }
  if (act === 'look') {
    const key = button.dataset.key
    const val = button.dataset.val
    if (key === 'id') {
      if (val === 'custom') {
        if (!state.look.colors) {
          const theme = resolveLook(state.look)
          state.look.colors = {
            sheet: theme.sheet,
            ink: theme.ink,
            ticket: theme.ticket,
            chop: theme.chop,
            green: theme.green
          }
        }
        state.look.id = 'custom'
      } else {
        state.look.id = val
        state.look.colors = null
      }
    } else if (key === 'button' || key === 'space' || key === 'pattern' || key === 'particles') {
      state.look[key] = val
    }
    const wantPhoto = key === 'pattern' && val === 'photo' && !bgUrl
    state.look = normalizeLook(state.look)
    applyLook()
    persist()
    render()
    if (wantPhoto) document.getElementById('bg-file')?.click()
    return
  }
  if (act === 'pick-bg') {
    document.getElementById('bg-file')?.click()
    return
  }
  if (act === 'clear-bg') {
    clearBackground()
    return
  }
}

function onInput(event) {
  const target = event.target
  if (target.id === 'note') {
    state.note = target.value.slice(0, 40)
    persist()
    return
  }
  if (target.id === 'q') {
    state.query = target.value
    paintBills()
    return
  }
  if (target.id === 'when') {
    state.date = /^\d{4}-\d{2}-\d{2}$/.test(target.value) ? target.value : todayISO()
    pinRecordingDate()
    persist()
    render()
    return
  }
  if (target.id === 'limit-yuan' && event.type === 'input') {
    const cents = bufferToCents(target.value.trim())
    state.limitCents = cents > 0 && cents <= MAX_CENTS ? cents : 0
    persist()
    paintCap()
    return
  }
  if (target.id === 'cycle-day' && event.type === 'change') {
    state.cycleDay = clampCycleDay(target.value)
    target.value = String(state.cycleDay)
    persist()
    render()
    return
  }
  if (target.dataset.lookColor && event.type === 'input') {
    const key = target.dataset.lookColor
    if (!HEX.test(target.value)) return
    if (state.look.id !== 'custom' || !state.look.colors) {
      const theme = resolveLook(state.look)
      state.look.colors = {
        sheet: theme.sheet,
        ink: theme.ink,
        ticket: theme.ticket,
        chop: theme.chop,
        green: theme.green
      }
      state.look.id = 'custom'
    }
    state.look.colors[key] = target.value
    state.look = normalizeLook(state.look)
    applyLook()
    persist()
    for (const swatch of document.querySelectorAll('.swatch')) {
      swatch.classList.toggle('is-on', swatch.dataset.val === 'custom')
      swatch.setAttribute('aria-pressed', swatch.dataset.val === 'custom' ? 'true' : 'false')
    }
    return
  }
  if (target.id === 'bg-file' && event.type === 'change') {
    const file = target.files?.[0]
    target.value = ''
    if (file) storeBackground(file)
  }
}

function paintCap() {
  const box = document.getElementById('cap-live')
  if (!box || state.tab !== 'month') return
  box.innerHTML = capLiveHtml(recordsInMonth(state.month))
}

function onKey(event) {
  if (state.tab !== 'record') return
  const active = document.activeElement
  const tag = active?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (event.key === 'Enter' && active.id === 'note') {
      event.preventDefault()
      commit()
    }
    return
  }
  if (event.key === 'Enter') {
    if (tag === 'BUTTON') return
    event.preventDefault()
    commit()
    return
  }
  if (event.repeat && event.key !== 'Backspace') return
  if (event.key === 'Backspace') {
    event.preventDefault()
    state.buffer = nextBuffer(state.buffer, 'back')
    paintAmount()
    persist()
    return
  }
  if (event.key === '.' || event.key === 'Decimal') {
    event.preventDefault()
    state.buffer = nextBuffer(state.buffer, '.')
    paintAmount()
    persist()
    return
  }
  if (/^\d$/.test(event.key)) {
    event.preventDefault()
    state.buffer = nextBuffer(state.buffer, event.key)
    paintAmount()
    persist()
  }
}

function clearHold() {
  if (!holdTimer) return
  clearTimeout(holdTimer)
  holdTimer = 0
}

function bind() {
  document.getElementById('app')?.addEventListener('click', onClick)
  const view = document.getElementById('view')
  view?.addEventListener('input', onInput)
  view?.addEventListener('change', onInput)
  document.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('[data-key="back"]')
    if (!button) return
    clearHold()
    holdTimer = setTimeout(() => {
      holdTimer = 0
      state.buffer = '0'
      paintAmount()
      persist()
    }, 450)
  })
  document.addEventListener('pointerup', clearHold)
  document.addEventListener('pointercancel', clearHold)
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('.pad')) event.preventDefault()
  })
}

function refreshRecordingDate() {
  if (state.editingId) return
  const next = recordingDate(state.date, todayISO(), { pinnedDay: datePinnedDay })
  if (next === state.date) return
  state.date = next
  datePinnedDay = ''
  persist()
  if (state.tab === 'record') render()
}

let bgUrl = ''
let fxFrame = 0
let fxParts = []
let fxKind = 'none'

function applyLook() {
  if (typeof document === 'undefined') return
  const theme = resolveLook(state.look)
  const root = document.documentElement
  const set = (name, value) => root.style.setProperty(name, value)
  set('--sheet', theme.sheet)
  set('--paper', theme.paper)
  set('--ink', theme.ink)
  set('--muted', theme.muted)
  set('--line', theme.line)
  set('--ticket', theme.ticket)
  set('--chop', theme.chop)
  set('--green', theme.green)
  set('--track', theme.track)
  set('--card', theme.card)
  set('--on-ink', theme.onInk)
  set('--rule', theme.rule)
  root.dataset.look = state.look.id
  root.dataset.buttons = state.look.button
  root.dataset.space = state.look.space
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  const pattern = state.look.pattern === 'photo' && !bgUrl ? 'none' : state.look.pattern
  const sheet = document.getElementById('app')
  if (sheet) sheet.dataset.pattern = pattern
  if (bgUrl) set('--bg-image', `url("${bgUrl}")`)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme.sheet)
  restartFx()
}

function lookDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ledger-look', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('files')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readBackground() {
  try {
    const db = await lookDb()
    const blob = await new Promise((resolve, reject) => {
      const req = db.transaction('files').objectStore('files').get('bg')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (!blob) return
    if (bgUrl) URL.revokeObjectURL(bgUrl)
    bgUrl = URL.createObjectURL(blob)
    applyLook()
  } catch {
    /* 读不到背景图就保持纯色 */
  }
}

async function storeBackground(file) {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1080 / bmp.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * scale))
    canvas.height = Math.max(1, Math.round(bmp.height * scale))
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72))
    if (!blob || blob.size > 1500000) {
      showToast('这张图太大，换一张小一点的')
      return
    }
    const db = await lookDb()
    await new Promise((resolve, reject) => {
      const req = db.transaction('files', 'readwrite').objectStore('files').put(blob, 'bg')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (bgUrl) URL.revokeObjectURL(bgUrl)
    bgUrl = URL.createObjectURL(blob)
    state.look.pattern = 'photo'
    state.look = normalizeLook(state.look)
    applyLook()
    persist()
    if (state.tab === 'look') render()
    showToast('背景已换成这张图')
  } catch {
    showToast('这张图没能用上')
  }
}

async function clearBackground() {
  try {
    const db = await lookDb()
    await new Promise((resolve, reject) => {
      const req = db.transaction('files', 'readwrite').objectStore('files').delete('bg')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    db.close()
  } catch {
    /* 没有图可删 */
  }
  if (bgUrl) URL.revokeObjectURL(bgUrl)
  bgUrl = ''
  if (state.look.pattern === 'photo') state.look.pattern = 'none'
  state.look = normalizeLook(state.look)
  applyLook()
  persist()
  render()
}

function sizeFx(canvas) {
  const rect = canvas.parentElement.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
}

function restartFx() {
  if (typeof document === 'undefined') return
  cancelAnimationFrame(fxFrame)
  const canvas = document.getElementById('fx')
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  fxKind = reduced ? 'none' : state.look.particles
  fxParts = []
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  sizeFx(canvas)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (fxKind === 'none') return
  const theme = resolveLook(state.look)
  const count = fxKind === 'firefly' ? 18 : 32
  for (let i = 0; i < count; i += 1) {
    fxParts.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (fxKind === 'firefly' ? 2.2 : 1.4) * (canvas.width / 390),
      v: 0.35 + Math.random() * 0.7,
      w: Math.random() * Math.PI * 2
    })
  }
  const color = fxKind === 'gold' ? theme.ticket : fxKind === 'firefly' ? theme.ticket : theme.chop
  const step = () => {
    if (fxKind === 'none') return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = color
    for (const part of fxParts) {
      part.w += 0.01
      if (fxKind === 'gold') part.y -= part.v
      else if (fxKind === 'firefly') {
        part.y -= part.v * 0.35
        part.x += Math.sin(part.w) * 0.6
      } else part.y += part.v
      if (part.y < -8) part.y = canvas.height + 8
      if (part.y > canvas.height + 8) part.y = -8
      if (part.x < -8) part.x = canvas.width
      if (part.x > canvas.width + 8) part.x = 0
      ctx.globalAlpha = fxKind === 'firefly' ? 0.35 + Math.sin(part.w) * 0.25 : 0.45
      ctx.beginPath()
      ctx.arc(part.x, part.y, part.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    fxFrame = requestAnimationFrame(step)
  }
  fxFrame = requestAnimationFrame(step)
}

function init() {
  load()
  bind()
  applyLook()
  readBackground()
  window.addEventListener('resize', () => restartFx())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshRecordingDate()
  })
  render()
  if (window.Capacitor?.isNativePlatform?.()) {
    navigator.serviceWorker?.getRegistrations?.().then((regs) => {
      for (const reg of regs) reg.unregister()
    })
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  }
}

if (typeof document !== 'undefined') init()
