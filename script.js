const OPEN_URL = 'https://api.github.com/search/issues?q=org:lnflash+label:%22%F0%9F%92%B0+bounty%22+state:open&per_page=100';
const PAID_URL = 'https://api.github.com/search/issues?q=org:lnflash+label:%22paid%22+label:%22%F0%9F%92%B0+bounty%22+state:closed&per_page=100';
const LEVELS = ['spark', 'flame', 'eruption', 'summit'];
const META = {
  spark: { icon: '⚡', label: 'Spark', cls: 'badge-level-spark' },
  flame: { icon: '🔥', label: 'Flame', cls: 'badge-level-flame' },
  eruption: { icon: '🌋', label: 'Eruption', cls: 'badge-level-eruption' },
  summit: { icon: '🏔️', label: 'Summit', cls: 'badge-level-summit' }
};
const STATUS_CLS = { Open: 'badge-open', Claimed: 'badge-claimed', 'In Progress': 'badge-in-progress', 'Under Review': 'badge-review', Paid: 'badge-paid' };
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const container = document.getElementById('bounties-container');

function fmt(n) { return new Intl.NumberFormat().format(n || 0); }
function getLabels(issue) { return (issue.labels || []).map(l => (l.name || '').toLowerCase()); }
function repo(issue) { const p = (issue.repository_url || '').split('/'); return p.slice(-2).join('/'); }

function level(issue) {
  const l = getLabels(issue);
  if (l.some(x => x.includes('summit'))) return 'summit';
  if (l.some(x => x.includes('eruption'))) return 'eruption';
  if (l.some(x => x.includes('flame'))) return 'flame';
  return 'spark';
}

function status(issue) {
  const l = getLabels(issue);
  if (l.includes('paid')) return 'Paid';
  if (l.includes('review')) return 'Under Review';
  if (l.includes('in-progress')) return 'In Progress';
  if (l.includes('claimed')) return 'Claimed';
  if (l.includes('approved')) return 'Open';
  return issue.state === 'closed' ? 'Paid' : 'Open';
}

function satsFromText(t) {
  if (!t) return 0;
  const pats = [/💰\s*([\d,]+)\s*sats?/gi, /([\d,]{3,})\s*sats?/gi];
  for (const p of pats) {
    let m;
    while ((m = p.exec(t))) {
      const n = parseInt((m[1] || '').replace(/[^\d]/g, ''), 10);
      if (n > 0) return n;
    }
  }
  return 0;
}

