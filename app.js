/* ============================================================
   小树苗成长记 · 应用逻辑 (app.js)
   纯前端本地运行 · 数据存 localStorage
   ============================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- 状态与持久化 ---------------- */
const STORE_KEY = 'baby_app_v1';

function defaultState() {
  return {
    baby: { name: '油油', gender: 'boys', birth: APP_META.birth, condition: '希特林蛋白缺乏症（CD）' },
    customTasks: null,           // null = 用默认 TASKS
    records: {},                 // 'YYYY-MM-DD' -> {checks:{}, score}
    measures: [],                // {date, h, w}
    reports: [],                 // {id, date, h, w, head, labs:{}, plan, planText}
    msDone: {},                  // '21_0': true
    followupDone: {},
    policyDone: {},              // 政策办理状态：'p1' -> 'todo'|'doing'|'done'
    reminders: [],               // 守护提醒：{id, date, label}
    clinic: [],                  // 就诊记录：{id, date, hosp, topic, advice, next}
    vaxDone: {},                 // 疫苗已接种标记：'v0' -> true
    notifLog: {},                // 已弹过通知的标记：'日期_提醒id' -> true
    notifOn: false,              // 是否已开启通知权限
    namedAt: 0,                  // 宝宝信息写入时间（油油·男宝 一次性迁移标记）
    deviceName: '',              // 家庭同步：本机昵称（爸爸/妈妈）
    lastSync: null,              // 上次合并同步信息
    createdAt: Date.now()
  };
}
let S = null;
try { S = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { S = null; }
if (!S || !S.baby) S = defaultState();
if (!S.reports) S.reports = [];
if (!S.favVideos) S.favVideos = [];
if (!S.policyDone) S.policyDone = {};
if (!S.reminders) S.reminders = [];
if (!S.clinic) S.clinic = [];
if (!S.vaxDone) S.vaxDone = {};
if (!S.notifLog) S.notifLog = {};
/* 一次性迁移：宝宝正式信息（油油 · 男宝）。用户日后在设置里改名后 namedAt 已存在，不再覆盖 */
if (!S.namedAt) { S.baby.name = '油油'; S.baby.gender = 'boys'; S.namedAt = Date.now(); save(); }
if (typeof S.deviceName !== 'string') S.deviceName = '';

function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }
function tasksDef() { return S.customTasks && S.customTasks.length ? S.customTasks : TASKS; }

/* ---------------- 工具 ---------------- */
function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function ageInfo(refDateStr) {
  const b = new Date(S.baby.birth + 'T00:00:00');
  const r = refDateStr ? new Date(refDateStr + 'T00:00:00') : new Date();
  let months = (r.getFullYear() - b.getFullYear()) * 12 + (r.getMonth() - b.getMonth());
  const anchor = new Date(b); anchor.setMonth(b.getMonth() + months);
  if (anchor > r) { months--; }
  const a2 = new Date(b); a2.setMonth(b.getMonth() + months);
  const days = Math.max(0, Math.floor((r - a2) / 86400000));
  const yy = Math.floor(months / 12), mm = months % 12;
  const label = yy > 0 ? (yy + '岁' + (mm > 0 ? mm + '个月' : '')) : (months + '个月' + (days > 0 ? '零' + days + '天' : ''));
  return { months, days, label: label || '刚出生' };
}

function daySeed() { const d = new Date(); return d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate(); }
function seedPick(arr, n, seed) {
  const a = arr.slice(); const out = []; let s = seed % 233280 + 7;
  while (out.length < n && a.length) { s = (s * 9301 + 49297) % 233280; out.push(a.splice(s % a.length, 1)[0]); }
  return out;
}
function inAge(item, months) { return months >= item.age[0] && months <= item.age[1] || (months > item.age[1] && item.age[1] >= 30 && months <= 36); }
function getRec(dStr) { if (!S.records[dStr]) S.records[dStr] = { checks: {} }; return S.records[dStr]; }
function scoreOf(rec) { let s = 0; tasksDef().forEach(t => { if (rec.checks[t.id]) s += t.pts; }); return Math.min(100, s); }

/* ---------------- 顶栏 / Tab ---------------- */
const TABS = [
  { id: 'today', icon: '🏠', name: '今日' },
  { id: 'recipes', icon: '🍽️', name: '食谱' },
  { id: 'monte', icon: '🧩', name: '早教' },
  { id: 'school', icon: '🎬', name: '学堂' },
  { id: 'read', icon: '📚', name: '阅读' },
  { id: 'growth', icon: '🌱', name: '发育' },
  { id: 'reports', icon: '📋', name: '体检' },
  { id: 'curve', icon: '📈', name: '曲线' },
  { id: 'plan', icon: '🗺️', name: '规划' }
];
let curTab = 'today';

function renderHeader() {
  const a = ageInfo();
  $('#hdName').textContent = S.baby.name || '宝宝';
  $('#hdAge').textContent = a.label + ' · CD宝贝';
  $('#hdAvatar').textContent = S.baby.gender === 'boys' ? '👦' : S.baby.gender === 'girls' ? '👧' : '🌱';
}
function renderTabbar() {
  $('#tabbar').innerHTML = TABS.map(t =>
    `<button data-tab="${t.id}" class="${t.id === curTab ? 'on' : ''}"><span>${t.icon}</span>${t.name}</button>`).join('');
  $$('#tabbar button').forEach(b => b.onclick = () => { curTab = b.dataset.tab; renderTabbar(); renderTab(); window.scrollTo(0, 0); });
}
function renderTab() {
  const map = { today: renderToday, recipes: renderRecipes, monte: renderMonte, school: renderSchool, read: renderRead, growth: renderGrowth, reports: renderReports, curve: renderCurve, plan: renderPlan };
  (map[curTab] || renderToday)();
  renderHeader();
}

/* ---------------- 今日页 ---------------- */
function renderToday() {
  const a = ageInfo();
  const dStr = todayStr();
  const rec = getRec(dStr);
  const score = scoreOf(rec);
  const groups = [];
  tasksDef().forEach(t => {
    let g = groups.find(x => x.name === t.group);
    if (!g) { g = { name: t.group, items: [] }; groups.push(g); }
    g.items.push(t);
  });
  const yesterday = new Date(Date.now() - 86400000);
  const yStr = todayStr(yesterday);
  const yRec = S.records[yStr];

  // 今日推荐
  const recs = seedPick(RECIPES.filter(r => inAge(r, a.months)), 2, daySeed());
  const acts = seedPick(MONTESSORI.filter(m => inAge(m, a.months)), 2, daySeed() + 13);

  $('#app').innerHTML = `
    ${!S.baby.gender ? `<div class="banner" onclick="openSettings()">👋 先去「设置」填一下宝宝的性别和小名吧，生长曲线要用 📝</div>` : ''}
    ${dueBannerHTML()}
    <div class="card hero">
      <div class="ring" style="background:conic-gradient(var(--main) ${score * 3.6}deg,#f1e8dc 0deg)"><div class="ring-in"><b>${score}</b><i>分</i></div></div>
      <div class="hero-txt">
        <h3>${todayStr().slice(5).replace('-', '月')}日 · ${esc(S.baby.name)}的今天</h3>
        <p>${a.label} · ${stageTip(a.months)}</p>
        <div class="stars">${'⭐'.repeat(Math.max(1, Math.round(score / 20)))}</div>
      </div>
    </div>

    ${groups.map(g => `
      <div class="sec-title">${groupIcon(g.name)} ${g.name}</div>
      <div class="card">
        ${g.items.map(t => `
          <label class="task ${rec.checks[t.id] ? 'done' : ''}">
            <input type="checkbox" ${rec.checks[t.id] ? 'checked' : ''} onchange="toggleTask('${t.id}')">
            <span class="t-icon">${t.icon}</span>
            <span class="t-body"><b>${esc(t.name)}</b><i>${t.pts}分</i></span>
          </label>`).join('')}
      </div>`).join('')}

    <button class="btn main" onclick="showInsights()">📊 看看今天的表现解析</button>

    <div class="sec-title">🎯 每日一题（${a.label}）</div>
    <div id="gameBox">${gameHTML(a.months)}</div>

    <div class="sec-title">🍲 今日食谱推荐</div>
    ${recs.map(r => `
      <div class="card slim" onclick="showRecipe('${r.id}')">
        <b>${esc(r.name)}</b>
        <div class="chips">${r.tags.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      </div>`).join('')}

    <div class="sec-title">🧸 今日蒙氏活动</div>
    ${acts.map(m => `
      <div class="card slim" onclick="showActivity('${m.id}')">
        <b>${esc(m.name)}</b><span class="dim"> · ${esc(m.area)}</span>
        <p class="dim small">${esc(m.goal)}</p>
      </div>`).join('')}

    <div class="sec-title">📅 最近7天</div>
    <div class="card">${weekChart()}${yRec ? `<div class="y-review"><b>昨日复盘：</b>${yReview(yRec)}</div>` : `<div class="dim small">昨天的记录会显示在这里</div>`}</div>

    <button class="btn ghost" onclick="weeklyReport()">📈 查看近两周成长报告</button>

    <div class="card tip-card">💡 <b>今日小贴士</b><br>${dailyTip(a.months)}</div>
  `;
}
function stageTip(m) {
  if (m < 18) return '学步探索期：多户外，多命名，少说「不可以」';
  if (m < 24) return '自主意识萌芽期：给二选一，允许慢，保护专注';
  if (m < 36) return '规则与社交起步期：定家规，练自理，备入园';
  return '入园适应期：自理四件套 + 阅读习惯';
}
function groupIcon(g) { return ({ '饮食': '🍼', '运动': '⚽', '认知': '🧠', '自理': '🧦', '健康': '💤', '社交': '🤗' })[g] || '⭐'; }
function toggleTask(id) {
  const rec = getRec(todayStr());
  const before = scoreOf(rec);
  if (rec.checks[id]) delete rec.checks[id]; else rec.checks[id] = true;
  rec.score = scoreOf(rec);
  save();
  if (rec.score === 100 && before < 100) confetti();
  renderTab();
}
function weekChart() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = todayStr(new Date(Date.now() - i * 86400000));
    const r = S.records[d];
    days.push({ d, s: r ? (r.score != null ? r.score : scoreOf(r)) : 0, has: !!r });
  }
  return '<div class="bars">' + days.map(x =>
    `<div class="bar-w"><div class="bar" style="height:${Math.max(4, x.s)}%" title="${x.d}：${x.s}分">${x.has ? '' : ''}</div><i>${x.d.slice(8)}</i></div>`).join('') + '</div>';
}
function yReview(rec) {
  const s = scoreOf(rec);
  const miss = tasksDef().filter(t => !rec.checks[t.id]).slice(0, 3).map(t => t.icon + esc(t.name)).join('、');
  return s >= 90 ? `${s}分，优秀！继续保持～` : s >= 70 ? `${s}分，不错！遗漏：${miss || '无'}` : `${s}分，昨天漏了：${miss || '无'}，今天补上`;
}

/* 一日解析 */
const GROUP_ADVICE = {
  '饮食': 'CD饮食金律回顾：每餐蛋白+好脂肪打头阵，主食压到1/4；MCT油离火拌入；甜食高糖是CD大忌。',
  '运动': '户外+大运动是食欲和睡眠的开关。哪怕楼下快走15分钟，也算数。',
  '认知': '专注力是保护出来的：只留1~2样玩具、关掉背景电视，孩子投入时忍住不指导。共读用「指一指、猜一猜」代替念字。',
  '自理': '把「我来」的机会还给他：自己抓勺、脱鞋、扔尿布，做完击掌。慢一点没关系。',
  '健康': '固定睡前程序（洗澡-刷牙-绘本-关灯），21点前入睡；维生素D/医嘱补充剂记得补。',
  '社交': '先共情后引导：「你生气了，因为积木倒了」。一个拥抱比十句道理有用。'
};
function showInsights() {
  const rec = getRec(todayStr());
  const score = scoreOf(rec);
  const byGroup = {};
  tasksDef().forEach(t => {
    const g = (byGroup[t.group] = byGroup[t.group] || { got: 0, max: 0, miss: [] });
    g.max += t.pts;
    if (rec.checks[t.id]) g.got += t.pts; else g.miss.push(t);
  });
  let rows = '';
  Object.keys(byGroup).forEach(k => {
    const g = byGroup[k];
    const ok = g.got === g.max;
    rows += `<div class="ins-row ${ok ? 'ok' : ''}">
      <b>${groupIcon(k)} ${k}：${g.got}/${g.max}分</b>
      ${ok ? '<p>✅ 全部完成，漂亮！</p>' : `<p>漏了：${g.miss.map(x => esc(x.name)).join('；')}<br><span class="dim">${GROUP_ADVICE[k] || ''}</span></p>`}
    </div>`;
  });
  const verdict = score >= 90 ? ['🏆 非常棒的一天！', '孩子在被精心照顾着。明天试试把「专注游戏」拉长5分钟，或引入一个新的蒙氏活动。']
    : score >= 70 ? ['👍 稳中有进的一天', '抓大放小，饮食结构保持住就是胜利。挑1个遗漏项明天优先补上。']
    : ['💪 加油，明天重来', '打卡不是考试，是提醒。先把「MCT」「户外」「睡眠」三个硬指标保住。'];
  openModal(`<h3>📊 今日解析 · ${score}分</h3>
    <div class="verdict"><b>${verdict[0]}</b><p>${verdict[1]}</p></div>${rows}
    <p class="dim small">评分规则可在「设置」里自定义权重。</p>`);
}
function dailyTip(m) {
  const tips = m < 24 ? [
    '孩子专注时请闭嘴——不打断是最高级的早教。',
    '说「慢慢走」，而不是「别跑」。正向语言塑造行为。',
    '亲子共读时多停顿：「你猜小狗要跳到哪里去？」',
    '每天一次「二选一」：小睡衣还是小恐龙睡衣？',
    '他把豆子洒一地？先说「哇，我们一起捡」，先共情。',
    '描述式说话：他指着水，你说「宝宝想喝水，水凉凉的」。'
  ] : [
    '如厕训练三信号：尿布干2小时+会表达+对马桶好奇。',
    '家规定3条就够，全家口径一致才有效。',
    '玩「轮流」游戏：轮到妈妈、轮到宝宝，社交底层协议。',
    '让他给全家发筷子，一一对应就是数学启蒙。',
    '入园前半年开始调作息，午睡时间向园所靠拢。',
    '教身体部位科学名称+隐私部位保护意识。'
  ];
  return tips[daySeed() % tips.length];
}

