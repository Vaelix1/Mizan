/**
 * Mizan tarayıcı testi: uygulamayı gerçek bir tarayıcıda (Chrome, Chromium ya da Edge; görünmez modda)
 * uçtan uca dener. Mobil ekran, koyu tema, yavaş işlemci, dosyadan açma ve çevrimdışı çalışma da denenir.
 *
 * Kullanım:
 *   node tools/tarayici_testi.mjs                  bütün testler
 *   node tools/tarayici_testi.mjs --ekran docs/ekran  testlerden sonra README ekran görüntülerini yazar
 *   node tools/tarayici_testi.mjs --yalniz akıcılık   yalnızca adında bu metin geçen testler
 *   node tools/tarayici_testi.mjs --tarayici "C:/Program Files/Google/Chrome/Application/chrome.exe"
 *
 * Gerekenler: Node 22 ya da üstü (yerleşik WebSocket) ve Chrome, Chromium ya da Edge. Başka paket gerekmez.
 * Çıkış kodu: 0 bütün testler geçti, 1 en az bir test başarısız.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 1 ? process.argv[i + 1] : null; };
const EKRAN_DIZINI = arg('--ekran');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dogrula = (kosul, mesaj) => { if (!kosul) throw new Error(mesaj); };

/* ---------- 1. YEREL SUNUCU ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function sunucuAc(port = 0) {
  return new Promise((ok, hata) => {
    const soketler = new Set();
    const s = createServer(async (req, res) => {
      let yol = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (yol.endsWith('/')) yol += 'index.html';
      const dosya = resolve(join(KOK, yol));
      if (!dosya.startsWith(KOK)) { res.writeHead(403).end(); return; }
      try {
        const icerik = await readFile(dosya);
        res.writeHead(200, { 'Content-Type': MIME[extname(dosya)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(icerik);
      } catch { res.writeHead(404).end('Bulunamadı'); }
    });
    s.on('connection', (k) => { soketler.add(k); k.on('close', () => soketler.delete(k)); });
    s.on('error', hata);
    s.listen(port, '127.0.0.1', () => ok({ port: s.address().port, kapat: () => new Promise((r) => { soketler.forEach((k) => k.destroy()); s.close(() => r()); }) }));
  });
}

/* ---------- 2. TARAYICI VE DEVTOOLS PROTOKOLÜ ---------- */
function tarayiciYolu() {
  const adaylar = [arg('--tarayici'), process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  const yol = adaylar.find((p) => p && existsSync(p));
  if (!yol) throw new Error('Chrome, Chromium ya da Edge bulunamadı. Yolu --tarayici ile ya da CHROME_PATH ortam değişkeniyle ver.');
  return yol;
}
class Oturum {
  constructor(ws) {
    this.ws = ws; this.no = 0; this.bekleyen = new Map(); this.dinleyiciler = new Set();
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.id) { const b = this.bekleyen.get(d.id); if (b) { this.bekleyen.delete(d.id); if (d.error) b.hata(new Error(d.error.message)); else b.ok(d.result); } }
      else if (d.method) this.dinleyiciler.forEach((f) => f(d.method, d.params));
    });
  }
  static async ac(url) {
    const ws = new WebSocket(url);
    await new Promise((ok, hata) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', () => hata(new Error('DevTools bağlantısı kurulamadı.')), { once: true }); });
    return new Oturum(ws);
  }
  gonder(method, params = {}) {
    const id = ++this.no;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, hata) => {
      this.bekleyen.set(id, { ok, hata });
      setTimeout(() => { if (this.bekleyen.has(id)) { this.bekleyen.delete(id); hata(new Error(method + ' yanıt vermedi.')); } }, 45000);
    });
  }
  bekle(method, sure = 20000) {
    return new Promise((ok, hata) => {
      const f = (m, p) => { if (m === method) { this.dinleyiciler.delete(f); clearTimeout(z); ok(p); } };
      const z = setTimeout(() => { this.dinleyiciler.delete(f); hata(new Error(method + ' olayı gelmedi.')); }, sure);
      this.dinleyiciler.add(f);
    });
  }
}
async function tarayiciBaslat() {
  const profil = await mkdtemp(join(tmpdir(), 'mizan-test-'));
  const proc = spawn(tarayiciYolu(), ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync', '--no-sandbox', '--mute-audio', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const dosya = join(profil, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(dosya); i++) await sleep(100);
  dogrula(existsSync(dosya), 'Tarayıcı başlatılamadı.');
  let port = '';
  for (let i = 0; i < 50 && !port; i++) { port = (await readFile(dosya, 'utf8')).split(/\r?\n/)[0].trim(); if (!port) await sleep(100); }
  const liste = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const sayfa = liste.find((x) => x.type === 'page');
  const s = await Oturum.ac(sayfa.webSocketDebuggerUrl);
  return { proc, profil, s };
}

/* ---------- 3. SAYFA YARDIMCILARI ---------- */
// Sayfanın içinde çalışır; window.__t olarak kurulur.
function yardimci() {
  const t = {
    $: (s) => document.querySelector(s),
    $$: (s) => [...document.querySelectorAll(s)],
    bekle: (ms) => new Promise((r) => setTimeout(r, ms)),
    async git(h) { location.hash = h; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30))); },
    gorunen() { return [...document.querySelectorAll('main .page')].filter((p) => !p.hidden); },
    ayarla(el, v) { el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
    satirlar(key) { return [...document.querySelectorAll('[data-entry="' + key + '"] .erow')]; },
    doldur(key, sol) {
      while (t.satirlar(key).length < sol.length) document.querySelector('[data-add="' + key + '"]').click();
      while (t.satirlar(key).length > Math.max(2, sol.length)) { const s = t.satirlar(key); s[s.length - 1].querySelector('.e-del').click(); }
      sol.forEach((l, k) => {
        t.ayarla(t.satirlar(key)[k].querySelector('.e-acc'), l[0]);
        t.satirlar(key)[k].querySelector('[data-side="' + l[1] + '"]').click();
        t.ayarla(t.satirlar(key)[k].querySelector('.e-amt'), String(l[2]));
      });
    },
    cozum(key) {
      return [...document.querySelectorAll('[data-fb="' + key + '"] table.jr tr')].filter((tr) => !tr.classList.contains('x')).map((tr) => {
        const td = tr.querySelectorAll('td'), s = tr.classList.contains('b') ? 'B' : 'A';
        return [td[0].textContent.slice(0, 3), s, Number((s === 'B' ? td[1] : td[2]).textContent.replace(/\./g, '').replace(',', '.'))];
      });
    },
    mesaj(key) { const el = document.querySelector('[data-fb="' + key + '"]'); return el ? el.innerText.trim() : ''; }
  };
  window.__t = t;
  return true;
}
async function js(s, fn, arg) {
  const expr = typeof fn === 'function' ? '(' + fn.toString() + ')(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')' : fn;
  const r = await s.gonder('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('Sayfada hata: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
let TABAN = '';
async function ac(s, hash = 'ozet') {
  // Aynı belgede yalnızca # değişirse tarayıcı yeniden yüklemez; o durumda sayfa yenilenir.
  const simdi = await js(s, 'location.href');
  if (simdi.split('#')[0] === TABAN) { await yenile(s, hash); return; }
  const yuklendi = s.bekle('Page.loadEventFired');
  await s.gonder('Page.navigate', { url: TABAN + '#' + hash });
  await yuklendi; await sleep(120); await js(s, yardimci);
}
async function yenile(s, hash, onbellek = false) {
  // Uygulama henüz açık değilse (--yalniz ile tek test çalışırken) önce açılır.
  if ((await js(s, 'location.href')).split('#')[0] !== TABAN) { await ac(s, hash == null ? 'ozet' : hash); return; }
  if (hash != null) await js(s, (h) => history.replaceState(null, '', '#' + h), hash);
  const yuklendi = s.bekle('Page.loadEventFired');
  await s.gonder('Page.reload', { ignoreCache: !onbellek });
  await yuklendi; await sleep(120); await js(s, yardimci);
}
async function temizle(s) {
  await s.gonder('Storage.clearDataForOrigin', { origin: new URL(TABAN).origin, storageTypes: 'local_storage,session_storage' });
}
async function ekranBoyu(s, w, h, mobil) {
  await s.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobil ? 2 : 1, mobile: mobil });
  await s.gonder('Emulation.setTouchEmulationEnabled', { enabled: mobil, maxTouchPoints: mobil ? 5 : 1 });
}
async function renkSemasi(s, deger) { await s.gonder('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: deger }] }); }

/* ---------- 4. TESTLER ---------- */
const testler = [];
const test = (ad, fn) => testler.push({ ad, fn });
let S = null;
const HATALAR = [];
const hatalariAl = () => HATALAR.splice(0);
const SAYFALAR = ['ozet', 'notlar', 'alistirma', 'tekrar', 'hesaplar', 'sozluk', 'araclar', 'takvim', 'dersler', 'diger', 'nasil', 'hakkinda'];
const KONULAR = ['temel', 'belge', 'bilanco', 'hazir', 'menkul', 'alacak', 'stok', 'gag', 'duran1', 'duran2', 'mali', 'ticari', 'diger', 'oz', 'gelirgider'];

test('Açılış: konsolda hata yok, ilk açılışta tanıtım görünüyor', async () => {
  await temizle(S); await ac(S, 'ozet'); hatalariAl();
  await yenile(S, 'ozet');
  const r = await js(S, () => ({ baslik: document.title, h1: __t.$('#p-ozet h1')?.textContent, intro: !!__t.$('#introBox'), alt: __t.$$('#bottomNav button').length, yan: getComputedStyle(__t.$('.side')).display }));
  const h = hatalariAl();
  dogrula(!h.length, 'Konsol:\n' + h.join('\n'));
  dogrula(r.baslik === 'Mizan' && r.h1, 'Başlık ya da Özet boş: ' + JSON.stringify(r));
  dogrula(r.intro, 'İlk açılışta tanıtım kutusu yok.');
  dogrula(r.alt === 5 && r.yan === 'none', 'Mobil gezinme yanlış: ' + JSON.stringify(r));
  return r.h1;
});

test('Tanıtım: kapatılınca bir daha görünmüyor; Nasıl kullanılır sayfası açılıyor', async () => {
  await js(S, () => __t.$('[data-intro-close]').click());
  let r = await js(S, () => ({ box: !!__t.$('#introBox'), kayit: localStorage.getItem('mizan_tanitim') }));
  dogrula(!r.box && r.kayit === '1', 'Kapatma çalışmadı: ' + JSON.stringify(r));
  await yenile(S, 'ozet');
  dogrula(!(await js(S, () => !!__t.$('#introBox'))), 'Yenileyince tanıtım yeniden çıktı.');
  await js(S, () => localStorage.removeItem('mizan_tanitim'));
  await yenile(S, 'ozet');
  await js(S, () => __t.$('#introBox [data-go="nasil"]').click());
  r = await js(S, () => ({ h1: __t.$('#p-nasil h1')?.textContent, bolum: __t.$$('#p-nasil section').length, kayit: localStorage.getItem('mizan_tanitim'), hash: location.hash }));
  dogrula(r.h1 === 'Nasıl kullanılır' && r.bolum >= 10 && r.kayit === '1' && r.hash === '#nasil', 'Nasıl kullanılır: ' + JSON.stringify(r));
  return r.bolum + ' bölüm';
});

test('Bütün sayfalar ve 15 konu notu içerikli; metinde undefined/NaN yok', async () => {
  const r = await js(S, async (ar) => {
    const sorun = [];
    for (const h of ar) {
      await __t.git(h);
      const g = __t.gorunen(), metin = g[0] ? g[0].innerText : '';
      if (g.length !== 1) sorun.push(h + ': ' + g.length + ' sayfa görünür');
      if (metin.length < 80) sorun.push(h + ': içerik kısa (' + metin.length + ')');
      if (/undefined|NaN|\[object|null/.test(metin)) sorun.push(h + ': hatalı metin');
    }
    return sorun;
  }, SAYFALAR.concat(KONULAR.map((k) => 'konu-' + k)));
  dogrula(!r.length, r.join('\n'));
  return (SAYFALAR.length + KONULAR.length) + ' sayfa';
});

test('Veri denetimi: bütün maddeler geçiyor', async () => {
  const r = await js(S, async () => {
    await __t.git('hakkinda');
    for (let i = 0; i < 60 && !__t.$('#auditList .tag'); i++) await __t.bekle(50);
    return __t.$$('#auditList li').map((li) => li.innerText.replace(/\n/g, ' | '));
  });
  dogrula(r.length >= 13, 'Denetim sonucu gelmedi: ' + r.join('; '));
  const kalan = r.filter((x) => !/Geçti$/.test(x));
  dogrula(!kalan.length, kalan.join('\n'));
  return r.length + ' madde';
});

test('Yatay taşma yok (320–1440 px); mobilde dokunma hedefleri en az 40 px', async () => {
  const sorun = [];
  for (const [w, h] of [[320, 640], [360, 780], [390, 844], [414, 896], [768, 1024], [1024, 768], [1440, 900]]) {
    const mobil = w < 900;
    await ekranBoyu(S, w, h, mobil); await sleep(80);
    const r = await js(S, async (a) => {
      const out = [];
      if (!document.getElementById('__cv')) { const st = document.createElement('style'); st.id = '__cv'; st.textContent = 'main .page:not([hidden]) *{content-visibility:visible!important}'; document.head.appendChild(st); }
      for (const r of a.sayfalar) {
        await __t.git(r);
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push(a.w + ' ' + r + ': sayfa ' + document.documentElement.scrollWidth + ' px');
        if (!a.mobil) continue;
        const kucuk = __t.$$('main button, main select, main input[type=text], main input[type=number], main input[type=search], main summary, main label.chk, #bottomNav button, .topbar button')
          .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 40 && !el.closest('.scroll table') && !el.classList.contains('file-in'); })
          .slice(0, 3).map((el) => (el.className || el.tagName) + '(' + Math.round(el.getBoundingClientRect().height) + ')');
        if (kucuk.length) out.push(a.w + ' ' + r + ': küçük hedef ' + kucuk.join(', '));
      }
      return out;
    }, { w, mobil, sayfalar: SAYFALAR.concat(['konu-temel', 'konu-stok', 'konu-duran2']) });
    sorun.push(...r);
  }
  await ekranBoyu(S, 390, 844, true);
  await js(S, () => { const st = document.getElementById('__cv'); if (st) st.remove(); });
  dogrula(!sorun.length, sorun.join('\n'));
  return '7 genişlik × ' + (SAYFALAR.length + 3) + ' sayfa';
});

test('ABC Ticaret: on kayıt arayüzden giriliyor; büyük defter ve mizan denk', async () => {
  await js(S, () => { ['abc', 'abcIndex', 'pratikSekme'].forEach((k) => localStorage.removeItem('mizan_' + k)); });
  await yenile(S, 'alistirma');
  const r = await js(S, async () => {
    const sonuc = [];
    for (let i = 0; i < 10; i++) {
      __t.$('[data-step="' + i + '"]').click(); await __t.bekle(10);
      __t.$('[data-show="abc"]').click();
      const sol = __t.cozum('abc');
      __t.doldur('abc', sol); __t.$('[data-check="abc"]').click(); await __t.bekle(10);
      sonuc.push(__t.mesaj('abc').startsWith('Doğru') ? 'ok' : i + ': ' + __t.mesaj('abc').slice(0, 90));
    }
    const ayak = __t.$$('#pracBody table.t tfoot td').map((td) => td.innerText.replace(/\n/g, ' '));
    return { sonuc, ayak, tacc: __t.$$('.tacc').length, bitti: __t.$$('.steps button.done').length };
  });
  const hatali = r.sonuc.filter((x) => x !== 'ok');
  dogrula(!hatali.length, hatali.join('\n'));
  const say = (x) => Number(x.replace(/\D/g, ''));
  dogrula(say(r.ayak[1]) === say(r.ayak[2]) && say(r.ayak[1]) === 350300, 'Mizan toplamı: ' + r.ayak.join(' | '));
  dogrula(r.tacc === 15 && r.bitti === 10, 'T hesap ya da tamamlanan sayısı: ' + JSON.stringify(r));
  return 'mizan ' + r.ayak.slice(1, 3).join(' = ');
});

test('Hatalı kayıtlar doğru uyarıyı veriyor', async () => {
  const r = await js(S, async () => {
    const dene = async (sol, bos) => {
      __t.$('[data-step="1"]').click(); await __t.bekle(10);
      while (__t.satirlar('abc').length > 2) { const s = __t.satirlar('abc'); s[s.length - 1].querySelector('.e-del').click(); }
      __t.satirlar('abc').forEach((row) => { __t.ayarla(row.querySelector('.e-acc'), ''); __t.ayarla(row.querySelector('.e-amt'), ''); row.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', 'false')); });
      if (!bos) __t.doldur('abc', sol);
      __t.$('[data-check="abc"]').click(); await __t.bekle(10);
      return __t.mesaj('abc');
    };
    const out = {};
    out.bos = await dene([], true);
    out.kdv = await dene([['153', 'B', 15000], ['191', 'B', 2700], ['100', 'A', 17700]]);
    out.denk = await dene([['153', 'B', 15000], ['191', 'B', 3000], ['100', 'A', 17000]]);
    out.ters = await dene([['153', 'A', 15000], ['191', 'A', 3000], ['100', 'B', 18000]]);
    out.hesap = await dene([['153', 'B', 15000], ['191', 'B', 3000], ['102', 'A', 18000]]);
    out.bol = await dene([['153', 'B', 15000], ['191', 'B', 3000], ['100', 'A', 10000], ['100', 'A', 8000]]);
    out.tutar = await dene([['153', 'B', 'abc'], ['100', 'A', 15000]]);
    __t.$('[data-step="1"]').click(); await __t.bekle(10);
    const s = __t.satirlar('abc');
    s.forEach((row) => row.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', 'false')));
    __t.ayarla(s[0].querySelector('.e-acc'), '153'); __t.ayarla(s[0].querySelector('.e-amt'), '15000');
    __t.ayarla(s[1].querySelector('.e-acc'), '100'); s[1].querySelector('[data-side="A"]').click(); __t.ayarla(s[1].querySelector('.e-amt'), '15000');
    __t.$('[data-check="abc"]').click(); await __t.bekle(10);
    out.taraf = __t.mesaj('abc');
    return out;
  });
  const bekl = { bos: 'En az iki satır', kdv: 'Eski KDV oranı', denk: 'Kayıt denk değil', ters: 'ters tarafta', hesap: 'bu işlemde kullanılmıyor', bol: 'Doğru', tutar: 'okunamadı', taraf: '1. satırda borç ya da alacak seçilmedi' };
  const yanlis = Object.entries(bekl).filter(([k, v]) => !r[k].includes(v)).map(([k, v]) => k + ': "' + v + '" beklenirken "' + r[k].slice(0, 100) + '"');
  dogrula(!yanlis.length, yanlis.join('\n'));
  return Object.keys(bekl).length + ' durum';
});

test('Satır ekleme ve silme; tutar kutusunda Enter kontrol ediyor', async () => {
  const r = await js(S, async () => {
    __t.$('[data-tab="serbest"]').click(); await __t.bekle(20);
    const say = () => __t.satirlar('free').length;
    const out = [say()];
    __t.$('[data-add="free"]').click(); out.push(say());
    __t.satirlar('free')[3].querySelector('.e-del').click(); out.push(say());
    __t.satirlar('free')[2].querySelector('.e-del').click(); out.push(say());
    __t.satirlar('free')[1].querySelector('.e-del').click(); out.push(say());
    const enAz = __t.mesaj('free');
    const inp = __t.satirlar('free')[0].querySelector('.e-amt');
    __t.ayarla(inp, '100');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await __t.bekle(10);
    return { out, enAz, enter: __t.mesaj('free') };
  });
  dogrula(r.out.join(',') === '3,4,3,2,2', 'Satır sayıları: ' + r.out.join(','));
  dogrula(r.enAz.includes('en az iki satır'), 'Son satır silinirken uyarı yok: ' + r.enAz);
  dogrula(r.enter.startsWith('En az iki satır doldur'), 'Enter kontrolü çalışmadı: ' + r.enter);
  return 'satırlar ' + r.out.join('→');
});

test('Serbest alıştırma: 40 rastgele soru çözümüyle kabul ediliyor', async () => {
  const r = await js(S, async () => {
    const hata = [];
    for (let i = 0; i < 40; i++) {
      const q = __t.$('#pracBody .box p').innerText;
      __t.$('[data-show="free"]').click();
      __t.doldur('free', __t.cozum('free')); __t.$('[data-check="free"]').click(); await __t.bekle(5);
      if (!__t.mesaj('free').startsWith('Doğru')) hata.push(q + ' → ' + __t.mesaj('free').slice(0, 90));
      __t.$('[data-new]').click(); await __t.bekle(5);
    }
    return hata;
  });
  dogrula(!r.length, r.join('\n'));
  return '40 soru';
});

test('Serbest alıştırma puanı: çözüm açılmadan doğru sayılıyor, açılınca sayılmıyor', async () => {
  await js(S, () => localStorage.removeItem('mizan_pratik'));
  await yenile(S, 'konu-menkul');
  const r = await js(S, async () => {
    __t.$('[data-pratik="menkul"]').click(); await __t.bekle(20);
    const konu = __t.$('#freeTopic').value;
    const q = __t.$('#pracBody .box p').innerText;
    const tutar = q.match(/^([\d.]+) TL tutarında hisse senedi/)[1];
    __t.doldur('free', [['110', 'B', tutar], ['102', 'A', tutar]]); __t.$('[data-check="free"]').click(); await __t.bekle(10);
    const ilk = __t.$('#pracBody .f strong').innerText, m1 = __t.mesaj('free');
    __t.$('[data-new]').click(); await __t.bekle(10);
    __t.$('[data-show="free"]').click(); __t.doldur('free', __t.cozum('free')); __t.$('[data-check="free"]').click(); await __t.bekle(10);
    return { konu, ilk, m1, ikinci: __t.$('#pracBody .f strong').innerText };
  });
  dogrula(r.konu === 'menkul', 'Konu seçilmedi: ' + r.konu);
  dogrula(r.m1.startsWith('Doğru') && r.ilk === '1 doğru / 1 soru', 'İlk soru: ' + JSON.stringify(r));
  dogrula(r.ikinci === '1 doğru / 2 soru', 'Çözüm açılınca: ' + r.ikinci);
  return r.ikinci;
});

test('Tekrar testi: 10 soru tamamlanıyor, sonuç ve geçmiş kaydediliyor', async () => {
  const r = await js(S, async () => {
    await __t.git('tekrar');
    if (__t.$('[data-rtab="test"]').getAttribute('aria-selected') !== 'true') { __t.$('[data-rtab="test"]').click(); await __t.bekle(10); }
    __t.$('[data-test-start]').click(); await __t.bekle(10);
    let n = 0, isaret = 0;
    while (__t.$('[data-opt]') && n < 12) {
      __t.$$('[data-opt]')[0].click(); await __t.bekle(5);
      if (__t.$('.opts button.right') && __t.$('#revBody .note')) isaret++;
      __t.$('[data-test-next]').click(); await __t.bekle(5); n++;
    }
    const sonuc = __t.$('#revBody .big')?.textContent;
    __t.$('[data-test-close]').click(); await __t.bekle(10);
    return { n, isaret, sonuc, gecmis: __t.$('#revBody .list li')?.innerText || '' };
  });
  dogrula(r.n === 10 && r.isaret === 10, 'Soru akışı: ' + JSON.stringify(r));
  dogrula(/^\d+\/10$/.test(r.sonuc || ''), 'Sonuç yok: ' + r.sonuc);
  dogrula(r.gecmis && !/Invalid|NaN/.test(r.gecmis), 'Geçmiş satırı hatalı: ' + r.gecmis);
  return 'sonuç ' + r.sonuc;
});

test('Kartlar: çevirme, derecelendirme, deste değiştirme, klavye', async () => {
  const r = await js(S, async () => {
    __t.$('[data-rtab="kart"]').click(); await __t.bekle(10);
    const on = __t.$('#theCard .front').textContent;
    __t.$('#theCard').click(); await __t.bekle(5);
    const arka = __t.$('#theCard .back')?.textContent || '';
    __t.$('[data-card="1"]').click(); await __t.bekle(5);
    const kutu = JSON.parse(localStorage.getItem('mizan_kartlar') || '{}')['h:' + on];
    const yeni = __t.$('#theCard .front').textContent;
    __t.$('#theCard').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await __t.bekle(5);
    const klavye = !!__t.$('#theCard .back');
    __t.ayarla(__t.$('#deckSel'), 'kavram'); await __t.bekle(5);
    const kavram = __t.$('#theCard .front').textContent;
    await __t.git('ozet');
    const ozet = __t.$$('#p-ozet .stat').map((x) => x.innerText.replace(/\n/g, ' ')).find((x) => x.includes('kart'));
    return { on, arka, kutu, yeni, klavye, kavram, ozet };
  });
  dogrula(r.arka && r.kutu === 1 && r.yeni !== r.on, 'Kart akışı: ' + JSON.stringify(r));
  dogrula(r.klavye, 'Enter ile çevrilmedi.');
  dogrula(/esas|ölçülme|sorumluluk|Kişilik|süreklilik|Dönemsellik|Tutarlılık|açıklama|İhtiyatlılık|Önemlilik|önceliği|belgelendirme/.test(r.kavram), 'Kavram destesi: ' + r.kavram);
  dogrula(/\/164/.test(r.ozet || ''), 'Özet kart sayacı: ' + r.ozet);
  return r.ozet;
});

test('Hesap araçları bilinen değerleri veriyor', async () => {
  const r = await js(S, async () => {
    await __t.git('araclar');
    const d = (id, v) => __t.ayarla(__t.$('#' + id), v), m = (id) => __t.$('#' + id).innerText.replace(/\n/g, ' ');
    const o = { varsayilan: __t.$('#gPreset').value };
    d('gPreset', '20-20-60'); d('gVize', '55'); d('gOdev', '70'); o.f1 = m('gOut');
    d('gPreset', '40-60'); d('gVize', '90'); o.f2 = m('gOut'); d('gVize', '5'); o.f3 = m('gOut'); d('gVize', '0'); o.f4 = m('gOut');
    d('gVize', '150'); o.fHata = m('e-gVize'); d('gVize', '55');
    d('kTutar', '18.000'); d('kYon', 'dahil'); d('kOran', '20'); o.kdv = m('kOut');
    d('kYon', 'haric'); d('kTutar', '1.250,50'); o.kdv2 = m('kOut');
    d('kTutar', '-5'); o.kdvHata = m('e-kTutar');
    d('fA', '5.400'); d('fR', '8'); d('fG', '200'); d('fY', '360'); o.faiz = m('fOut');
    d('pM', '800'); d('pK', '25'); d('pE', 'm'); o.kar1 = m('pOut'); d('pE', 's'); o.kar2 = m('pOut'); d('pK', '100'); o.karHata = m('e-pK');
    d('aM', '60.000'); d('aN', '5'); d('aY', 'a'); o.azalan = __t.$$('#aOut tbody tr').map((tr) => tr.children[1].textContent).join(' / ');
    d('aY', 'n'); o.normal = __t.$$('#aOut tbody tr').map((tr) => tr.children[1].textContent).join(' / ');
    const g = __t.$$('#gnoRows .gnorow');
    __t.ayarla(g[0].querySelector('[data-f="k"]'), '5'); __t.ayarla(g[0].querySelector('[data-f="h"]'), 'CC');
    __t.ayarla(g[1].querySelector('[data-f="k"]'), '3'); __t.ayarla(g[1].querySelector('[data-f="h"]'), 'AA');
    o.gno = m('gnoOut');
    return o;
  });
  const bekl = { varsayilan: '20-20-60', f1: '59', f2: '50', f3: '97', f4: '100', gno: '2,75' };
  const yanlis = Object.entries(bekl).filter(([k, v]) => r[k] !== v).map(([k, v]) => k + ': ' + v + ' beklenirken ' + r[k]);
  if (!r.fHata) yanlis.push('Final notu için hata mesajı yok');
  if (!r.kdv.includes('15.000,00') || !r.kdv.includes('3.000,00')) yanlis.push('KDV dahil: ' + r.kdv);
  if (!r.kdv2.includes('250,10') || !r.kdv2.includes('1.500,60')) yanlis.push('KDV hariç: ' + r.kdv2);
  if (!r.kdvHata) yanlis.push('Negatif tutar için hata yok');
  if (!r.faiz.includes('240,00')) yanlis.push('Faiz: ' + r.faiz);
  if (!r.kar1.includes('1.000,00') || !r.kar2.includes('1.066,67')) yanlis.push('Kâr: ' + r.kar1 + ' / ' + r.kar2);
  if (!r.karHata) yanlis.push('Satış üzerinden %100 için hata yok');
  if (r.azalan !== '24.000,00 / 14.400,00 / 8.640,00 / 5.184,00 / 7.776,00') yanlis.push('Azalan bakiyeler: ' + r.azalan);
  if (r.normal !== '12.000,00 / 12.000,00 / 12.000,00 / 12.000,00 / 12.000,00') yanlis.push('Normal: ' + r.normal);
  dogrula(!yanlis.length, yanlis.join('\n'));
  return 'final, ortalama, KDV, faiz, kâr, amortisman';
});

test('Takvim işareti sayfa yenilenince korunuyor', async () => {
  await js(S, async () => { await __t.git('takvim'); __t.$('label.chk').click(); await __t.bekle(10); });
  await yenile(S, 'takvim');
  const r = await js(S, () => ({ isaret: __t.$('label.chk input').checked, kayit: localStorage.getItem('mizan_checks') }));
  dogrula(r.isaret && /2026-2027:/.test(r.kayit), 'İşaret korunmadı: ' + JSON.stringify(r));
  return r.kayit;
});

test('Tema: geçiş, kalıcılık, cihaz ayarı ve koyu modda okunabilirlik', async () => {
  await renkSemasi(S, 'light'); await yenile(S, 'alistirma');
  let r = await js(S, () => { __t.$('.topbar [data-theme-toggle]').click(); return { tema: document.documentElement.getAttribute('data-theme'), kayit: localStorage.getItem('mizan_tema') }; });
  dogrula(r.tema === 'dark' && r.kayit === '"dark"', 'Geçiş: ' + JSON.stringify(r));
  await yenile(S, 'alistirma');
  r = await js(S, () => {
    const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const oran = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    __t.$('[data-tab="abc"]').click();
    const btn = __t.satirlar('abc')[0].querySelector('[data-side="B"]'); btn.click();
    const b2 = __t.satirlar('abc')[0].querySelector('[data-side="B"]'), cs = getComputedStyle(b2);
    const body = getComputedStyle(document.body);
    return { tema: document.documentElement.getAttribute('data-theme'), zemin: body.backgroundColor, dugme: oran(cs.color, cs.backgroundColor), metin: oran(body.color, body.backgroundColor) };
  });
  dogrula(r.tema === 'dark' && r.zemin === 'rgb(14, 17, 19)', 'Koyu tema kalıcı değil: ' + JSON.stringify(r));
  dogrula(r.dugme >= 4.5 && r.metin >= 7, 'Koyu modda kontrast düşük: ' + JSON.stringify(r));
  await js(S, async () => { await __t.git('hakkinda'); __t.ayarla(__t.$('#themeSel'), 'system'); });
  await renkSemasi(S, 'dark'); await sleep(50);
  r = await js(S, () => ({ tema: document.documentElement.getAttribute('data-theme'), kayit: localStorage.getItem('mizan_tema'), zemin: getComputedStyle(document.body).backgroundColor }));
  await renkSemasi(S, 'light');
  dogrula(r.tema === null && r.kayit === null && r.zemin === 'rgb(14, 17, 19)', 'Cihaz ayarı: ' + JSON.stringify(r));
  return 'düğme kontrastı ' + r.zemin;
});

test('Kampüs seçimi planı, ders kodlarını ve not dağılımını değiştiriyor', async () => {
  await yenile(S, 'ozet');
  await js(S, () => __t.ayarla(__t.$('#campusOzet'), 'niksar'));
  await yenile(S, 'notlar');
  const r = await js(S, async () => {
    const o = { notlar: __t.$('#p-notlar header p').innerText.slice(0, 40), kayit: localStorage.getItem('mizan_campus') };
    await __t.git('dersler'); o.ders = __t.$('#p-dersler section h2').innerText;
    await __t.git('araclar'); o.oran = __t.$('#gPreset').value;
    await __t.git('ozet'); __t.ayarla(__t.$('#campusOzet'), 'tokat'); await __t.bekle(10);
    await __t.git('notlar'); o.geri = __t.$('#p-notlar header p').innerText.slice(0, 40);
    return o;
  });
  dogrula(r.notlar.includes('MV101') && r.kayit === '"niksar"' && r.ders.includes('MV101') && r.oran === '40-60', 'Niksar: ' + JSON.stringify(r));
  dogrula(r.geri.includes('MV1013'), 'Tokat\'a dönüş: ' + r.geri);
  return 'Niksar ve Tokat';
});

test('Gezinme: alt menü, geri tuşu, derin bağlantı, geçersiz adres, içeriğe geç, hesap bağlantısı', async () => {
  await yenile(S, 'ozet');
  let r = await js(S, async () => {
    const out = [];
    for (const b of __t.$$('#bottomNav button')) {
      b.click(); await __t.bekle(10);
      const g = __t.gorunen()[0].id.slice(2);
      if (g !== b.dataset.go || b.getAttribute('aria-current') !== 'page') out.push(b.dataset.go + '→' + g);
    }
    __t.$('#bottomNav [data-go="notlar"]').click(); await __t.bekle(10);
    __t.$('#p-notlar [data-konu]').click(); await __t.bekle(10);
    const konu = location.hash;
    history.back(); await __t.bekle(200);
    return { out, konu, geri: location.hash, gorunen: __t.gorunen()[0].id };
  });
  dogrula(!r.out.length, 'Alt menü: ' + r.out.join(', '));
  dogrula(r.konu.startsWith('#konu-') && r.geri === '#notlar' && r.gorunen === 'p-notlar', 'Geri tuşu: ' + JSON.stringify(r));
  await yenile(S, 'konu-stok');
  r = await js(S, () => ({ h1: __t.$('#p-konu h1')?.textContent, gorunen: __t.gorunen()[0].id, baslik: document.title }));
  dogrula(r.h1 === 'Stoklar ve KDV' && r.gorunen === 'p-konu', 'Derin bağlantı: ' + JSON.stringify(r));
  await yenile(S, 'boyle-bir-sayfa-yok');
  dogrula((await js(S, () => __t.gorunen()[0].id)) === 'p-ozet', 'Geçersiz adres Özet\'e gitmedi.');
  r = await js(S, async () => {
    const once = location.hash; __t.$('[data-skip]').click(); await __t.bekle(10);
    const skip = { hash: location.hash === once, odak: document.activeElement.id };
    await __t.git('konu-hazir'); __t.$('[data-hesap="102"]').click(); await __t.bekle(30);
    return { skip, hesap: __t.gorunen()[0].id, acik: __t.$('#acc-102')?.open, ara: __t.$('#accQ').value };
  });
  dogrula(r.skip.hash && r.skip.odak === 'main', 'İçeriğe geç: ' + JSON.stringify(r.skip));
  dogrula(r.hesap === 'p-hesaplar' && r.acik && r.ara === '102', 'Hesap bağlantısı: ' + JSON.stringify(r));
  return 'hepsi';
});

test('Yedek: indirme, geri yükleme ve hatalı dosyalar', async () => {
  const dizin = await mkdtemp(join(tmpdir(), 'mizan-yedek-'));
  try {
    try { await S.gonder('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dizin }); }
    catch { await S.gonder('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dizin }); }
    await yenile(S, 'hakkinda');
    const tema = await js(S, () => { if (!localStorage.getItem('mizan_checks')) localStorage.setItem('mizan_checks', '{"2026-2027:kayit":true}'); return localStorage.getItem('mizan_tema'); });
    await js(S, () => __t.$('[data-backup]').click());
    let indirilen = null;
    for (let i = 0; i < 40 && !indirilen; i++) { await sleep(100); indirilen = (await readdir(dizin)).find((f) => f.startsWith('mizan-yedek-') && f.endsWith('.json')); }
    dogrula(indirilen, 'Yedek dosyası indirilmedi.');
    const yedek = JSON.parse(await readFile(join(dizin, indirilen), 'utf8'));
    dogrula(yedek.uygulama === 'Mizan' && yedek.veri && yedek.veri.checks, 'Yedek içeriği: ' + JSON.stringify(yedek).slice(0, 200));
    const yukle = async (ad, icerik) => {
      const yol = join(dizin, ad); await writeFile(yol, icerik);
      const { root } = await S.gonder('DOM.getDocument', { depth: 1 });
      const { nodeId } = await S.gonder('DOM.querySelector', { nodeId: root.nodeId, selector: '#restoreFile' });
      await S.gonder('DOM.setFileInputFiles', { nodeId, files: [yol] });
    };
    await yukle('bozuk.json', 'bu json değil');
    await sleep(300);
    const m1 = await js(S, () => __t.$('#backupMsg').innerText);
    await yukle('baska.json', JSON.stringify({ uygulama: 'Baska', veri: {} }));
    await sleep(300);
    const m2 = await js(S, () => __t.$('#backupMsg').innerText);
    const yuklendi = S.bekle('Page.loadEventFired');
    await yukle('iyi.json', JSON.stringify({ uygulama: 'Mizan', surum: '1.1.0', tarih: '2026-10-01', veri: { abc: '{"0":true,"1":true,"2":true}', campus: '"niksar"', kartlar: '{"h:100":4}', quiz: 'bozuk{' } }));
    await yuklendi; await sleep(200); await js(S, yardimci);
    const r = await js(S, () => ({ gorunen: __t.gorunen()[0].id, mesaj: __t.$('#backupMsg').innerText, abc: localStorage.getItem('mizan_abc'), kampus: localStorage.getItem('mizan_campus'), checks: localStorage.getItem('mizan_checks'), quiz: localStorage.getItem('mizan_quiz'), tema: localStorage.getItem('mizan_tema') }));
    dogrula(m1.includes('okunamadı') && m2.includes('Mizan yedeği değil'), 'Hatalı dosya mesajları: ' + m1 + ' / ' + m2);
    dogrula(r.gorunen === 'p-hakkinda' && r.mesaj.includes('Yedek geri yüklendi (3 kayıt') && r.abc.includes('"2":true') && r.kampus === '"niksar"', 'Geri yükleme: ' + JSON.stringify(r));
    // Yedekte olmayan ya da bozuk çalışma verisi kalmaz; yedekte olmayan tema korunur.
    dogrula(r.checks === null && r.quiz === null && r.tema === tema, 'Geri yükleme sonrası eski veri: ' + JSON.stringify(r));
    await js(S, () => localStorage.setItem('mizan_campus', '"tokat"'));
    return indirilen;
  } finally { await rm(dizin, { recursive: true, force: true }); }
});

test('Bozuk kayıtlarla açılış hata vermiyor', async () => {
  await js(S, () => {
    const bozuk = { abc: '[1,2', abcIndex: '"x"', kartlar: '5', gno: '{"a":1}', pratik: 'null', quiz: '[{"d":1,"n":2}]', checks: '[]', campus: '"istanbul"', deste: '"yok"', pratikSekme: '7', tekrarSekme: 'null', tema: '"mor"', tanitim: '{' };
    Object.entries(bozuk).forEach(([k, v]) => localStorage.setItem('mizan_' + k, v));
  });
  hatalariAl();
  await yenile(S, 'ozet');
  const r = await js(S, async (sayfalar) => {
    const out = [];
    for (const s of sayfalar) { await __t.git(s); const m = __t.gorunen()[0]?.innerText || ''; if (m.length < 50 || /undefined|NaN/.test(m)) out.push(s); }
    return { out, kampus: __t.$('#campusSide').value, tema: document.documentElement.getAttribute('data-theme') };
  }, SAYFALAR);
  const h = hatalariAl();
  dogrula(!h.length, 'Konsol:\n' + h.join('\n'));
  dogrula(!r.out.length && r.kampus === 'tokat' && r.tema === null, 'Bozuk kayıt: ' + JSON.stringify(r));
  return 'kampüs ' + r.kampus;
});

test('Sıfırlama çalışma verilerini siliyor, kampüs ve temayı koruyor', async () => {
  await js(S, () => { localStorage.setItem('mizan_abc', '{"0":true}'); localStorage.setItem('mizan_campus', '"niksar"'); localStorage.setItem('mizan_tema', '"dark"'); });
  await yenile(S, 'hakkinda');
  const r = await js(S, async () => {
    __t.$('[data-wipe]').click(); __t.$('[data-wipe-yes]').click(); await __t.bekle(20);
    return { kalan: Object.keys(localStorage).filter((k) => k.startsWith('mizan_')).sort().join(','), mesaj: __t.$('#resetBox').innerText };
  });
  dogrula(r.kalan === 'mizan_campus,mizan_tanitim,mizan_tema' && r.mesaj.includes('Silindi'), 'Sıfırlama: ' + JSON.stringify(r));
  await js(S, () => { localStorage.setItem('mizan_campus', '"tokat"'); localStorage.removeItem('mizan_tema'); });
  return r.kalan;
});

test('Deneme tarihlerinde dönem doğru belirleniyor', async () => {
  const beklenen = { '2026-08-20': 'Dönem başlamadı', '2026-09-24': 'Güz yarıyılı, 1. hafta', '2026-11-18': 'Ara sınav haftası', '2026-12-30': 'Güz yarıyılı, 14. hafta',
    '2027-01-05': 'Final haftası', '2027-01-14': 'Sınav arası', '2027-01-20': 'Bütünleme haftası', '2027-01-27': 'Yarıyıl tatili', '2027-02-10': 'Bahar yarıyılı, 2. hafta',
    '2027-03-10': 'Bayram haftası', '2027-04-07': 'Ara sınav haftası', '2027-05-20': 'Bayram haftası', '2027-05-26': 'Bahar yarıyılı, 14. hafta', '2027-06-12': 'Sınav arası',
    '2027-07-15': 'Yaz dönemi', '2027-09-15': 'Takvim güncel değil' };
  const yanlis = [];
  for (const [gun, baslik] of Object.entries(beklenen)) {
    await js(S, (g) => localStorage.setItem('mizan_tarih', g), gun);
    await yenile(S, 'ozet');
    const h = await js(S, () => __t.$('#p-ozet h1').textContent);
    if (h !== baslik) yanlis.push(gun + ': "' + baslik + '" beklenirken "' + h + '"');
  }
  await js(S, () => localStorage.removeItem('mizan_tarih'));
  dogrula(!yanlis.length, yanlis.join('\n'));
  return Object.keys(beklenen).length + ' tarih';
});

test('Akıcılık: orta seviye telefon benzetimi (işlemci 4 kat yavaş)', async () => {
  const { identifier } = await S.gonder('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__uzun=[];try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__uzun.push([Math.round(e.duration),Math.round(e.startTime)])})}).observe({type:"longtask",buffered:true})}catch(e){}' });
  await ac(S, 'ozet'); await temizle(S); await ekranBoyu(S, 390, 844, true);
  await S.gonder('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    await yenile(S, 'ozet');
    const r = await js(S, async (sayfalar) => {
      const acilis = Math.round((performance.getEntriesByName('mizan-hazir')[0] || { startTime: NaN }).startTime);
      // Kullanıcı Özet'i okurken arka planda sayfalar hazırlanır; bitmesini bekle.
      for (let i = 0; i < 100; i++) { if (sayfalar.every((s) => s === 'ozet' || s === 'hakkinda' || (document.getElementById('p-' + s).innerHTML.length > 0))) break; await __t.bekle(100); }
      await __t.bekle(800);
      const arkaPlan = window.__uzun.map((x) => x[0]);
      window.__uzun.length = 0;
      const sure = {}, kare = {}, adim = [];
      const olc = async (ad, f) => {
        const t0 = performance.now(); adim.push([ad, Math.round(t0)]); f(); sure[ad] = Math.round(performance.now() - t0);
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); kare[ad] = Math.round(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 40));
      };
      for (const s of sayfalar) await olc(s, () => { location.hash = s; window.dispatchEvent(new HashChangeEvent('hashchange')); });
      await olc('konu', () => { location.hash = 'konu-stok'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
      // Hazırlık (testin kendi toplu doldurması) ölçüme katılmaz.
      location.hash = 'alistirma'; window.dispatchEvent(new HashChangeEvent('hashchange')); await __t.bekle(30);
      __t.$('[data-tab="abc"]').click(); __t.$('[data-show="abc"]').click(); __t.doldur('abc', __t.cozum('abc'));
      await __t.bekle(300); window.__uzun.length = 0;
      await olc('kontrol', () => __t.$('[data-check="abc"]').click());
      await olc('yazma', () => __t.ayarla(__t.satirlar('abc')[0].querySelector('.e-amt'), '12345'));
      await olc('satir-ekle', () => __t.$('[data-add="abc"]').click());
      await olc('satir-sil', () => { const s = __t.satirlar('abc'); s[s.length - 1].querySelector('.e-del').click(); });
      await olc('taraf', () => __t.satirlar('abc')[0].querySelector('[data-side="A"]').click());
      await olc('sonraki-kayit', () => __t.$('[data-step="1"]').click());
      await olc('serbest-sekme', () => __t.$('[data-tab="serbest"]').click());
      await olc('yeni-soru', () => __t.$('[data-new]').click());
      await olc('cozum', () => __t.$('[data-show="free"]').click());
      location.hash = 'tekrar'; window.dispatchEvent(new HashChangeEvent('hashchange')); await __t.bekle(30);
      await olc('test-baslat', () => __t.$('[data-test-start]').click());
      await olc('secenek', () => __t.$$('[data-opt]')[0].click());
      await olc('kart-sekme', () => __t.$('[data-rtab="kart"]').click());
      await olc('kart-cevir', () => __t.$('#theCard').click());
      await olc('tema', () => __t.$('.topbar [data-theme-toggle]').click());
      await olc('tema-geri', () => __t.$('.topbar [data-theme-toggle]').click());
      await __t.bekle(600);
      const uzun = window.__uzun.map(([d, t]) => { const a = adim.filter((x) => x[1] <= t + 5).pop(); return d + ' ms (' + (a ? a[0] : '?') + ')'; });
      return { acilis, sure, kare, uzun, uzunMs: window.__uzun.map((x) => x[0]), arkaPlan };
    }, SAYFALAR);
    const enYavas = Object.entries(r.kare).sort((a, b) => b[1] - a[1])[0];
    const uzun = Math.max(0, ...r.uzunMs), arka = Math.max(0, ...r.arkaPlan);
    const ayrinti = '\naçılış ' + r.acilis + ' ms · kare süreleri ' + JSON.stringify(r.kare) + ' · dokunuş sırasında uzun görev ' + JSON.stringify(r.uzun) + ' · arka plan ' + JSON.stringify(r.arkaPlan);
    dogrula(r.acilis < 800, 'Açılış yavaş: ' + r.acilis + ' ms' + ayrinti);
    dogrula(enYavas[1] < 100, 'En yavaş ekran ' + enYavas[0] + ': ' + enYavas[1] + ' ms' + ayrinti);
    dogrula(uzun < 100, 'Dokunuş sırasında uzun görev: ' + uzun + ' ms' + ayrinti);
    dogrula(arka < 200, 'Arka planda uzun görev: ' + arka + ' ms' + ayrinti);
    return 'açılış ' + r.acilis + ' ms · en yavaş ekran ' + enYavas[0] + ' ' + enYavas[1] + ' ms · dokunuşta uzun görev ' + (uzun || 'yok') + ' · arka planda en uzun ' + arka + ' ms';
  } finally {
    await S.gonder('Emulation.setCPUThrottlingRate', { rate: 1 });
    await S.gonder('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
});

test('Dosyadan açma (çift tıklama): hata yok, uygulama çalışıyor', async () => {
  hatalariAl();
  const yuklendi = S.bekle('Page.loadEventFired');
  await S.gonder('Page.navigate', { url: pathToFileURL(join(KOK, 'index.html')).href + '#alistirma' });
  await yuklendi; await sleep(200); await js(S, yardimci);
  const r = await js(S, () => ({ h1: __t.$('#p-alistirma h1')?.textContent, satir: __t.satirlar('abc').length || __t.satirlar('free').length, manifest: !!document.querySelector('link[rel="manifest"]') }));
  const h = hatalariAl();
  dogrula(!h.length, 'Konsol:\n' + h.join('\n'));
  dogrula(r.h1 === 'Alıştırma' && r.satir >= 2 && !r.manifest, 'Dosyadan açma: ' + JSON.stringify(r));
  return 'file://';
});

test('Çevrimdışı: sunucu kapalıyken uygulama önbellekten açılıyor', async () => {
  await ac(S, 'ozet');
  const etkin = await js(S, async () => {
    for (let i = 0; i < 80; i++) { const r = await navigator.serviceWorker.getRegistration(); if (r && r.active) return true; await __t.bekle(100); }
    return false;
  });
  dogrula(etkin, 'Service worker etkinleşmedi.');
  await yenile(S, 'ozet', true);
  await SUNUCU.kapat();
  try {
    await yenile(S, 'araclar', true);
    const r = await js(S, () => ({ h1: __t.$('#p-araclar h1')?.textContent, faiz: __t.$('#fOut')?.innerText || '', denetim: !!navigator.serviceWorker.controller }));
    dogrula(r.h1 === 'Hesap araçları' && r.faiz.includes('240,00') && r.denetim, 'Çevrimdışı: ' + JSON.stringify(r));
  } finally { SUNUCU = await sunucuAc(PORT); }
  return 'sunucu kapalıyken açıldı';
});

/* ---------- 5. README EKRAN GÖRÜNTÜLERİ ---------- */
async function ekranGoruntuleri(dizin) {
  await mkdir(dizin, { recursive: true });
  const yazilan = [];
  const cek = async (ad) => { await sleep(250); const { data } = await S.gonder('Page.captureScreenshot', { format: 'webp', quality: 90 }); await writeFile(join(dizin, ad), Buffer.from(data, 'base64')); yazilan.push(ad); };
  await ac(S, 'ozet'); await temizle(S);
  await js(S, () => { localStorage.setItem('mizan_tanitim', '1'); localStorage.setItem('mizan_campus', '"tokat"'); });
  await renkSemasi(S, 'light'); await ekranBoyu(S, 390, 844, true); await yenile(S, 'ozet');
  await cek('mobil-ozet.webp');
  await js(S, async () => { await __t.git('konu-hazir'); const ex = __t.$('#p-konu .box'); window.scrollTo(0, ex.getBoundingClientRect().top + scrollY - 250); });
  await cek('mobil-konu.webp');
  await renkSemasi(S, 'dark');
  await js(S, async () => {
    await __t.git('alistirma'); __t.$('[data-tab="abc"]').click(); __t.$('[data-step="1"]').click();
    __t.doldur('abc', [['153', 'B', 15000], ['191', 'B', 3000], ['100', 'A', 18000]]); __t.$('[data-check="abc"]').click();
    const kutu = __t.$('#pracBody .box'); window.scrollTo(0, kutu.getBoundingClientRect().top + scrollY - 70);
  });
  await cek('mobil-alistirma-koyu.webp');
  await js(S, async () => { await __t.git('tekrar'); __t.$('[data-rtab="test"]').click(); __t.$('[data-test-start]').click(); __t.$$('[data-opt]')[0].click(); window.scrollTo(0, 0); });
  await cek('mobil-test-koyu.webp');
  await renkSemasi(S, 'light');
  await js(S, async () => { await __t.git('araclar'); window.scrollTo(0, 0); });
  await cek('mobil-araclar.webp');
  await ekranBoyu(S, 1280, 860, false);
  await js(S, async () => {
    await __t.git('alistirma'); __t.$('[data-tab="abc"]').click();
    for (let i = 0; i < 10; i++) { __t.$('[data-step="' + i + '"]').click(); __t.$('[data-show="abc"]').click(); __t.doldur('abc', __t.cozum('abc')); __t.$('[data-check="abc"]').click(); }
    const h = __t.$$('#pracBody h2').find((x) => x.textContent === 'Büyük defter'); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 24);
  });
  await cek('masaustu-defter.webp');
  await js(S, async () => { await __t.git('notlar'); window.scrollTo(0, 0); });
  await cek('masaustu-notlar.webp');
  await ekranBoyu(S, 390, 844, true);
  return yazilan;
}

/* ---------- 6. ÇALIŞTIR ---------- */
let SUNUCU = null, PORT = 0;
async function ana() {
  const bas = Date.now();
  SUNUCU = await sunucuAc(); PORT = SUNUCU.port;
  TABAN = 'http://127.0.0.1:' + PORT + '/index.html';
  const t = await tarayiciBaslat();
  S = t.s;
  S.dinleyiciler.add((m, p) => {
    if (m === 'Runtime.exceptionThrown') HATALAR.push('İstisna: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    if (m === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) HATALAR.push('Konsol (' + p.type + '): ' + p.args.map((a) => a.value ?? a.description).join(' '));
    if (m === 'Log.entryAdded' && (p.entry.level === 'error' || p.entry.level === 'warning')) HATALAR.push('Tarayıcı (' + p.entry.level + '): ' + p.entry.text + (p.entry.url ? ' ' + p.entry.url : ''));
  });
  await S.gonder('Page.enable'); await S.gonder('Runtime.enable'); await S.gonder('Log.enable');
  await ekranBoyu(S, 390, 844, true); await renkSemasi(S, 'light');
  console.log('Mizan tarayıcı testi\n' + tarayiciYolu() + '\n');
  let gecen = 0; const kalan = [];
  const secili = arg('--yalniz') ? testler.filter((x) => x.ad.toLocaleLowerCase('tr').includes(arg('--yalniz').toLocaleLowerCase('tr'))) : testler;
  try {
    if (secili.length < testler.length) { await ac(S, 'ozet'); hatalariAl(); }
    for (const x of secili) {
      const t0 = Date.now();
      try { const not = await x.fn(); gecen++; console.log('  ✓ ' + x.ad + (not ? ' — ' + not : '') + ' (' + (Date.now() - t0) + ' ms)'); }
      catch (e) { kalan.push(x.ad); console.log('  ✗ ' + x.ad + '\n      ' + String(e.message).replace(/\n/g, '\n      ')); }
    }
    if (EKRAN_DIZINI && !kalan.length) {
      const yazilan = await ekranGoruntuleri(resolve(KOK, EKRAN_DIZINI));
      console.log('\nEkran görüntüleri (' + EKRAN_DIZINI + '): ' + yazilan.join(', '));
    }
  } finally {
    try { S.ws.close(); } catch { /* kapalı */ }
    t.proc.kill(); await sleep(500);
    await rm(t.profil, { recursive: true, force: true }).catch(() => {});
    await SUNUCU.kapat();
  }
  console.log('\n' + gecen + '/' + secili.length + ' test geçti · ' + ((Date.now() - bas) / 1000).toFixed(1) + ' sn' + (kalan.length ? '\nBaşarısız: ' + kalan.join(', ') : ''));
  process.exitCode = kalan.length ? 1 : 0;
}
ana().catch((e) => { console.error('Test çalıştırılamadı: ' + e.message); process.exitCode = 1; });