async function fetchComments(issue) {
  try {
    const r = await fetch(issue.comments_url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function sats(issue) {
  let n = satsFromText(issue.body) || satsFromText(issue.title);
  if (n) return n;
  if (issue.comments > 0) {
    const cs = await fetchComments(issue);
    for (const c of cs) {
      n = satsFromText(c.body);
      if (n) return n;
    }
  }
  for (const l of (issue.labels || [])) {
    n = satsFromText(l.name);
    if (n) return n;
  }
  return 0;
}

function categories(issue) {
  const ignore = ['approved', 'claimed', 'in-progress', 'review', 'paid'];
  return (issue.labels || []).map(l => l.name).filter(Boolean).filter(name => {
    const n = name.toLowerCase();
    if (n.includes('bounty')) return false;
    if (n.includes('spark') || n.includes('flame') || n.includes('eruption') || n.includes('summit')) return false;
    if (ignore.includes(n)) return false;
    return true;
  });
}

// Bundle definitions: map child issue keys to parent issue key
// Key format: "owner/repo#number"
const BUNDLES = {
  // JMD Currency Precision — 300,000 sats
  'lnflash/flash#284': { parent: 'lnflash/flash#282', title: 'JMD Currency Precision Fix (Bundle)', sats: 300000 },
  'lnflash/flash#267': { parent: 'lnflash/flash#282', title: 'JMD Currency Precision Fix (Bundle)', sats: 300000 },
  'lnflash/flash#282': { parent: 'lnflash/flash#282', title: 'JMD Currency Precision Fix (Bundle)', sats: 300000 },

  // IBEX Decoupling — 500,000 sats
  'lnflash/flash#302':          { parent: 'lnflash/flash#302', title: 'IBEX Decoupling + Build Reproducibility (Bundle)', sats: 500000 },
  'lnflash/flash-mobile#591':   { parent: 'lnflash/flash#302', title: 'IBEX Decoupling + Build Reproducibility (Bundle)', sats: 500000 },
  'lnflash/flash-mobile#572':   { parent: 'lnflash/flash#302', title: 'IBEX Decoupling + Build Reproducibility (Bundle)', sats: 500000 },

  // Favorites + Top 3 Merchants — 150,000 sats
  'lnflash/flash#201': { parent: 'lnflash/flash#201', title: 'Flash Favorites + Top 3 Merchants (Bundle)', sats: 150000 },
  'lnflash/flash#200': { parent: 'lnflash/flash#201', title: 'Flash Favorites + Top 3 Merchants (Bundle)', sats: 150000 },

  // Email-Only Registration — 150,000 sats
  'lnflash/flash#260':          { parent: 'lnflash/flash#260', title: 'Email-Only Registration (Bundle)', sats: 150000 },
  'lnflash/flash-mobile#540':   { parent: 'lnflash/flash#260', title: 'Email-Only Registration (Bundle)', sats: 150000 },
};

function issueKey(issue) {
  return repo(issue) + '#' + issue.number;
}

async function fetchIssues(url) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub API ' + r.status);
  const d = await r.json();
  return d.items || [];
}

function stats(items) {
  document.getElementById('stat-total').textContent = String(items.length);
  document.getElementById('stat-sats').textContent = fmt(items.reduce((a, b) => a + (b.sats || 0), 0));
  document.getElementById('stat-open').textContent = String(items.filter(x => x.status !== 'Paid').length);
  document.getElementById('stat-done').textContent = String(items.filter(x => x.status === 'Paid').length);
}

function render(items) {
  container.innerHTML = '';
  const groups = { spark: [], flame: [], eruption: [], summit: [] };
  items.forEach(i => groups[i.level].push(i));

  LEVELS.forEach(lv => {
    const list = groups[lv];
    if (!list.length) return;

    const sec = document.createElement('section');
    sec.className = 'level-section';

    const h = document.createElement('div');
    h.className = 'level-header';
    const h2 = document.createElement('h2');
    h2.className = 'level-title';
    h2.textContent = META[lv].icon + ' ' + META[lv].label;
    const c = document.createElement('span');
    c.className = 'level-count';
    c.textContent = String(list.length);
    h.appendChild(h2);
    h.appendChild(c);

    const grid = document.createElement('div');
    grid.className = 'bounties-grid';

    list.sort((a, b) => (b.sats || 0) - (a.sats || 0)).forEach(b => {
      const card = document.createElement('article');
      card.className = 'card' + (b.status === 'Paid' ? ' paid' : '') + (b.isBundle ? ' bundle' : '');
      card.dataset.level = b.level;

      const top = document.createElement('div');
      top.className = 'card-top';
      const t = document.createElement('h3');
      t.className = 'card-title';
      const a = document.createElement('a');
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = b.title;
      t.appendChild(a);
      top.appendChild(t);

      // Bundle badge
      if (b.isBundle && b.linkedIssues && b.linkedIssues.length > 0) {
        const bundleInfo = document.createElement('div');
        bundleInfo.className = 'bundle-info';
        bundleInfo.innerHTML = '📦 Bundle: ' + b.linkedIssues.map(li =>
          '<a href="' + li.url + '" target="_blank" rel="noopener">' + li.key + '</a>'
        ).join(' + ');
        top.appendChild(bundleInfo);
      }

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const lb = document.createElement('span');
      lb.className = 'badge ' + META[b.level].cls;
      lb.textContent = META[b.level].icon + ' ' + META[b.level].label;
      const sb = document.createElement('span');
      sb.className = 'badge ' + (STATUS_CLS[b.status] || 'badge-open');
      sb.textContent = b.status;
      meta.appendChild(lb);
      meta.appendChild(sb);
      b.categories.forEach(cat => {
        const cb = document.createElement('span');
        cb.className = 'badge badge-cat';
        cb.textContent = cat;
        meta.appendChild(cb);
      });

      const foot = document.createElement('div');
      foot.className = 'card-footer';
      const rn = document.createElement('span');
      rn.className = 'repo-name';
      rn.textContent = b.isBundle ? 'Multiple repos' : b.repo;
      const sa = document.createElement('span');
      sa.className = 'sats-amount';
      sa.textContent = fmt(b.sats) + ' sats';
      const co = document.createElement('span');
      co.className = 'comments';
      co.textContent = '💬 ' + String(b.comments || 0);
      foot.appendChild(rn);
      foot.appendChild(sa);
      foot.appendChild(co);

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(foot);
      grid.appendChild(card);
    });

    sec.appendChild(h);
    sec.appendChild(grid);
    container.appendChild(sec);
  });
}

async function init() {
  try {
    const [open, paid] = await Promise.all([fetchIssues(OPEN_URL), fetchIssues(PAID_URL)]);
    const seen = new Set();
    const all = open.concat(paid).filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });

    // Process bundles: group child issues under parent
    const bundleParents = new Map(); // parentKey -> { issues: [], ... }
    const standaloneIssues = [];

    for (const issue of all) {
      const key = issueKey(issue);
      const bundle = BUNDLES[key];

      if (bundle) {
        const parentKey = bundle.parent;
        if (!bundleParents.has(parentKey)) {
          bundleParents.set(parentKey, {
            title: bundle.title,
            sats: bundle.sats,
            issues: [],
            parentIssue: null
          });
        }
        const bp = bundleParents.get(parentKey);
        bp.issues.push({ issue, key });
        if (key === parentKey) bp.parentIssue = issue;
      } else {
        standaloneIssues.push(issue);
      }
    }

    const out = [];

    // Process bundles into single cards
    for (const [parentKey, bp] of bundleParents) {
      const primary = bp.parentIssue || bp.issues[0].issue;
      const totalComments = bp.issues.reduce((sum, i) => sum + (i.issue.comments || 0), 0);

      // Merge categories from all issues in bundle
      const allCats = new Set();
      bp.issues.forEach(i => categories(i.issue).forEach(c => allCats.add(c)));

      // Worst status wins (most progressed)
      const statuses = bp.issues.map(i => status(i.issue));
      let bundleStatus = 'Open';
      if (statuses.includes('Paid')) bundleStatus = 'Paid';
      else if (statuses.includes('Under Review')) bundleStatus = 'Under Review';
      else if (statuses.includes('In Progress')) bundleStatus = 'In Progress';
      else if (statuses.includes('Claimed')) bundleStatus = 'Claimed';

      out.push({
        id: primary.id,
        title: bp.title,
        url: primary.html_url,
        repo: 'multiple',
        comments: totalComments,
        level: level(primary),
        status: bundleStatus,
        sats: bp.sats,
        categories: Array.from(allCats),
        isBundle: true,
        linkedIssues: bp.issues.map(i => ({ key: i.key, url: i.issue.html_url }))
      });
    }

    // Process standalone issues
    for (const issue of standaloneIssues) {
      out.push({
        id: issue.id,
        title: issue.title,
        url: issue.html_url,
        repo: repo(issue),
        comments: issue.comments || 0,
        level: level(issue),
        status: status(issue),
        sats: await sats(issue),
        categories: categories(issue),
        isBundle: false
      });
    }

    stats(out);
    render(out);
  } catch (e) {
    errorEl.textContent = 'Failed to load bounties: ' + e.message;
    errorEl.classList.remove('hidden');
  } finally {
    loadingEl.classList.add('hidden');
  }
}

init();