/* ---------------- 每日一题 ---------------- */
let gameAnswered = null;
function gameHTML(months) {
  const pool = QUESTIONS.filter(q => months >= q.age[0] && months <= q.age[1]);
  if (!pool.length) return '<div class="card dim">暂无适配题目</div>';
  const q = pool[daySeed() % pool.length];
  gameAnswered = null;
  return `<div class="card game" id="gameCard">
    <b>${esc(q.q)}</b>
    <div class="game-opts">
      ${q.opts.map((o, i) => `<button onclick="gamePick(${i},${q.a},'${esc(q.tip)}')"><em>${o.e}</em>${esc(o.t)}</button>`).join('')}
    </div>
    <div id="gameTip" class="dim small"></div>
  </div>`;
}
function gamePick(i, a, tip) {
  if (gameAnswered) return;
  gameAnswered = true;
  const card = $('#gameCard');
  const btns = card.querySelectorAll('.game-opts button');
  btns[i].classList.add(i === a ? 'right' : 'wrong');
  if (i !== a) btns[a].classList.add('right');
  $('#gameTip').innerHTML = (i === a ? '🎉 答对啦！' : '再接再厉！') + ' ' + tip;
  if (i === a) confetti(12);
}

/* ---------------- 食谱页 ---------------- */
let recipeFilter = 'all';
function renderRecipes() {
  const a = ageInfo();
  const filters = [
    { k: 'all', n: '全部' }, { k: 'age', n: a.label + '适合' }, { k: '含MCT', n: '🥥 含MCT' },
    { k: '加餐', n: '加餐' }, { k: '手指食物', n: '手指食物' }, { k: '补铁', n: '补铁' }, { k: '低碳水', n: '低碳水' }
  ];
  let list = RECIPES.slice();
  if (recipeFilter === 'age') list = list.filter(r => inAge(r, a.months));
  else if (recipeFilter !== 'all') list = list.filter(r => r.tags.includes(recipeFilter));

  $('#app').innerHTML = `
    <div class="card strategy">${strategyNote()}</div>
    <div class="chips row">${filters.map(f => `<button class="${recipeFilter === f.k ? 'on' : ''}" onclick="recipeFilter='${f.k}';renderTab()">${f.n}</button>`).join('')}</div>
    ${list.map(r => `
      <div class="card slim" onclick="showRecipe('${r.id}')">
        <b>${esc(r.name)}</b>
        <div class="chips"><span>🌱${r.age[0]}~${r.age[1]}月龄</span>${r.tags.map(x => `<span>${esc(x)}</span>`).join('')}</div>
        <p class="dim small">${esc(r.nut)}</p>
      </div>`).join('') || '<div class="card dim">这个筛选下没有食谱啦</div>'}
    <div class="card tip-card">⚠️ 食谱为CD饮食结构的家庭参考，具体食材种类、份量与MCT用量请经主治医生/临床营养师确认后执行。</div>`;
}
function strategyNote() {
  const last = lastMeasure();
  if (!last) return '📈 <b>饮食策略卡</b><br>先去「曲线」页录入一次身高体重，这里会根据生长位置自动给出饮食策略建议。';
  const wp = bandOf('wt', last.m, last.w);
  const hp = bandOf('len', last.m, last.h);
  if (wp <= 1) return '📈 <b>饮食策略：营养追赶优先</b><br>体重在P15以下：① 高能量密度食谱优先（含MCT/坚果酱/奶酪标签）② 少量多餐5~6次/天 ③ 先脂肪蛋白后主食 ④ 尽快让营养师做一次个体化评估。';
  if (wp >= 4) return '📈 <b>饮食策略：温和控糖控碳水</b><br>体重在P85以上：① 严格执行无糖原则 ② 主食进一步压缩、粗杂粮替代 ③ 户外活动拉满 ④ 增长速度请医生复核（CD宝宝也可能因水肿/肝大出现体重虚高，别自行减量）。';
  if (hp <= 1) return '📈 <b>饮食策略：关注线性生长</b><br>身长在P15以下：蛋白质与脂溶性维生素充足供应，睡眠拉满（生长激素在深睡分泌），并把情况同步给医生。';
  return '📈 <b>饮食策略：保持现结构</b><br>生长处于稳定区间：维持「蛋白+好脂肪打头阵、主食1/4」的结构，每3个月复核一次趋势。';
}
function lastMeasure() {
  if (!S.measures.length) return null;
  const m = S.measures[S.measures.length - 1];
  return { date: m.date, h: m.h, w: m.w, m: ageInfo(m.date).months };
}
function showRecipe(id) {
  const r = RECIPES.find(x => x.id === id); if (!r) return;
  openModal(`<h3>${esc(r.name)}</h3>
    <div class="chips"><span>🌱${r.age[0]}~${r.age[1]}月龄</span>${r.tags.map(x => `<span>${esc(x)}</span>`).join('')}</div>
    <h4>🛒 食材</h4><ul class="ing">${r.ings.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    <h4>👩‍🍳 做法</h4><ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="callout">💡 ${esc(r.tip)}</div>
    <p class="dim small">营养成分（约值）：${esc(r.nut)}。执行前请与医生/营养师确认。</p>`);
}

/* ---------------- 蒙氏早教页 ---------------- */
let monteFilter = '推荐';
function renderMonte() {
  const a = ageInfo();
  const areas = ['推荐', '全部', '生活实践', '感官', '语言', '数学启蒙', '思维力', '大运动', '艺术', '建构', '社交情绪'];
  const recs = seedPick(MONTESSORI.filter(m => inAge(m, a.months)), 2, daySeed() + 5);
  let list = MONTESSORI.slice();
  if (monteFilter === '推荐') list = list.filter(m => inAge(m, a.months));
  else if (monteFilter !== '全部') list = list.filter(m => m.area === monteFilter);

  $('#app').innerHTML = `
    <div class="sec-title">🧘 专注力养成 · 8法</div>
    <div class="card scroll-x">${FOCUS_METHODS.map((f, i) => `<div class="mini"><b>${i + 1}. ${esc(f.t)}</b><p>${esc(f.d)}</p></div>`).join('')}</div>
    <div class="sec-title">🧠 思维力 & 问题解决 · 8法</div>
    <div class="card scroll-x">${THINKING_METHODS.map((f, i) => `<div class="mini"><b>${i + 1}. ${esc(f.t)}</b><p>${esc(f.d)}</p></div>`).join('')}</div>
    <div class="sec-title">👨‍👩‍👧 蒙氏家长心法</div>
    <div class="card scroll-x">${MONTE_PRINCIPLES.map(p => `<div class="mini"><b>${esc(p.t)}</b><p>${esc(p.d)}</p></div>`).join('')}</div>
    <div class="sec-title">🧸 今日推荐活动（${a.label}）</div>
    ${recs.map(m => `<div class="card slim" onclick="showActivity('${m.id}')"><b>${esc(m.name)}</b><span class="dim"> · ${esc(m.area)}</span><p class="dim small">${esc(m.goal)}</p></div>`).join('')}
    <div class="sec-title">📚 活动库</div>
    <div class="chips row">${areas.map(x => `<button class="${monteFilter === x ? 'on' : ''}" onclick="monteFilter='${x}';renderTab()">${x}</button>`).join('')}</div>
    ${list.map(m => `<div class="card slim" onclick="showActivity('${m.id}')"><b>${esc(m.name)}</b><span class="dim"> · ${esc(m.area)}</span><div class="chips"><span>🌱${m.age[0]}~${m.age[1]}月龄</span></div></div>`).join('')}`;
}
function showActivity(id) {
  const m = MONTESSORI.find(x => x.id === id); if (!m) return;
  openModal(`<h3>${esc(m.name)}</h3>
    <div class="chips"><span>${esc(m.area)}</span><span>🌱${m.age[0]}~${m.age[1]}月龄</span></div>
    <div class="callout">🎯 ${esc(m.goal)}</div>
    <h4>🧺 材料</h4><p>${esc(m.mats)}</p>
    <h4>👣 怎么玩</h4><ol class="steps">${m.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <h4>⬆️ 升级玩法</h4><p>${esc(m.ext)}</p>
    <div class="callout warn">⚠️ ${esc(m.tip)}</div>
    <button class="btn small ocr" style="width:100%;margin-top:10px" onclick="searchJump('bilibili','${actSearchKw(m).replace(/'/g, '')}')">🔍 看视频示范怎么玩</button>`);
}

/* ---------------- 发育页 ---------------- */
let msView = null;
function renderGrowth() {
  const a = ageInfo();
  const msMonths = MILESTONES.map(x => x.m);
  let cur = msView != null ? msView : Math.max.apply(null, msMonths.filter(m => m <= a.months).concat([msMonths[0]]));
  const MS = MILESTONES.find(x => x.m === cur) || MILESTONES[0];
  const gd = GUIDANCE.find(g => a.months >= g.range[0] && a.months < g.range[1]) || GUIDANCE[GUIDANCE.length - 1];

  $('#app').innerHTML = `
    <div class="sec-title">🌱 ${esc(gd.title)}</div>
    <div class="card">
      <b>这个阶段的重点</b>
      <ul class="plain">${gd.focus.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    </div>
    <div class="card two-col">
      <div><b>✅ 这样做</b><ul class="plain good">${gd.dos.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      <div><b>⛔ 别这样</b><ul class="plain bad">${gd.donts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    </div>
    <div class="card">
      <p>💤 ${esc(gd.sleep)}</p><p>🍼 ${esc(gd.diet)}</p><p>📺 ${esc(gd.screen)}</p>
    </div>

    <div class="sec-title">✅ 里程碑自查（${MS.m}月龄档）</div>
    <div class="chips row">${msMonths.map(m => `<button class="${cur === m ? 'on' : ''}" onclick="msView=${m};renderTab()">${m}月</button>`).join('')}</div>
    <div class="card">
      ${MS.items.map((it, i) => {
        const key = MS.m + '_' + i;
        return `<label class="task ${S.msDone[key] ? 'done' : ''}">
          <input type="checkbox" ${S.msDone[key] ? 'checked' : ''} onchange="S.msDone['${key}']=this.checked;save()">
          <span class="t-body"><b>${esc(it)}</b></span></label>`;
      }).join('')}
    </div>
    <div class="card warn-card">
      <b>🚨 出现以下情况请尽快就医评估</b>
      <ul class="plain">${MS.warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
      <p class="dim small">预警信号 ≠ 诊断，但宁可多问一次医生。发育评估推荐：儿心量表 / ASQ-3。</p>
    </div>
    <div class="card tip-card">💛 每个孩子有自己的节奏，里程碑是「观察地图」不是「考试大纲」。持续倒退或多项缺失才需要高度警惕。</div>`;
}

/* ---------------- 生长曲线页 ---------------- */
let curveType = 'len';
function renderCurve() {
  const a = ageInfo();
  const g = S.baby.gender;
  const last = lastMeasure();
  const myMonths = Math.min(a.months, 36);

  $('#app').innerHTML = `
    <div class="sec-title">📏 记录今天（或最近体检）的测量值</div>
    <div class="card form">
      <div class="f-row"><label>日期</label><input type="date" id="mDate" value="${todayStr()}"></div>
      <div class="f-row"><label>身高/身长 (cm)</label><input type="number" step="0.1" inputmode="decimal" id="mH" placeholder="如 84.5"></div>
      <div class="f-row"><label>体重 (kg)</label><input type="number" step="0.1" inputmode="decimal" id="mW" placeholder="如 11.2"></div>
      <button class="btn main" onclick="saveMeasure()">保存并更新曲线</button>
      ${S.measures.length ? `<div class="hist">
        ${S.measures.slice(-4).reverse().map((m, i) => `<div class="hist-row"><span>${esc(m.date)}</span><span>身高 ${esc(m.h)}cm · 体重 ${esc(m.w)}kg</span><button onclick="delMeasure(${S.measures.length - 1 - i})">✕</button></div>`).join('')}
      </div>` : ''}
    </div>

    ${!g ? `<div class="banner">请先到「设置 ⚙️」选择宝宝性别，曲线需要男孩/女孩标准分开对照。</div>` : `
    <div class="sec-title">📈 ${S.baby.name}在WHO曲线上的位置</div>
    <div class="card">
      <div class="chips row">
        <button class="${curveType === 'len' ? 'on' : ''}" onclick="curveType='len';renderTab()">身长</button>
        <button class="${curveType === 'wt' ? 'on' : ''}" onclick="curveType='wt';renderTab()">体重</button>
      </div>
      ${curveSVG()}
      <p class="dim small">基于 WHO 2006 标准关键百分位近似绘制（P3/P15/P50/P85/P97），精确评估以儿保手册为准。宝宝月龄按${esc(S.baby.birth)}计算，当前 ${myMonths} 月龄${last ? `，最新记录：${esc(last.date)}` : ''}。</p>
    </div>
    <div class="card strategy">${strategyNote()}</div>`}

    <div class="card tip-card">📋 <b>CD宝宝曲线的意义</b><br>不只是看绝对值，更重要的是「趋势」：沿自己的轨道平稳爬升就是好状态。突然掉档（如从P50滑到P10）或长期贴地，都要尽快让医生看。</div>`;
}
function saveMeasure() {
  const date = $('#mDate').value || todayStr();
  const h = parseFloat($('#mH').value), w = parseFloat($('#mW').value);
  if ((!h && !w)) { alert('至少填一项哦'); return; }
  const old = S.measures.findIndex(m => m.date === date);
  const item = { date, h: h || (old >= 0 ? S.measures[old].h : null), w: w || (old >= 0 ? S.measures[old].w : null) };
  if (old >= 0) S.measures[old] = item; else { S.measures.push(item); S.measures.sort((a, b) => a.date < b.date ? -1 : 1); }
  save(); renderTab();
}
function delMeasure(i) { S.measures.splice(i, 1); save(); renderTab(); }

function interpAt(D, key, m) {
  const ms = D.months;
  if (m <= ms[0]) return D[key][0];
  if (m >= ms[ms.length - 1]) return D[key][ms.length - 1];
  for (let i = 0; i < ms.length - 1; i++) {
    if (m >= ms[i] && m <= ms[i + 1]) {
      const t = (m - ms[i]) / (ms[i + 1] - ms[i]);
      return D[key][i] + (D[key][i + 1] - D[key][i]) * t;
    }
  }
  return null;
}
function bandOf(type, months, value) {
  const g = S.baby.gender || 'girls';
  const D = WHO_CURVES[g][type];
  const lines = ['p3', 'p15', 'p50', 'p85', 'p97'];
  let band = 0;
  for (let i = 0; i < lines.length; i++) { if (value >= interpAt(D, lines[i], months)) band = i + 1; }
  return band; // 0=P3以下 1=P3~15 2=P15~50 3=P50~85 4=P85~97 5=P97以上
}
function curveSVG() {
  const g = S.baby.gender || 'girls';
  const D = WHO_CURVES[g][curveType];
  const W = 340, H = 250, L = 38, Rr = 14, T = 14, B = 30;
  const yMin = curveType === 'len' ? 40 : 1.5, yMax = curveType === 'len' ? 106 : 19;
  const X = m => L + (Math.min(m, 36) / 36) * (W - L - Rr);
  const Y = v => H - B - ((v - yMin) / (yMax - yMin)) * (H - T - B);
  let out = `<svg viewBox="0 0 ${W} ${H}" class="curve">`;
  const yTicks = curveType === 'len' ? [50, 60, 70, 80, 90, 100] : [3, 6, 9, 12, 15, 18];
  yTicks.forEach(v => { out += `<line x1="${L}" y1="${Y(v)}" x2="${W - Rr}" y2="${Y(v)}" class="gl"/><text x="${L - 4}" y="${Y(v) + 3}" class="axis" text-anchor="end">${v}</text>`; });
  [0, 6, 12, 18, 24, 30, 36].forEach(m => { out += `<text x="${X(m)}" y="${H - 10}" class="axis" text-anchor="middle">${m}</text>`; });
  const colors = { p3: '#e5989b', p15: '#f4a261', p50: '#2a9d8f', p85: '#f4a261', p97: '#e5989b' };
  Object.keys(colors).forEach(k => {
    const pts = D.months.map((m, i) => X(m) + ',' + Y(D[k][i])).join(' ');
    out += `<polyline points="${pts}" class="cline" style="stroke:${colors[k]};stroke-width:${k === 'p50' ? 2.5 : 1.4}"/>`;
    out += `<text x="${X(36) + 2}" y="${Y(D[k][36]) + 3}" class="axis" style="fill:${colors[k]}">${k.toUpperCase()}</text>`;
  });
  const recs = S.measures.filter(m => m.h || m.w).map(m => ({ m: Math.min(ageInfo(m.date).months, 36), v: curveType === 'len' ? m.h : m.w, date: m.date }));
  recs.forEach(p => {
    if (p.v == null) return;
    out += `<circle cx="${X(p.m)}" cy="${Y(p.v)}" r="5.5" class="dot"/><circle cx="${X(p.m)}" cy="${Y(p.v)}" r="2.4" class="dot2"/>`;
  });
  if (recs.length) {
    const p = recs[recs.length - 1];
    out += `<text x="${X(p.m)}" y="${Y(p.v) - 10}" class="axis big" text-anchor="middle">${p.v}${D.unit}</text>`;
  }
  out += '</svg>';
  const last = recs[recs.length - 1];
  if (last) {
    const band = bandOf(curveType, last.m, last.v);
    const bandNames = ['P3以下 ⚠️', 'P3~P15', 'P15~P50', 'P50~P85', 'P85~P97', 'P97以上'];
    out += `<div class="pos-tag">最新位置：<b>${bandNames[band]}</b></div>`;
  } else {
    out += `<div class="pos-tag dim">还没有测量记录，先在上面录入一条吧</div>`;
  }
  return out;
}

/* ---------------- 体检报告页（上传/OCR识别/最佳方案） ---------------- */

/* CD随访化验指标与儿童近似参考区间（以化验单参考范围为准） */
const LABS = [
  { k: 'alt', name: 'ALT 谷丙转氨酶', unit: 'U/L', min: 5, max: 45,
    high: '肝细胞酶升高：把数值发给主治医生判读；近期发烧/用药也会让它波动。不要自行调整MCT剂量。', low: '偏低无临床意义。', okNote: '在参考范围内，继续保持随访节奏。' },
  { k: 'ast', name: 'AST 谷草转氨酶', unit: 'U/L', min: 15, max: 60,
    high: '与ALT一起看更有意义，交医生判读。', low: '偏低无临床意义。', okNote: '正常。' },
  { k: 'tbil', name: '总胆红素 TBIL', unit: 'μmol/L', min: 3, max: 21,
    high: '黄疸指标升高：观察皮肤眼白是否发黄、大便颜色是否变浅；持续升高尽快复诊。', low: '偏低无临床意义。', okNote: '正常，胆汁淤积稳定的好信号。' },
  { k: 'dbil', name: '直接胆红素 DBIL', unit: 'μmol/L', min: 0, max: 6.8,
    high: '直接胆红素升高提示胆汁排泄问题，比总胆红素更值得关注，尽早就诊。', low: '无临床意义。', okNote: '正常。' },
  { k: 'nh3', name: '血氨 NH3', unit: 'μmol/L', min: 18, max: 72, criticalMax: 120,
    high: '血氨偏高（未达危急值）：避免长时间空腹，尽快把报告给主治医生安排复查。', low: '无临床意义。', okNote: '正常——CD随访里最安心的指标之一。' },
  { k: 'alb', name: '白蛋白 ALB', unit: 'g/L', min: 35, max: 55,
    low: '蛋白储备/肝脏合成不足：每餐蛋白加码（蛋/鱼/肉/豆腐），1个月后复查。', high: '偏高少见，脱水时可见，复测确认。', okNote: '营养状况良好。' },
  { k: 'hgb', name: '血红蛋白 HGB', unit: 'g/L', min: 110, max: 160,
    low: '贫血信号：补铁食谱安排上（猪肝粉/牛肉末/鸡肝每周2~3次），餐后配维C水果促吸收，2周后复查。', high: '偏高少见，脱水或血液浓缩，复测。', okNote: '不贫血，继续保持。' },
  { k: 'tg', name: '甘油三酯 TG', unit: 'mmol/L', min: 0.3, max: 1.7,
    high: 'CD宝宝高脂饮食下偏高不少见——不要自行减脂肪！请医生评估脂肪结构（MCT/长链比例），同时严控精制糖。', low: '偏低反而提示脂肪供给不足，检查MCT是否吃够。', okNote: '正常。' },
  { k: 'chol', name: '总胆固醇 CHOL', unit: 'mmol/L', min: 2.8, max: 5.2,
    high: '交医生判读，通常与脂肪总量/结构相关，配合TG一起看。', low: '偏低提示脂肪/能量供给不足。', okNote: '正常。' },
  { k: 'vitd', name: '维生素D 25(OH)D', unit: 'ng/mL', min: 20, max: 100,
    low: '<20缺乏、20~30不足：补充剂调整+每天户外2小时，1~2个月后复查（nmol/L数值÷2.5换算后再填）。', high: '>100有过量风险：暂停补充剂并咨询医生。', okNote: '充足，按现剂量维持。' }
];

let curReport = null;
let ocrBusy = false;

/* --- IndexedDB（存报告图片，localStorage放不下） --- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('baby_app_db', 1);
    r.onupgradeneeded = e => { e.target.result.createObjectStore('files'); };
    r.onsuccess = e => res(e.target.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, val) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(key) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readonly'); const q = tx.objectStore('files').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbDel(key) { const db = await idb(); return new Promise(res => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(key); tx.oncomplete = res; }); }

async function compressImage(file) {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.72));
    return (blob && blob.size < file.size) ? blob : file;
  } catch (e) { return file; }
}

function renderReports() {
  const list = S.reports.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  const cur = curReport ? S.reports.find(r => r.id === curReport) : null;
  $('#app').innerHTML = `
    ${dueBannerHTML()}
    <div class="card guard-card">
      <b>🛡 守护中心</b>
      <p class="dim small" style="margin-top:4px">复查提醒 · 疫苗日程 · 就诊档案 · AI解读包</p>
      <div class="chips" style="margin-top:10px">
        <button class="on" onclick="buildAIPack()">📤 生成AI解读包（发给大金子出方案）</button>
        <button onclick="enableNotif()">🔔 ${S.notifOn ? '到期通知已开启' : '开启到期通知'}</button>
      </div>
    </div>
    <div class="sec-title">⏰ 复查提醒</div>
    <div class="card">
      <div class="f-row"><input type="date" id="rm_date" value="${todayStr()}"><input id="rm_label" placeholder="事项（如：复查肝功能+血氨）"><button class="btn small ocr" style="width:auto;flex-shrink:0;margin-bottom:0" onclick="addRemind()">＋</button></div>
      ${(S.reminders || []).map(r => `<div class="hist-row"><span>${esc(r.date)}</span><span>${esc(r.label)}</span><button onclick="delRemind('${r.id}')">✕</button></div>`).join('') || '<p class="dim small">还没有提醒。建议先加：下次复查日期、疫苗接种日。</p>'}
    </div>
    <div class="sec-title">💉 疫苗日程（国家免疫规划）</div>
    <div class="card">${vaxBlockHTML()}<p class="dim small" style="margin-top:8px">已到月龄未勾选的表示待确认；点「设为提醒」加入上方提醒列表。</p></div>
    <div class="sec-title">🏥 就诊记录</div>
    <div class="card">
      <div class="f-row"><input type="date" id="cl_date" value="${todayStr()}"><input id="cl_hosp" placeholder="医院 / 科室"></div>
      <div class="f-row"><input id="cl_topic" placeholder="看了什么（如：CD例行复查）"></div>
      <div class="f-row"><input id="cl_advice" placeholder="医嘱要点"></div>
      <div class="f-row"><input type="date" id="cl_next"><span class="dim small" style="flex:1">下次复查日期（会自动变成提醒）</span></div>
      <button class="btn small ocr" style="width:100%" onclick="addClinic()">＋ 记一条就诊</button>
      ${(S.clinic || []).map((c, i) => `<div class="hist-row"><span>${esc(c.date)}</span><span>${esc(c.topic || c.advice || '就诊')}${c.hosp ? ' · ' + esc(c.hosp) : ''}</span><button onclick="showClinic(${i})">查看</button><button onclick="delClinic('${c.id}')">✕</button></div>`).join('')}
    </div>
    <div class="sec-title">📋 体检报告库</div>
    <div class="card upload-card">
      <input type="file" id="repFile" accept="image/*" multiple style="display:none" onchange="addReportFiles(this)">
      <button class="btn main" onclick="document.getElementById('repFile').click()">📷 上传 / 拍摄体检报告</button>
      <p class="dim small">体检报告、化验单、儿保手册都可以拍。图片只保存在本机浏览器，不上传任何服务器。上传后可一键自动识别填数，也可对照图片手动填写。</p>
    </div>
    ${list.length ? `<div class="thumb-grid">${list.map(thumbCard).join('')}</div>` : '<div class="card dim">还没有报告，拍一张试试 👆</div>'}
    ${cur ? reportEditor(cur) : ''}`;
  list.forEach(r => {
    const el = document.getElementById('th_' + r.id);
    if (el) idbGet('img_' + r.id).then(b => { if (b && document.getElementById('th_' + r.id)) el.src = URL.createObjectURL(b); });
  });
  if (cur) {
    idbGet('img_' + cur.id).then(b => { const img = $('#repImg'); if (b && img) img.src = URL.createObjectURL(b); });
    setTimeout(labPreview, 0);
  }
}

function countAbnormal(r) {
  return LABS.filter(L => { const v = r.labs[L.k]; return v != null && (v > L.max || v < L.min || (L.criticalMax && v >= L.criticalMax)); }).length;
}

function thumbCard(r) {
  const bad = countAbnormal(r);
  return `<div class="thumb ${curReport === r.id ? 'on' : ''}" onclick="curReport='${r.id}';renderTab()">
    <img id="th_${r.id}" alt="报告${esc(r.date)}">
    <div class="thumb-t">${esc(r.date)}</div>
    ${bad ? `<div class="badge warn">${bad}项待关注</div>` : ''}
  </div>`;
}

async function addReportFiles(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  let lastId = null;
  for (const f of files) {
    const blob = await compressImage(f);
    const id = 'r' + Date.now() + Math.floor(Math.random() * 999);
    await idbPut('img_' + id, blob);
    S.reports.push({ id, date: todayStr(), h: null, w: null, head: null, labs: {}, ocrText: '', plan: null, planText: '' });
    lastId = id;
  }
  save(); input.value = '';
  curReport = lastId;
  toast(files.length > 1 ? '已添加 ' + files.length + ' 份报告' : '报告已添加，开始填数据吧');
  renderTab();
}

async function delReport(id) {
  if (!confirm('删除这份报告（含图片）？不可恢复。')) return;
  await idbDel('img_' + id);
  S.reports = S.reports.filter(x => x.id !== id);
  if (curReport === id) curReport = null;
  save(); renderTab();
}

async function viewImage(id) {
  const b = await idbGet('img_' + id);
  if (b) openModal(`<img src="${URL.createObjectURL(b)}" style="width:100%;border-radius:12px" alt="报告大图">`, true);
}

function labInput(L, v) {
  return `<div class="f-row lab-row"><label>${L.name}<i class="dim small"> ${L.unit} · 参考${L.min}~${L.max}</i></label>
    <input type="number" step="0.1" inputmode="decimal" id="lab_${L.k}" value="${v != null ? v : ''}" oninput="labPreview()">
    <span class="lab-flag" id="flag_${L.k}"></span></div>`;
}

function reportEditor(r) {
  return `
    <div class="sec-title">📝 报告详情 · ${esc(r.date)}</div>
    <div class="card">
      <img id="repImg" class="rep-img" alt="报告大图" onclick="viewImage('${r.id}')">
      <div class="ocr-row">
        <button class="btn small ocr" id="ocrBtn" onclick="ocrReport('${r.id}')">🔍 自动识别图片数据</button>
        <button class="btn small ghost" onclick="delReport('${r.id}')">删除</button>
      </div>
      <div id="ocrStatus" class="dim small" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <h4>基础测量</h4>
      <div class="f-row"><label>日期</label><input type="date" id="lab_date" value="${esc(r.date)}"></div>
      <div class="f-row"><label>身高/身长 cm</label><input type="number" step="0.1" inputmode="decimal" id="lab_h" value="${r.h != null ? r.h : ''}" oninput="labPreview()"></div>
      <div class="f-row"><label>体重 kg</label><input type="number" step="0.1" inputmode="decimal" id="lab_w" value="${r.w != null ? r.w : ''}" oninput="labPreview()"></div>
      <div class="f-row"><label>头围 cm（选填）</label><input type="number" step="0.1" inputmode="decimal" id="lab_head" value="${r.head != null ? r.head : ''}"></div>
      <h4>化验指标（有就填，自动判读）</h4>
      ${LABS.map(L => labInput(L, r.labs[L.k])).join('')}
      <p class="dim small">参考区间为儿童近似值；若化验单上印了参考范围，以化验单为准。</p>
      <button class="btn main" onclick="saveReportForm('${r.id}')">💾 保存并生成最佳方案</button>
      ${r.plan ? planHTML(r) : '<p class="dim small">填完数据保存后，这里会针对这份报告生成专属方案。</p>'}
    </div>`;
}

function labFlag(L, v) {
  if (v == null || isNaN(v)) return null;
  if (L.criticalMax != null && v >= L.criticalMax) return { cls: 'bad', txt: '🚨 危急' };
  if (v > L.max) return { cls: 'warn', txt: '↑ 偏高' };
  if (v < L.min) return { cls: 'warn', txt: '↓ 偏低' };
  return { cls: 'ok', txt: '✓ 正常' };
}

function labPreview() {
  LABS.forEach(L => {
    const el = document.getElementById('lab_' + L.k); const f = document.getElementById('flag_' + L.k);
    if (!el || !f) return;
    const v = parseFloat(el.value);
    const fl = (el.value !== '' && isFinite(v)) ? labFlag(L, v) : null;
    f.textContent = fl ? fl.txt : '';
    f.className = 'lab-flag ' + (fl ? fl.cls : '');
  });
}

/* --- OCR（Tesseract.js，首次联网加载引擎） --- */
let tessPromise = null;
function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tessPromise) {
    tessPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = res; s.onerror = () => { tessPromise = null; rej(new Error('load failed')); };
      document.head.appendChild(s);
    });
  }
  return tessPromise;
}

async function ocrReport(id) {
  if (ocrBusy) return;
  ocrBusy = true;
  const st = $('#ocrStatus'), btn = $('#ocrBtn');
  try {
    btn.disabled = true;
    st.textContent = '⏳ 正在加载识别引擎…（首次使用需联网下载中文识别包约15MB，请耐心等待）';
    await ensureTesseract();
    st.textContent = '🔍 正在识别，字越多越慢（约10~40秒）…';
    const blob = await idbGet('img_' + id);
    const worker = await Tesseract.createWorker('chi_sim+eng');
    const { data } = await worker.recognize(URL.createObjectURL(blob));
    await worker.terminate();
    const n = fillFromOCR(data.text || '');
    const rep = S.reports.find(x => x.id === id);
    if (rep) { rep.ocrText = data.text || ''; save(); }
    st.innerHTML = n > 0
      ? `✅ 识别完成，自动填入 ${n} 项（<b class="ocr-hint">橙色框</b>为识别值，务必逐项核对后保存）`
      : '🤖 没认出有效数据（拍照清晰度影响很大）。对照上方图片手动填写，2分钟搞定。';
  } catch (e) {
    st.textContent = '⚠️ 识别不可用（需要联网加载引擎）。对照图片手动填写一样快。';
  }
  btn.disabled = false; ocrBusy = false;
}

function grabLab(text, nameRe, min, max) {
  const re = new RegExp('(' + nameRe + ')[^\\d\\n]{0,14}(\\d{1,3}(?:\\.\\d)?)', 'gi');
  let m;
  while ((m = re.exec(text))) {
    if (/参\s*考|范围|区间|Ref/i.test(m[0])) continue;
    const v = parseFloat(m[2]);
    if (!isFinite(v)) continue;
    if (min != null && (v < min || v > max)) continue;
    return v;
  }
  return null;
}

function fillFromOCR(text) {
  let n = 0;
  const put = (k, v) => { const el = document.getElementById('lab_' + k); if (el && v != null) { el.value = v; el.classList.add('filled'); n++; } };
  put('h', grabLab(text, '身高|身长|Ht|height', 40, 130));
  put('w', grabLab(text, '体重|Wt|weight', 2, 30));
  put('head', grabLab(text, '头围|HC', 30, 60));
  put('alt', grabLab(text, 'ALT|谷丙转氨酶', 0, 999));
  put('ast', grabLab(text, 'AST|谷草转氨酶', 0, 999));
  put('tbil', grabLab(text, '总胆红素|TBIL|T-BIL', 0, 999));
  put('dbil', grabLab(text, '直接胆红素|DBIL|D-BIL', 0, 999));
  put('nh3', grabLab(text, '血氨|NH3', 0, 999));
  put('alb', grabLab(text, '白蛋白|ALB', 20, 60));
  put('hgb', grabLab(text, '血红蛋白|HGB|Hb', 60, 200));
  put('tg', grabLab(text, '甘油三酯|TG', 0, 20));
  put('chol', grabLab(text, '总胆固醇|CHOL', 0, 20));
  put('vitd', grabLab(text, '25-?OH?D?|维生素D|VitD', 0, 300));
  labPreview();
  return n;
}

/* --- 保存 + 最佳方案引擎 --- */
function pickRecipes(tags, n) {
  if (!tags.length) return seedPick(RECIPES, n, daySeed());
  const scored = RECIPES.map(r => ({ r, s: r.tags.filter(t => tags.includes(t)).length })).filter(x => x.s > 0);
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(x => x.r);
}

function buildPlan(rep) {
  const a = ageInfo(rep.date);
  const plan = { urg: [], growth: [], labRows: [], diet: { head: '保持现有CD结构：蛋白+好脂肪打头阵，主食≤1/4，MCT按医嘱。', items: [] }, edu: { head: '', items: [] }, actions: [] };

  // 🚨 紧急
  if (rep.labs.nh3 != null && rep.labs.nh3 >= 120) plan.urg.push('🚨 血氨 ' + rep.labs.nh3 + ' μmol/L 明显高于安全区：警惕高氨血症代谢危象。立即就医（儿科急诊/遗传代谢专科），出示「CD健康卡」，途中避免长时间空腹。');
  if (rep.labs.tbil != null && rep.labs.tbil > 50) plan.urg.push('🚨 总胆红素 ' + rep.labs.tbil + ' μmol/L 显著升高：胆汁淤积可能反复，24小时内联系主治医生/复诊。');
  if (rep.labs.dbil != null && rep.labs.dbil > 20) plan.urg.push('🚨 直接胆红素 ' + rep.labs.dbil + ' μmol/L 显著升高：优先排查胆汁排泄，尽早就诊并查肝胆B超。');

  // 📈 生长
  const bandNames = ['P3以下 ⚠️', 'P3~P15', 'P15~P50', 'P50~P85', 'P85~P97', 'P97以上'];
  if (rep.w) {
    const b = bandOf('wt', a.months, rep.w);
    plan.growth.push('体重位于 ' + bandNames[b] + (b <= 1 ? '：营养追赶优先，见下方饮食方案。' : b >= 4 ? '：偏上区间——控糖控碳水；CD宝宝注意水肿/肝大可致体重虚高，增长过快请医生复核。' : '：稳定区间，保持现结构。'));
    const prev = S.measures.filter(m => m.date < rep.date && m.w).slice(-1)[0];
    if (prev) {
      const dm = a.months - ageInfo(prev.date).months;
      if (dm >= 1) {
        const gm = (rep.w - prev.w) / dm;
        const rate = gm >= 0.15 ? '良好' : gm >= 0.08 ? '偏慢' : '明显偏慢';
        plan.growth.push('与上次（' + prev.date + '）比：约每月增重 ' + gm.toFixed(2) + 'kg → ' + rate + '（1岁后正常节奏约0.15~0.25kg/月）');
      }
    }
  }
  if (rep.h) {
    const b = bandOf('len', a.months, rep.h);
    plan.growth.push('身长位于 ' + bandNames[b] + (b <= 1 ? '：线性生长偏慢——保证蛋白+脂溶性维生素，睡眠拉满，请医生评估。' : '：正常区间，保持。'));
  }

  // 🧪 化验逐项
  LABS.forEach(L => {
    const v = rep.labs[L.k];
    if (v == null) return;
    const f = labFlag(L, v);
    plan.labRows.push({ name: L.name, v, unit: L.unit, flag: f.txt, cls: f.cls, advice: v > L.max ? L.high : (v < L.min ? L.low : L.okNote) });
  });

  // 🍽️ 饮食方案
  const lowW = rep.w != null && bandOf('wt', a.months, rep.w) <= 1;
  const anemia = rep.labs.hgb != null && rep.labs.hgb < 110;
  const tgHigh = rep.labs.tg != null && rep.labs.tg > 1.7;
  let tags = [];
  if (lowW) { tags = ['含MCT', '加餐', '低碳水']; plan.diet.head = '营养追赶模式：高能量密度食谱优先 + 少量多餐5~6次/天，先脂肪蛋白后主食，一周后复测体重。'; }
  if (anemia) { tags = tags.concat(['补铁']); plan.diet.head += ' 贫血叠加：补铁食谱每周3~4次，餐后配维C水果促吸收，2周后复查血常规。'; }
  if (tgHigh) plan.diet.head += ' 甘油三酯偏高：脂肪总量不减但请医生复核MCT/长链脂肪配比，严控精制糖与果糖。';
  plan.diet.items = pickRecipes([...new Set(tags)], 3);

  // 🧩 早教方案
  const acts = seedPick(MONTESSORI.filter(m => inAge(m, a.months)), 2, daySeed() + a.months);
  plan.edu = { head: a.label + ' · 发育与早教重点：' + stageTip(a.months), items: acts };

  // ✅ 行动清单
  if (plan.urg.length) plan.actions.push({ t: '立即', d: '处理上方🚨紧急事项：联系医生/就医，随身出示CD健康卡' });
  if (rep.labs.alt != null && rep.labs.alt > 45) plan.actions.push({ t: '1~2周内', d: '复查肝功能（ALT/AST/胆红素），把本报告发给主治医生' });
  if (lowW) plan.actions.push({ t: '2周内', d: '预约临床营养科一次个体化评估；每天晨起固定条件称重记录' });
  if (anemia) plan.actions.push({ t: '2周后', d: '复查血常规，看血红蛋白回升情况' });
  if (tgHigh || (rep.labs.chol != null && rep.labs.chol > 5.2)) plan.actions.push({ t: '下次随访', d: '带血脂报告请医生评估脂肪配比' });
  if (rep.labs.vitd != null && rep.labs.vitd < 20) plan.actions.push({ t: '本周', d: '维生素D补充方案找医生调整；每天户外2小时落实' });
  plan.actions.push({ t: '常规', d: '每3~6个月CD例行复查：肝功能+血氨+肝脏B超（遵医嘱）' });
  plan.actions.push({ t: '常规', d: '身高体重已自动同步到「曲线」页，看趋势比看单次数值更重要' });
  return plan;
}

function planToText(rep) {
  const p = buildPlan(rep);
  const a = ageInfo(rep.date);
  let s = '【CD宝贝体检解读 · ' + rep.date + ' · ' + a.label + '】\n';
  const ms = [rep.h != null && '身高' + rep.h + 'cm', rep.w != null && '体重' + rep.w + 'kg', rep.head != null && '头围' + rep.head + 'cm'].filter(Boolean).join(' / ');
  if (ms) s += '测量：' + ms + '\n';
  const labs = Object.keys(rep.labs).map(k => { const L = LABS.find(x => x.k === k); return L.name + ' ' + rep.labs[k] + L.unit; }).join('；');
  if (labs) s += '化验：' + labs + '\n';
  if (p.urg.length) s += '\n🚨 紧急：\n' + p.urg.join('\n') + '\n';
  if (p.growth.length) s += '\n📈 生长判读：\n' + p.growth.join('\n') + '\n';
  if (p.labRows.length) s += '\n🧪 化验判读：\n' + p.labRows.map(x => '· ' + x.name + ' ' + x.v + x.unit + ' ' + x.flag + '：' + x.advice).join('\n') + '\n';
  s += '\n🍽️ 饮食方案：' + p.diet.head + '\n推荐食谱：' + p.diet.items.map(x => x.name).join('、');
  s += '\n\n🧩 早教：' + p.edu.head + '\n推荐活动：' + p.edu.items.map(x => x.name).join('、');
  s += '\n\n✅ 行动清单：\n' + p.actions.map(x => '[' + x.t + '] ' + x.d).join('\n');
  s += '\n\n（本解读为家庭参考，具体执行遵主治医生/临床营养师意见）';
  return s;
}

function planHTML(r) {
  const p = r.plan;
  return `<div class="plan-card">
    <h4>🧭 本报告最佳方案</h4>
    ${p.urg.length ? p.urg.map(u => `<div class="callout red">${esc(u)}</div>`).join('') : '<p class="small" style="color:var(--ok)">✅ 无紧急事项</p>'}
    ${p.growth.length ? `<div class="plan-sec"><b>📈 生长判读</b>${p.growth.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
    ${p.labRows.length ? `<div class="plan-sec"><b>🧪 化验判读</b>${p.labRows.map(x => `<div class="lab-plan ${x.cls}"><b>${esc(x.name)} ${x.v}${esc(x.unit)} ${esc(x.flag)}</b><p>${esc(x.advice)}</p></div>`).join('')}</div>` : ''}
    <div class="plan-sec"><b>🍽️ 饮食方案</b><p>${esc(p.diet.head)}</p>${p.diet.items.map(x => `<div class="slim-line" onclick="showRecipe('${x.id}')">🍲 ${esc(x.name)} →</div>`).join('')}</div>
    <div class="plan-sec"><b>🧩 早教方案</b><p>${esc(p.edu.head)}</p>${p.edu.items.map(x => `<div class="slim-line" onclick="showActivity('${x.id}')">🧸 ${esc(x.name)}（${esc(x.area)}）→</div>`).join('')}</div>
    <div class="plan-sec"><b>✅ 行动清单</b>${p.actions.map(x => `<div class="act"><span class="when">${esc(x.t)}</span><span>${esc(x.d)}</span></div>`).join('')}</div>
    <button class="btn small ghost" style="margin-top:12px;width:100%" onclick="copyPlan('${r.id}')">📋 复制方案文本（发给医生/家人）</button>
  </div>`;
}

function saveReportForm(id) {
  const rep = S.reports.find(x => x.id === id); if (!rep) return;
  const g = k => { const el = document.getElementById('lab_' + k); if (!el || el.value === '') return null; const v = parseFloat(el.value); return isFinite(v) ? v : null; };
  rep.date = document.getElementById('lab_date').value || rep.date;
  rep.h = g('h'); rep.w = g('w'); rep.head = g('head');
  rep.labs = {};
  LABS.forEach(L => { const v = g(L.k); if (v != null) rep.labs[L.k] = v; });
  // 同步到生长曲线
  if (rep.h != null || rep.w != null) {
    const old = S.measures.findIndex(m => m.date === rep.date);
    const item = { date: rep.date, h: rep.h != null ? rep.h : (old >= 0 ? S.measures[old].h : null), w: rep.w != null ? rep.w : (old >= 0 ? S.measures[old].w : null) };
    if (old >= 0) S.measures[old] = item; else { S.measures.push(item); S.measures.sort((x, y) => x.date < y.date ? -1 : 1); }
  }
  rep.plan = buildPlan(rep);
  rep.planText = planToText(rep);
  save();
  renderTab();
  confetti(14);
}

async function copyPlan(id) {
  const r = S.reports.find(x => x.id === id); if (!r || !r.planText) return;
  try { await navigator.clipboard.writeText(r.planText); toast('已复制 ✅ 可粘贴发给医生或家人'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = r.planText; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制 ✅'); } catch (e2) { toast('复制失败，长按方案文字手动复制'); }
    ta.remove();
  }
}

/* ---------------- 视频学堂 ---------------- */
let schoolCat = '全部';
const SCHOOL_CATS = ['全部', '思辨家长课', '蒙氏示范', '亲子游戏', '语言启蒙', 'CD喂养'];

function actSearchKw(m) {
  if (m.area === '生活实践') return '蒙台梭利 ' + m.name + ' 示范';
  if (m.area === '语言') return m.name + ' 亲子互动';
  return m.name + ' 幼儿 示范';
}

function searchJump(plat, kw) {
  const k = encodeURIComponent(String(kw || '').trim());
  let url;
  if (plat === 'youku') url = 'https://so.youku.com/search_video/q_' + k;
  else if (plat === 'douyin') url = 'https://www.douyin.com/search/' + k;
  else url = 'https://search.bilibili.com/all?keyword=' + k;
  window.open(url, '_blank');
}
function openBv(bv) { window.open('https://www.bilibili.com/video/' + bv, '_blank'); }
function openUrl(u) { if (u) window.open(u, '_blank'); }

function renderSchool() {
  if (!SCHOOL_CATS.includes(schoolCat)) schoolCat = '全部';
  const favs = (S.favVideos || []).slice().reverse();
  const list = schoolCat === '全部' ? VIDEOS : VIDEOS.filter(v => v.cat === schoolCat);
  const daily = seedPick(VIDEOS, 1, daySeed())[0];
  $('#app').innerHTML = `
    <div class="card tip-card">📺 <b>视频是给大人学的，不是给宝宝刷的</b><br>看15分钟学会怎么玩 → 放下手机陪玩15分钟。21月龄宝宝每天屏幕时间尽量为0：你的脸、你的声音、你的手，才是最好的早教视频。</div>
    <div class="sec-title">🎓 今日家长课</div>
    <div class="card slim" onclick="searchJump('${daily.plat}','${daily.kw.replace(/'/g, '')}')">
      <b>${daily.icon} ${esc(daily.title)}</b>
      <p class="dim small">${esc(daily.why)}</p>
      <div class="chips"><span>点卡片去B站看 →</span><span>${esc(daily.who)}</span></div>
    </div>
    <div class="sec-title">📺 我的收藏</div>
    <div class="card">
      <div class="f-row"><input id="fvTitle" placeholder="标题（如：三段卡示范）"></div>
      <div class="f-row"><input id="fvUrl" placeholder="粘贴B站/优酷/抖音视频链接">
        <button class="btn small ocr" style="width:auto;flex-shrink:0;margin-bottom:0" onclick="addFav()">＋收藏</button></div>
      ${favs.length ? favs.map(favRow).join('') : '<p class="dim small">刷到好视频就存进来，随取随看。B站链接可以在App内直接播放。</p>'}
    </div>
    <div class="sec-title">🔥 精选课单（点卡片直达搜索）</div>
    <div class="chips row">${SCHOOL_CATS.map(c => `<button class="${schoolCat === c ? 'on' : ''}" onclick="schoolCat='${c}';renderTab()">${c}</button>`).join('')}</div>
    ${list.map(videoCard).join('')}
    <div class="card tip-card">💡 收录逻辑：平台视频链接经常失效，所以课单存的是「稳定存在的节目/方法名 + 精准搜索词」，点开就是当前能看的版本；遇到真爱视频，粘贴链接收藏进来永久保留。</div>`;
}

function videoCard(v) {
  return `<div class="card slim vcard" onclick="searchJump('${v.plat}','${v.kw.replace(/'/g, '')}')">
    <div class="v-ico">${v.icon}</div>
    <div class="v-body"><b>${esc(v.title)}</b><p class="dim small">${esc(v.why)}</p>
      <div class="chips"><span>${esc(v.cat)}</span><span>${esc(v.who)}</span></div></div>
    <div class="v-go">🔍</div>
  </div>`;
}

function favRow(f) {
  return `<div class="f-row fav-row">
    <span class="fv-t">${f.bv ? '▶️' : '🔗'} ${esc(f.title)}</span>
    ${f.bv ? `<button class="btn small ocr" style="width:auto;flex-shrink:0;margin-bottom:0" onclick="playFav('${f.id}')">播放</button>` : `<button class="btn small ocr" style="width:auto;flex-shrink:0;margin-bottom:0" onclick="openUrl('${f.url.replace(/'/g, '')}')">打开</button>`}
    <button class="btn small ghost" style="width:auto;flex-shrink:0;margin-bottom:0" onclick="delFav('${f.id}')">✕</button>
  </div>`;
}

function addFav() {
  const t = ($('#fvTitle') && $('#fvTitle').value || '').trim().replace(/'/g, '') || '我的视频';
  const u = ($('#fvUrl') && $('#fvUrl').value || '').trim().replace(/'/g, '');
  if (!u) { toast('先粘贴视频链接哦'); return; }
  const m = u.match(/BV[0-9A-Za-z]{10}/);
  S.favVideos.push({ id: 'v' + Date.now(), title: t, url: u, bv: m ? m[0] : null });
  save(); renderTab();
  toast(m ? '已收藏 ✅ B站视频可在App内直接播放' : '已收藏 ✅');
}
function delFav(id) { S.favVideos = S.favVideos.filter(x => x.id !== id); save(); renderTab(); }

function playFav(id) {
  const v = S.favVideos.find(x => x.id === id); if (!v) return;
  openModal(`<h3>${esc(v.title)}</h3>
    <div class="vwrap"><iframe src="https://player.bilibili.com/player.html?bvid=${v.bv}&autoplay=0&high_quality=1" allowfullscreen scrolling="no" frameborder="0"></iframe></div>
    <p class="dim small">若提示无法播放（部分UP主未开放外站播放），去B站观看：</p>
    <button class="btn small ghost" style="width:100%" onclick="openBv('${v.bv}')">↗ 去B站打开</button>`, true);
}

/* ---------------- 规划页 ---------------- */
function renderPlan() {
  const a = ageInfo();
  const er = EDU_ROADS.find(s => a.months >= s.range[0] && a.months < s.range[1]) || EDU_ROADS[0];
  $('#app').innerHTML = `
    <div class="sec-title">🗺️ 人生规划时间轴</div>
    ${PLANNING.map(p => {
      const now = a.months >= p.range[0] && a.months < p.range[1];
      return `<div class="card plan ${now ? 'now' : ''}">
        <b>${now ? '📍 ' : ''}${esc(p.stage)}</b>
        <ul class="plain"><li>🎯 目标：${p.goals.map(esc).join('；')}</li><li>🎬 行动：${p.actions.map(esc).join('；')}</li><li>🏥 ${esc(p.checkup)}</li></ul>
        <p class="dim small">${esc(p.note)}</p>
      </div>`;
    }).join('')}

    <div class="sec-title">🇨🇳 国家政策与支持（能申请的都别浪费）</div>
    <div class="card policy-prog">
      <b>办理进度：${POLICIES.filter(p => policyState(p.id) === 'done').length}/${POLICIES.length} 已办结</b>
      <div class="prog"><i style="width:${Math.round(POLICIES.filter(p => policyState(p.id) === 'done').length / POLICIES.length * 100)}%"></i></div>
      <p class="dim small">信息核验 2026-10；各地标准与申领方式有差异，以户籍/居住地最新公告为准。点卡片看申请要点，卡片下方可标记进度。</p>
    </div>
    <div class="card slim">
      <b>💰 育儿补贴 · 你家能领多少</b>
      <p class="small">${subsidyNote()}</p>
    </div>
    ${POLICIES.map(p => `
      <div class="card slim" onclick="showPolicy('${p.id}')">
        <b>${esc(p.name)}</b><div class="chips"><span>${esc(p.tag)}</span></div>
        <p class="dim small clamp2">${esc(p.what)}</p>
        <div class="chips st" id="st_${p.id}">${stChipsHTML(p)}</div>
      </div>`).join('')}

    <div class="sec-title">🎓 选学校 · 竞赛 · 奖学金</div>
    <div class="card slim" onclick="showGZ()">
      <b>📍 广州就读 · 永州户籍：入学与高考路线</b>
      <p class="dim small">积分入学怎么攒分、落户更快、异地高考「3个3」硬条件——居住证和社保现在就要开始攒</p>
    </div>
    <div class="card slim" onclick="showEduRoads()">
      <b>🏫 升学路线与选校策略</b>
      <p class="dim small">📍 当前：${esc(er.stage)} — ${esc(er.pts[0])} …从幼儿园到大学全路线，点开看全</p>
    </div>
    <div class="card slim" onclick="showEduComp()">
      <b>🏆 竞赛白名单与冲奖路线</b>
      <p class="dim small">教育部 2025-2028 学年白名单 47 项（2025-10 刚公布）；小学重素养、高中奥赛才是升学硬通货，含防坑清单</p>
    </div>
    <div class="card slim" onclick="showEduAid()">
      <b>🎓 奖学金与国家资助体系</b>
      <p class="dim small">义务教育「两免一补」→ 普高助学金 2300 → 大学国奖 1 万/励志 6 千/助学贷款 2 万，各学段标准一览</p>
    </div>
    <div class="card slim" onclick="showEduCD()">
      <b>🛡️ CD宝宝选校专属清单</b>
      <p class="dim small">入学「一页纸」+ 开学必问 6 问 + 与学校书面约定的沟通依据</p>
    </div>

    <div class="sec-title">📱 安装到手机（像App一样用）</div>
    <div class="card">
      <p><b>iPhone</b>：用 Safari 打开本页 → 底部「分享」→ 选「添加到主屏幕」。</p>
      <p><b>Android</b>：用 Chrome 打开本页 → 右上角菜单 → 「添加到主屏幕 / 安装应用」。</p>
      <p class="dim small">最顺手的做法是把整个文件夹部署到任一免费静态托管（或公司内网），手机访问网址后添加到主屏幕，PWA 完整生效；也可以直接发「手机单文件版」HTML 给手机浏览器打开。数据保存在这台手机的浏览器里：换手机前先「设置 → 导出备份」，新手机导入即可续用。</p>
    </div>

    <div class="sec-title">🛡️ CD复查提醒清单</div>
    <div class="card">
      ${CD_INFO.followup.map((f, i) => {
        const key = 'f' + i;
        return `<label class="task ${S.followupDone[key] ? 'done' : ''}">
          <input type="checkbox" ${S.followupDone[key] ? 'checked' : ''} onchange="S.followupDone['${key}']=this.checked;save()">
          <span class="t-body"><b>${esc(f)}</b></span></label>`;
      }).join('')}
      <p class="dim small">每次复查后记得把身高体重录入「曲线」页。</p>
    </div>`;
}
/* 政策办理状态跟踪 + 育儿补贴自动测算 */
function policyState(id) { return S.policyDone[id] || 'todo'; }
function stChipsHTML(p) {
  return [['todo', '◻ 待办'], ['doing', '🔄 办理中'], ['done', '✅ 已办结']].map(([v, t]) =>
    `<button class="${policyState(p.id) === v ? 'on' : ''}" onclick="event.stopPropagation();setPolicyState('${p.id}','${v}')">${t}</button>`).join('');
}
function setPolicyState(id, st) {
  S.policyDone[id] = st; save();
  const p = POLICIES.find(x => x.id === id);
  const box = document.getElementById('st_' + id);
  if (box) box.innerHTML = stChipsHTML(p);
  const doneN = POLICIES.filter(x => policyState(x.id) === 'done').length;
  const bar = document.querySelector('.policy-prog .prog i');
  if (bar) bar.style.width = Math.round(doneN / POLICIES.length * 100) + '%';
  const pb = document.querySelector('.policy-prog b');
  if (pb) pb.textContent = `办理进度：${doneN}/${POLICIES.length} 已办结`;
}
function subsidyNote() {
  const y = parseInt((S.baby.birth || '').slice(0, 4), 10);
  if (y >= 2025) return `按档案生日 ${esc(S.baby.birth)}：属于 2025-01-01 及以后出生，可连续申领 3 个年度、合计约 10800 元（发放至满3周岁）。`;
  if (y >= 2023) return `按档案生日 ${esc(S.baby.birth)}：2025-01-01 前出生、申领时未满3周岁的，按应补贴月数折算计发。`;
  return '按国家方案，补贴覆盖 2025-01-01 起未满3周岁的婴幼儿；如家中有二宝/三宝可按同规则申领。';
}
function showPolicy(id) {
  const p = POLICIES.find(x => x.id === id); if (!p) return;
  openModal(`<h3>${esc(p.name)}</h3><div class="chips"><span>${esc(p.tag)}</span></div>
    <h4>是什么</h4><p>${esc(p.what)}</p>
    ${p.extra ? `<div class="callout">📌 ${esc(p.extra)}</div>` : ''}
    <h4>怎么申请</h4><p>${esc(p.how)}</p>
    <div class="callout">🔍 ${esc(p.key)}</div>
    <h4>办理状态</h4><div class="chips st">${stChipsHTML(p)}</div>`);
}

/* ---------------- 阅读页 ---------------- */
function renderRead() {
  const a = ageInfo();
  const ci = Math.max(0, READ_STAGES.findIndex(s => a.months >= s.range[0] && a.months < s.range[1]));
  const stage = READ_STAGES[ci];
  $('#app').innerHTML = `
    <div class="sec-title">📖 阅读处方 · ${esc(S.baby.name)}（${a.label}）</div>
    <div class="card">
      <b>每天读多少：${esc(stage.daily)}</b>
      <p class="dim small">${esc(stage.how)}</p>
      <p class="dim small">💡 固定时段比时长重要（睡前是黄金档）；重复读同一本不是浪费，是学习；不把阅读当惩罚；大人自己拿本书，是最强示范。「今日」页的 📖 亲子共读任务记得打卡计分。</p>
    </div>

    <div class="sec-title">⏰ 每天读多少 · 速查表</div>
    <div class="card">
      <table class="rt">
        <tr><th>阶段</th><th>每天总量</th><th>形式与方法</th></tr>
        ${READING_AMOUNTS.map(r => `<tr class="${a.months >= r.range[0] && a.months < r.range[1] ? 'now' : ''}"><td><b>${r.age}</b></td><td>${r.amount}</td><td class="dim">${r.form}</td></tr>`).join('')}
      </table>
    </div>

    <div class="sec-title">📚 分阶段书单</div>
    ${READ_STAGES.map((s, i) => `
      <div class="card slim${i === ci ? ' now-card' : ''}" onclick="showReadStage(${i})">
        <b>${i === ci ? '📍 ' : ''}${esc(s.stage)}</b>
        <p class="dim small">🎯 ${esc(s.goal)}</p>
        <p class="dim small">${esc(s.books[0])}｜${esc(s.books[1])}｜${esc(s.books[2])} …共${s.books.length}本，点开看全</p>
      </div>`).join('')}

    <div class="sec-title">🚀 四条成长线 · 读进去，更要练出来</div>
    ${COGNITION_TRACKS.map(t => {
      const ts = t.stages.find(s => a.months >= s.range[0] && a.months < s.range[1]) || t.stages[0];
      return `<div class="card slim" onclick="showTrack('${t.id}')">
        <b>${t.ic} ${esc(t.name)}</b><span class="dim"> · ${esc(t.sub)}</span>
        <p class="dim small">📍 ${esc(ts.age)}：${esc(ts.pts[0])}；${esc(ts.pts[1])} …</p>
        <div class="chips"><span>点开看完整路线（${t.stages.length}阶段）</span></div>
      </div>`;
    }).join('')}
  `;
}
function showReadStage(i) {
  const s = READ_STAGES[i]; if (!s) return;
  openModal(`<h3>📚 ${esc(s.stage)}</h3>
    <div class="callout">🎯 ${esc(s.goal)}</div>
    <h4>每天读多少</h4><p>${esc(s.daily)}</p>
    <h4>怎么读</h4><p>${esc(s.how)}</p>
    <h4>选书原则</h4><p>${esc(s.pick)}</p>
    <h4>书单（${s.books.length}本）</h4><ul class="plain">${s.books.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <p class="dim small">书单为家庭参考，版本与适读年龄以实物为准；图书馆借阅是低成本试错的好办法。</p>`);
}
function showTrack(id) {
  const t = COGNITION_TRACKS.find(x => x.id === id); if (!t) return;
  openModal(`<h3>${t.ic} ${esc(t.name)}</h3><div class="chips"><span>${esc(t.sub)}</span></div>
    ${t.stages.map(s => `<h4>${esc(s.age)}</h4><ul class="plain">${s.pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`).join('')}
    <p class="dim small">按当前月龄从对应阶段开始，前面的阶段可以快进回顾。</p>`);
}

/* ---------------- 教育规划弹层 ---------------- */
function showEduRoads() {
  const a = ageInfo();
  const ci = Math.max(0, EDU_ROADS.findIndex(s => a.months >= s.range[0] && a.months < s.range[1]));
  openModal(`<h3>🏫 升学路线与选校策略</h3>
    ${EDU_ROADS.map((s, i) => `<h4>${i === ci ? '📍 ' : ''}${esc(s.ic + ' ' + s.stage)}</h4>
      <ul class="plain">${s.pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      <p class="dim small">🔎 ${esc(s.key)}</p>`).join('')}
    <p class="dim small">招生政策各地差异大且逐年调整，以当地教育局当年文件为准。</p>`, true);
}
function showEduComp() {
  openModal(`<h3>🏆 竞赛白名单与冲奖路线</h3>
    <div class="callout">📌 ${esc(EDU_COMPETITION.what)}</div>
    ${EDU_COMPETITION.stages.map(s => `<h4>${esc(s.age)}</h4><ul class="plain">${s.pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`).join('')}
    <h4>⚠️ 防坑清单</h4><ul class="plain">${EDU_COMPETITION.pitfalls.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="dim small">白名单以教育部当年公布为准（moe.gov.cn；2025-2028学年 47 项，2025-10-29 公布）。</p>`, true);
}
function showEduAid() {
  openModal(`<h3>🎓 奖学金与国家资助体系</h3>
    ${EDU_AID.map(s => `<h4>${s.ic} ${esc(s.stage)}</h4><ul class="plain">${s.items.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`).join('')}
    <p class="dim small">标准核验于 2026-10（教育部 2024-10 提标文件）；申请入口：各学校「学生资助管理中心」，以当年文件为准。</p>`, true);
}
function showEduCD() {
  openModal(`<h3>🛡️ CD宝宝选校专属清单</h3>
    <div class="callout red"><b>入学「一页纸」</b><br>${esc(EDU_CD_SCHOOL.onePager)}</div>
    <h4>选校/开学必问 6 问</h4><ul class="plain">${EDU_CD_SCHOOL.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>
    <div class="callout">⏰ ${esc(EDU_CD_SCHOOL.timing)}</div>
    <h4>沟通依据</h4><p class="small">${esc(EDU_CD_SCHOOL.legal)}</p>`, true);
}

function showGZ() {
  openModal(`<h3>📍 广州就读 · 永州户籍路线图</h3>
    <div class="callout">🏠 ${esc(GZ_EDU.head)}</div>
    <h4>🏫 积分入学（各区通用框架）</h4><ul class="plain">${GZ_EDU.jf.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <h4>🎓 异地高考「3个3」硬条件（广东）</h4><ul class="plain">${GZ_EDU.gk.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <h4>⏰ 现在就要做的三件事</h4><ul class="plain">${GZ_EDU.now.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <h4>🛡️ CD家庭加分项</h4><ul class="plain">${GZ_EDU.cd.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="dim small">${esc(GZ_EDU.src)}</p>`, true);
}

/* ---------------- CD健康卡 ---------------- */
function showCD() {
  openModal(`<h3>🛡️ CD健康卡 · ${esc(S.baby.name)}</h3>
    <div class="callout red"><b>${esc(S.baby.name)} · ${esc(S.baby.birth)}出生</b><br>确诊：${esc(S.baby.condition)}（SLC25A13相关）<br>饮食：低碳水·高蛋白·高脂肪（MCT）<br>⚠️ 本卡片在急诊/住院/就诊时出示</div>
    <h4>关于这个病</h4>${CD_INFO.about.map(x => `<p class="small">${esc(x)}</p>`).join('')}
    <h4>🥗 饮食金律</h4><ul class="plain">${CD_INFO.dietRules.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h4>🥥 MCT使用要点</h4><ul class="plain">${CD_INFO.mct.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${CD_INFO.redFlags.map(f => `<div class="callout red"><b>${esc(f.t)}</b><br>${esc(f.d)}</div>`).join('')}
    <h4>♾️ 终身管理要点</h4><ul class="plain">${CD_INFO.lifelong.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <p class="dim small">${esc(APP_META.disclaimer)}</p>
    <button class="btn small ocr" style="width:100%;margin-top:10px" onclick="makeCDCardImage()">🖼️ 生成应急卡图片（存相册/发长辈/可设锁屏）</button>`, true);
}

/* ---------------- 守护中心：提醒/疫苗/就诊/周报/AI包/应急卡 ---------------- */
const VACCINES = [
  { age: 18, name: '百白破疫苗 第4剂' },
  { age: 18, name: '麻腮风疫苗 第2剂' },
  { age: 18, name: '甲肝减毒疫苗 第2剂' },
  { age: 24, name: '乙脑减毒疫苗 第2剂' },
  { age: 36, name: 'A+C群流脑疫苗 第2剂' },
  { age: 48, name: '脊灰疫苗 第4剂' },
  { age: 72, name: '白破疫苗 加强' },
  { age: 72, name: 'A+C群流脑疫苗 第3剂' }
];

function dueBannerHTML() {
  const t = todayStr();
  const lim = todayStr(new Date(Date.now() + 14 * 86400000));
  const due = (S.reminders || []).filter(r => r.date <= t);
  const soon = (S.reminders || []).filter(r => r.date > t && r.date <= lim);
  if (!due.length && !soon.length) return '';
  let rows = due.map(r => `<div><b>🔔 ${esc(r.label)}</b> — ${r.date < t ? '已到期（' + r.date + '），尽快安排！' : '就是今天！'}</div>`).join('');
  rows += soon.map(r => `<div class="dim">📌 ${esc(r.label)} · ${r.date}（两周内）</div>`).join('');
  return `<div class="banner due"><b>⏰ 守护提醒</b>${rows}</div>`;
}

function addRemind() {
  const d = $('#rm_date').value || todayStr();
  const label = ($('#rm_label').value || '').trim();
  if (!label) { toast('先写一下提醒事项哦'); return; }
  S.reminders.push({ id: 'r' + Date.now(), date: d, label });
  save(); renderTab(); toast('提醒已加入 ✅ 到期会在首页顶部提示');
}
function delRemind(id) { S.reminders = S.reminders.filter(x => x.id !== id); save(); renderTab(); }
function quickRemind(label) {
  S.reminders.push({ id: 'r' + Date.now(), date: todayStr(new Date(Date.now() + 7 * 86400000)), label });
  save(); toast('已加入提醒：' + label); renderTab();
}

async function enableNotif() {
  try {
    if (!('Notification' in window)) { toast('此浏览器不支持通知，App内横幅提醒仍有效'); return; }
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    if (p === 'granted') {
      S.notifOn = true; save();
      try { new Notification('小树苗成长记 ✅', { body: '到期通知已开启：复查/疫苗到点会提醒' }); } catch (e) {}
      toast('通知已开启 ✅');
    } else { toast('通知权限没开，App内横幅提醒仍有效'); }
    renderTab();
  } catch (e) { toast('开启失败，App内横幅提醒仍有效'); }
}
function checkAndNotify() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const t = todayStr();
    (S.reminders || []).forEach(r => {
      const key = t + '_' + r.id;
      if (r.date <= t && !S.notifLog[key]) {
        S.notifLog[key] = true; save();
        new Notification('小树苗成长记 · 守护提醒', { body: r.label + (r.date < t ? '（已于 ' + r.date + ' 到期）' : '（就是今天）') });
      }
    });
  } catch (e) {}
}

function vaxBlockHTML() {
  const m = ageInfo().months;
  return VACCINES.map((v, i) => {
    const done = S.vaxDone['v' + i];
    const due = m >= v.age && !done;
    return `<label class="task ${done ? 'done' : ''}">
      <input type="checkbox" ${done ? 'checked' : ''} onchange="S.vaxDone['v${i}']=this.checked;save()">
      <span class="t-body"><b>${esc(v.name)}</b><i>${v.age}月龄${due ? ' · 已到月龄，待确认' : ''}</i></span>
      ${due ? `<button class="btn small ocr" style="width:auto;flex-shrink:0;margin-bottom:0" onclick="event.preventDefault();quickRemind('带宝宝接种：${esc(v.name)}')">设为提醒</button>` : ''}
    </label>`;
  }).join('');
}

function addClinic() {
  const d = $('#cl_date').value || todayStr();
  const hosp = ($('#cl_hosp').value || '').trim();
  const topic = ($('#cl_topic').value || '').trim();
  const advice = ($('#cl_advice').value || '').trim();
  const next = $('#cl_next').value || '';
  if (!topic && !advice) { toast('至少写一下就诊原因或医嘱'); return; }
  S.clinic.unshift({ id: 'c' + Date.now(), date: d, hosp, topic, advice, next });
  if (next) S.reminders.push({ id: 'r' + Date.now(), date: next, label: '复查：' + (topic || '按医嘱') });
  save(); renderTab(); confetti(10);
}
function delClinic(id) { S.clinic = S.clinic.filter(x => x.id !== id); save(); renderTab(); }
function showClinic(i) {
  const c = S.clinic[i]; if (!c) return;
  openModal(`<h3>🏥 就诊记录 · ${esc(c.date)}</h3>
    ${c.hosp ? `<p><b>医院/科室：</b>${esc(c.hosp)}</p>` : ''}
    ${c.topic ? `<p><b>看了什么：</b>${esc(c.topic)}</p>` : ''}
    ${c.advice ? `<h4>医嘱要点</h4><p>${esc(c.advice)}</p>` : ''}
    ${c.next ? `<div class="callout">📌 下次复查：${esc(c.next)}</div>` : ''}`);
}

function weeklyReport() {
  const days = 14;
  const arr = [];
  for (let i = 0; i < days; i++) {
    const d = todayStr(new Date(Date.now() - i * 86400000));
    const r = S.records[d];
    arr.push({ d, rec: r, score: r ? scoreOf(r) : null });
  }
  const recorded = arr.filter(x => x.rec);
  const avg = recorded.length ? Math.round(recorded.reduce((s, x) => s + x.score, 0) / recorded.length) : 0;
  const gs = {};
  tasksDef().forEach(t => { gs[t.group] = gs[t.group] || { got: 0, max: 0 }; });
  recorded.forEach(x => tasksDef().forEach(t => { gs[t.group].max += t.pts; if (x.rec.checks[t.id]) gs[t.group].got += t.pts; }));
  const rows = Object.keys(gs).map(k => ({ k, p: gs[k].max ? Math.round(gs[k].got / gs[k].max * 100) : 0 })).sort((a, b) => a.p - b.p);
  let wTxt = '至少录入两次体重才能算生长速度（曲线页/体检页均可录）';
  const ms = S.measures.filter(m => m.w);
  if (ms.length >= 2) {
    const p1 = ms[ms.length - 2], p2 = ms[ms.length - 1];
    const dm = ageInfo(p2.date).months - ageInfo(p1.date).months;
    if (dm >= 1) {
      const gm = (p2.w - p1.w) / dm;
      wTxt = '从 ' + p1.date + ' 到 ' + p2.date + '：约每月 ' + gm.toFixed(2) + ' kg（1岁后正常约0.15~0.25）' + (gm < 0.08 ? ' ⚠️ 偏慢，建议营养师评估' : '');
    }
  }
  const weak = tasksDef().filter(t => recorded.length && (recorded.filter(x => x.rec.checks[t.id]).length / recorded.length) < 0.5).slice(0, 3);
  openModal(`<h3>📈 近两周成长报告</h3>
    <div class="verdict"><b>记录 ${recorded.length}/14 天 · 平均 ${avg} 分</b>
    <p>${recorded.length === 0 ? '还没有打卡记录，从今天开始吧！' : avg >= 85 ? '整体很棒，节奏保持得住 👏' : avg >= 70 ? '稳步前进，挑最弱的一两项补齐' : '打卡率偏低——不求全满，先保住「MCT+户外+睡眠」三个硬指标'}</p></div>
    <div class="plan-sec"><b>各维度完成率（低的在前）</b>
    ${rows.map(r => `<div style="margin:8px 0"><b style="font-size:13px">${groupIcon(r.k)} ${esc(r.k)} · ${r.p}%</b><div class="prog"><i style="width:${r.p}%"></i></div></div>`).join('')}
    </div>
    <div class="plan-sec"><b>📈 生长速度</b><p class="small">${wTxt}</p></div>
    <div class="plan-sec"><b>🎯 下两周重点抓这些</b>
    ${weak.length ? weak.map(t => `<div class="slim-line">${t.icon} ${esc(t.name)}</div>`).join('') : '<p class="dim">没有明显薄弱项，保持！</p>'}
    </div>
    <button class="btn small ghost" style="width:100%" onclick="buildAIPack()">📤 生成AI解读包（发给大金子出方案）</button>`);
}

function bandTxt(b) { return ['P3以下⚠', 'P3~P15', 'P15~P50', 'P50~P85', 'P85~P97', 'P97以上'][b] || ''; }
function buildAIPack() {
  try {
    const a = ageInfo();
    const last = lastMeasure();
    const rep = S.reports.slice().sort((x, y) => x.date < y.date ? 1 : -1)[0];
    const arr = [];
    for (let i = 0; i < 14; i++) { const d = todayStr(new Date(Date.now() - i * 86400000)); const r = S.records[d]; if (r) arr.push(scoreOf(r)); }
    const avg = arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0;
    let s = '【小树苗 · AI解读包】\n';
    s += '生成时间：' + todayStr() + ' ｜ 宝宝' + a.label + '\n';
    s += '宝宝：' + S.baby.name + '，' + (S.baby.gender === 'boys' ? '男宝' : S.baby.gender === 'girls' ? '女宝' : '性别未填') + '，出生' + S.baby.birth + '\n';
    s += '诊断：希特林蛋白缺乏症（CD / SLC25A13）\n';
    if (last) {
      s += '最新生长（' + last.date + '）：' + (last.h != null ? '身高' + last.h + 'cm，' : '') + (last.w != null ? '体重' + last.w + 'kg' : '') + '\n';
      if (last.w != null) s += '体重位置：' + bandTxt(bandOf('wt', last.m, last.w)) + '；身长位置：' + (last.h != null ? bandTxt(bandOf('len', last.m, last.h)) : '未测') + '\n';
    }
    if (rep) {
      const labs = Object.keys(rep.labs).map(k => { const L = LABS.find(x => x.k === k); return L.name.split(' ')[0] + ' ' + rep.labs[k] + L.unit; }).join('；');
      if (labs) s += '最近化验（' + rep.date + '）：' + labs + '\n';
    }
    s += '近14天打卡：记录' + arr.length + '天，平均' + avg + '分\n';
    const due = (S.reminders || []).filter(r => r.date <= todayStr()).map(r => r.label).join('、');
    if (due) s += '待办提醒：' + due + '\n';
    s += '\n请从以下三方面给我建议：1）CD饮食微调；2）复查项目与节奏；3）这个月龄的发育引导重点。';
    const done = ok => { if (ok) toast('解读包已复制 ✅ 去微信粘贴发给大金子'); else toast('已生成，长按选择复制后发给大金子'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(() => done(true), () => { copyFallback(s); done(true); });
    else { copyFallback(s); done(true); }
    openModal(`<h3>📤 AI解读包已生成</h3><p>已复制到剪贴板（若没有，长按下方文字复制）：</p><div class="callout" style="white-space:pre-wrap;font-size:12px">${esc(s)}</div><p class="dim small">把它粘贴发给大金子（电脑上的AI助手），就能收到针对最新数据的个体化建议。</p>`, true);
  } catch (e) { toast('生成失败：' + e.message); }
}
function copyFallback(text) {
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}

function makeCDCardImage() {
  try {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#fff7ef'); grd.addColorStop(1, '#fbe3cd');
    x.fillStyle = grd; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ff8a3d'; x.fillRect(0, 0, W, 150);
    x.fillStyle = '#fff'; x.font = 'bold 62px Microsoft YaHei'; x.fillText('CD 应急健康卡', 60, 100);
    x.fillStyle = '#3d3229';
    x.font = 'bold 54px Microsoft YaHei'; x.fillText(S.baby.name || '宝宝', 60, 260);
    x.font = '38px Microsoft YaHei'; x.fillStyle = '#6d5c48';
    x.fillText('出生 ' + S.baby.birth + ' ｜ 希特林蛋白缺乏症（CD / SLC25A13）', 60, 330);
    x.fillStyle = '#e07b00'; x.font = 'bold 42px Microsoft YaHei'; x.fillText('【饮食金律】', 60, 430);
    x.fillStyle = '#3d3229'; x.font = '36px Microsoft YaHei';
    ['① 低碳水：主食限量，先吃肉蛋菜，最后吃主食', '② 高蛋白：每餐都有鱼 / 肉 / 蛋 / 豆腐', '③ 高脂肪：MCT油按医嘱拌入（切勿高温烹调）', '④ 严禁高糖：果汁 / 糖果 / 甜饮料 / 蛋糕', '⑤ 脂溶性维生素 A/D/E/K 遵医嘱补充'].forEach((t, i) => x.fillText(t, 60, 500 + i * 74));
    x.fillStyle = '#e63946'; x.fillRect(60, 920, W - 120, 300);
    x.fillStyle = '#fff'; x.font = 'bold 44px Microsoft YaHei'; x.fillText('🚨 立即急诊（警惕高氨血症）', 100, 990);
    x.font = '38px Microsoft YaHei';
    x.fillText('呕吐不止 / 异常嗜睡叫不醒 / 烦躁尖叫', 100, 1060);
    x.fillText('长时间拒食后精神差 —— 别等，直接急诊', 100, 1130);
    x.fillStyle = '#b02a37'; x.font = 'bold 42px Microsoft YaHei'; x.fillText('【尽快复诊】', 60, 1320);
    x.fillStyle = '#3d3229'; x.font = '36px Microsoft YaHei';
    x.fillText('黄疸加深 / 腹胀肝大 / 牙龈出血瘀斑', 60, 1390);
    x.fillStyle = '#6d5c48'; x.font = '34px Microsoft YaHei';
    x.fillText('【告知医生】CD患儿勿长时间空腹；输液需含能量', 60, 1500);
    x.fillText('成年后终生禁酒；严禁极端节食减肥', 60, 1560);
    x.fillText('主治医生：____________  电话：____________', 60, 1700);
    x.fillStyle = '#9b8a76'; x.font = '30px Microsoft YaHei';
    x.fillText('完整信息见「小树苗成长记」App · 建议设为锁屏或发给长辈', 60, 1830);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'CD应急卡_' + (S.baby.name || '宝宝') + '.png';
    a.click();
    toast('图片已生成，去相册/下载里找到它');
  } catch (e) { toast('生成失败：' + e.message); }
}

/* ---------------- 设置页 ---------------- */
function openSettings() {
  const tasks = tasksDef();
  openModal(`<h3>⚙️ 设置</h3>
    <h4>宝宝资料</h4>
    <div class="f-row"><label>小名</label><input id="sName" value="${esc(S.baby.name)}"></div>
    <div class="f-row"><label>出生日期</label><input type="date" id="sBirth" value="${esc(S.baby.birth)}"></div>
    <div class="f-row"><label>性别（曲线用）</label>
      <div class="chips">
        <button class="${S.baby.gender === 'boys' ? 'on' : ''}" onclick="setGender('boys')">👦 男宝</button>
        <button class="${S.baby.gender === 'girls' ? 'on' : ''}" onclick="setGender('girls')">👧 女宝</button>
      </div></div>
    <h4>每日任务与权重（合计${tasks.reduce((s, t) => s + t.pts, 0)}分）</h4>
    <div class="task-editor">
      ${tasks.map((t, i) => `<div class="te-row"><span>${t.icon} ${esc(t.name)}</span>
        <input type="number" value="${t.pts}" min="0" max="50" onchange="setPts(${i},this.value)">
        <button onclick="delTask(${i})">✕</button></div>`).join('')}
    </div>
    <div class="f-row"><input id="nTask" placeholder="新任务名称（如：晚饭不追喂）" style="flex:1"><button class="btn small" onclick="addTask()">＋添加</button></div>
    <h4>👨‍👩‍👧 家庭同步（爸妈共同使用）</h4>
    <div class="f-row"><label>本机昵称（会出现在备份文件名里）</label><input id="sDevice" value="${esc(S.deviceName || '')}" placeholder="如：爸爸 / 妈妈"></div>
    <p class="dim small" style="margin-bottom:8px">两人各自手机打卡 → 打卡完「导出备份」发给对方（微信即可）→ 对方「合并导入」——两边数据自动并集：勾过就算完成，谁先谁后都不丢。建议每晚互发一次。两人填写的「备注/新词」不一致时保留本机版本；宝宝生日等资料以本机为准；报告图片仍存各自手机。${S.lastSync ? `<br>上次合并：${esc(S.lastSync.at)} · 来自「${esc(S.lastSync.from)}」` : ''}</p>
    <div class="chips">
      <button onclick="exportData()">📤 导出备份</button>
      <button onclick="startImport('merge')">🔗 合并导入（推荐）</button>
      <button onclick="startImport('overwrite')">📥 覆盖导入</button>
      <button onclick="if(confirm('确定清空所有打卡记录吗？此操作不可恢复。')){S=window.__fresh();save();location.reload()}">🗑️ 清空记录</button>
    </div>
    <input type="file" id="impFile" accept=".json" style="display:none" onchange="importData(this)">
    <p class="dim small">${esc(APP_META.disclaimer)}</p>
    <button class="btn main" onclick="saveSettings()">保存</button>`);
  window.__fresh = defaultState;
}
function setGender(g) { S.baby.gender = g; save(); openSettings(); }
function setPts(i, v) { tasksDef()[i].pts = Math.max(0, parseInt(v) || 0); S.customTasks = tasksDef(); save(); }
function delTask(i) { if (!confirm('删除这个任务？历史记录会保留但不再计分。')) return; const t = tasksDef().slice(); t.splice(i, 1); S.customTasks = t; save(); openSettings(); }
function addTask() {
  const name = $('#nTask').value.trim(); if (!name) return;
  const t = tasksDef().slice(); t.push({ id: 'c' + Date.now(), name, icon: '⭐', group: '健康', pts: 5 });
  S.customTasks = t; save(); openSettings();
}
function saveSettings() {
  const n = $('#sName'); if (n) S.baby.name = n.value.trim() || '宝宝';
  const b = $('#sBirth'); if (b && b.value) S.baby.birth = b.value;
  const dv = $('#sDevice'); if (dv) S.deviceName = dv.value.trim();
  S.customTasks = tasksDef();
  save(); closeModal(); renderTab();
}
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '宝宝成长档案_' + (S.deviceName ? S.deviceName + '_' : '') + todayStr() + '.json';
  a.click();
}
/* 家庭同步：合并式导入（爸妈各自打卡，互发备份，导入时自动并集） */
let importMode = 'merge';
function startImport(mode) { importMode = mode; $('#impFile').click(); }
function importData(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.baby) throw new Error('bad');
      if (importMode === 'merge') {
        const st = mergeData(d);
        save(); closeModal(); renderTab();
        alert(`合并完成 ✅\n新增打卡日期 ${st.newDates} 天，并入勾选 ${st.checksMerged} 项；\n并入测量 ${st.measuresMerged} 条、标记/报告 ${st.flagsMerged} 条。\n${st.conflicts ? '另有 ' + st.conflicts + ' 处两人填写不一致，已保留本机版本。' : '无冲突。'}`);
      } else {
        const myDevice = S.deviceName;
        S = Object.assign(defaultState(), d);
        S.deviceName = myDevice || S.deviceName || '';
        if (!S.reports) S.reports = [];
        if (!S.policyDone) S.policyDone = {};
        save(); closeModal(); renderTab(); alert('覆盖导入成功 ✅');
      }
    } catch (e) { alert('文件格式不对哦'); }
  };
  r.readAsText(f);
}
function mergeData(d) {
  const st = { newDates: 0, checksMerged: 0, measuresMerged: 0, flagsMerged: 0, conflicts: 0 };
  // 宝宝资料：只补空不覆盖；关键字段两人不一致计入冲突（以本机为准）
  ['name', 'gender', 'birth', 'condition'].forEach(k => {
    if (!S.baby[k] && d.baby[k]) S.baby[k] = d.baby[k];
    else if (S.baby[k] && d.baby[k] && String(S.baby[k]) !== String(d.baby[k])) st.conflicts++;
  });
  // 每日打卡：按日期并集，任一方勾过就算完成
  Object.keys(d.records || {}).forEach(k => {
    const b = d.records[k];
    let a = S.records[k];
    if (!a) {
      S.records[k] = { checks: Object.assign({}, b.checks), focus: b.focus || 0, mood: b.mood || '', newx: b.newx || '', note: b.note || '' };
      S.records[k].score = scoreOf(S.records[k]); st.newDates++; return;
    }
    const before = Object.keys(a.checks || {}).length;
    Object.keys(b.checks || {}).forEach(id => { a.checks[id] = true; });
    st.checksMerged += Math.max(0, Object.keys(a.checks).length - before);
    ['focus', 'mood', 'newx', 'note'].forEach(f => {
      if (!a[f] && b[f]) a[f] = b[f];
      else if (a[f] && b[f] && String(a[f]) !== String(b[f])) st.conflicts++;
    });
    a.score = scoreOf(a);
  });
  // 测量记录：同日期互补缺失值
  (d.measures || []).forEach(m => {
    const ex = S.measures.find(x => x.date === m.date);
    if (!ex) { S.measures.push(m); st.measuresMerged++; return; }
    ['h', 'w'].forEach(k => { if (!ex[k] && m[k]) { ex[k] = m[k]; st.measuresMerged++; } });
  });
  S.measures.sort((a, b) => a.date < b.date ? -1 : 1);
  // 体检报告：按 id 并集（图片仍在本机IndexedDB）
  (d.reports || []).forEach(rep => {
    if (!rep || !rep.id) return;
    if (!S.reports.find(x => x.id === rep.id)) { S.reports.push(rep); st.flagsMerged++; }
  });
  // 各类布尔标记：并集（勾过就算）
  ['msDone', 'followupDone'].forEach(k => {
    Object.keys(d[k] || {}).forEach(key => { if (d[k][key] && !S[k][key]) { S[k][key] = true; st.flagsMerged++; } });
  });
  // 政策状态：值是字符串（todo/doing/done），按值补齐本机没有的项，不覆盖本机进度
  Object.keys(d.policyDone || {}).forEach(key => {
    if (!S.policyDone[key] && d.policyDone[key]) { S.policyDone[key] = d.policyDone[key]; st.flagsMerged++; }
  });
  // 自定义任务：本机未自定义时采纳对方的
  if (!S.customTasks && d.customTasks) S.customTasks = d.customTasks;
  S.lastSync = { at: new Date().toLocaleString('zh-CN'), from: (d.deviceName || '家人设备'), mode: 'merge' };
  return st;
}

/* ---------------- 弹窗 / 动效 ---------------- */
function openModal(html, wide) {
  $('#modalRoot').innerHTML = `<div class="mask" onclick="if(event.target===this)closeModal()"><div class="modal ${wide ? 'wide' : ''}">${html}<button class="close" onclick="closeModal()">✕</button></div></div>`;
  document.body.style.overflow = 'hidden';
  $('.mask').scrollTop = 0;
}
function closeModal() { $('#modalRoot').innerHTML = ''; document.body.style.overflow = ''; }
function confetti(n) {
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['#ff8a3d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585'];
  for (let i = 0; i < (n || 26); i++) {
    const s = document.createElement('i');
    s.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * .4}s;transform:rotate(${Math.random() * 360}deg)`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}
function toast(msg) {
  const t = document.createElement('div'); t.id = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------------- 启动 ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderTabbar();
  renderTab();
  checkAndNotify();
});
