"""TOGÜ akademik takvim sayfasını denetler.

Yeni bir eğitim yılının takvimi yayımlandıysa ya da sitede kullanılan yılın PDF'i
değiştiyse bir rapor üretir. Tarihleri siteye kendisi yazmaz: TOGÜ PDF'lerinin
fontları bozuk kodlandığı için tarihler bir insan tarafından kontrol edilmeden
yayımlanmaz. Rapor, GitHub Actions'ta issue gövdesi olarak kullanılır.

Kullanım:
    python tools/takvim_kontrol.py                 # denetle, raporu ekrana yaz
    python tools/takvim_kontrol.py --rapor r.md    # raporu dosyaya yaz
    python tools/takvim_kontrol.py --kaydet        # sitedeki yılların PDF durumunu kaydet

Çıkış kodu: 0 değişiklik yok, 10 güncelleme gerekiyor, 1 hata.
Yalnızca Python standart kütüphanesi kullanılır.
"""
import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
import zlib
from datetime import date
from pathlib import Path

LISTE_URL = 'https://ogr.gop.edu.tr/Icerik.aspx?d=tr-tr&mk=36710&m=akademik_takvim'
TABAN_URL = 'https://ogr.gop.edu.tr/'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
KOK = Path(__file__).resolve().parent.parent


# ---------- 1. AĞ ----------
def istek(url, method='GET', deneme=3):
    son_hata = None
    for _ in range(deneme):
        try:
            req = urllib.request.Request(url, method=method, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, dict(r.headers), (r.read() if method == 'GET' else b'')
        except Exception as e:  # ağ hatasında yeniden dene
            son_hata = e
    raise RuntimeError(f'{url} alınamadı: {son_hata}')


def takvim_baglantilari():
    """Sayfadaki 'YYYY-YYYY Eğitim Öğretim Yılı Akademik Takvimleri' bağlantılarını döndürür."""
    _, _, govde = istek(LISTE_URL)
    html = govde.decode('utf-8', 'replace')
    sonuc = {}
    for href, metin in re.findall(r'<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)</a>', html, re.I):
        metin = re.sub(r'<[^>]+>', ' ', metin)
        metin = re.sub(r'\s+', ' ', metin).strip()
        m = re.search(r'(\d{4})\s*-\s*(\d{4})\s+Eğitim[\s-]*Öğretim Yılı Akademik Takvim', metin, re.I)
        if m:
            yil = f'{m.group(1)}-{m.group(2)}'
            sonuc.setdefault(yil, urllib.parse.urljoin(TABAN_URL, href.replace('&amp;', '&')))
    if not sonuc:
        raise RuntimeError('Takvim sayfasında hiç yıllık takvim bağlantısı bulunamadı; sayfa yapısı değişmiş olabilir.')
    return sonuc


def pdf_durumu(url):
    _, h, _ = istek(url, method='HEAD')
    return {'url': url, 'last_modified': h.get('Last-Modified', ''), 'etag': h.get('ETag', ''), 'boyut': h.get('Content-Length', '')}


# ---------- 2. SİTE VE DURUM DOSYASI ----------
def sitedeki_yillar(index_yolu):
    metin = Path(index_yolu).read_text(encoding='utf-8')
    blok = metin.split('const TAKVIMLER = {', 1)
    if len(blok) < 2:
        raise RuntimeError('index.html içinde TAKVIMLER bulunamadı.')
    return sorted(set(re.findall(r"^\s*'(\d{4}-\d{4})':\s*\{", blok[1].split('const TERM_LABEL', 1)[0], re.M)))


def durum_oku(yol):
    try:
        return json.loads(Path(yol).read_text(encoding='utf-8'))
    except FileNotFoundError:
        return {}


# ---------- 3. PDF METNİ (TOGÜ PDF'lerindeki font sorunlarına göre) ----------
GLIF_TR = {98: 'Ä', 100: 'Ç', 103: 'Ö', 104: 'Ü', 108: 'ä', 111: 'ç', 124: 'ö', 129: 'ü', 178: '–', 179: '—',
           180: '“', 181: '”', 182: '’', 183: '’', 213: 'ı', 246: 'Ğ', 247: 'ğ', 248: 'İ', 249: 'Ş', 250: 'ş'}
RAKAM = str.maketrans('íîïðñòóôõì', '1234567890')


def pdf_metni(veri, sayfa_sayisi=1):
    """Word çıktısı PDF'lerden kaba metin çıkarır. Mükemmel değildir; tarihleri okumaya yeter."""
    nesne = {int(m.group(1)): m.group(2) for m in re.finditer(rb'(\d+)\s+0\s+obj(.*?)endobj', veri, re.S)}

    def akis(b):
        m = re.search(rb'stream\r?\n', b)
        if not m:
            return b''
        ham = b[m.end():]
        ham = ham[:ham.rfind(b'endstream')]
        if b'/FlateDecode' in b[:m.start()]:
            try:
                return zlib.decompressobj().decompress(ham)
            except Exception:
                return b''
        return ham

    def ref(b, k):
        m = re.search(rb'/' + k + rb'\s+(\d+)\s+0\s+R', b)
        return int(m.group(1)) if m else None

    def cmap(s):
        c = {}
        for blk in re.findall(rb'beginbfchar(.*?)endbfchar', s, re.S):
            for a, b in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk):
                c[int(a, 16)] = bytes.fromhex(b.decode()).decode('utf-16-be', 'replace')
        for blk in re.findall(rb'beginbfrange(.*?)endbfrange', s, re.S):
            for a, b, d in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk):
                for i in range(int(b, 16) - int(a, 16) + 1):
                    c[int(a, 16) + i] = chr(int(d, 16) + i)
        return c

    fontlar = {}

    def font(no):
        if no not in fontlar:
            b = nesne.get(no, b'')
            tu = ref(b, rb'ToUnicode')
            fontlar[no] = (b'Identity-H' in b, cmap(akis(nesne[tu])) if tu in nesne else {})
        return fontlar[no]

    def coz(ham, f):
        iki, c = f
        if not c and ham and len(ham) % 2 == 0 and all(x == 0 for x in ham[0::2]):
            return ''.join(GLIF_TR.get(g, chr(g + 29) if 3 <= g <= 97 else '') for g in (int.from_bytes(ham[i:i + 2], 'big') for i in range(0, len(ham), 2)))
        kodlar = [int.from_bytes(ham[i:i + 2], 'big') for i in range(0, len(ham) - 1, 2)] if iki else list(ham)
        return ''.join(c.get(k, bytes([k]).decode('cp1252', 'replace') if k < 256 else '') for k in kodlar)

    def kacis(s):
        return re.sub(rb'\\([nrtbf()\\]|[0-7]{1,3})', lambda m: bytes([int(m.group(1), 8) & 255]) if m.group(1)[:1].isdigit() else {b'n': b'\n', b'r': b'\r', b't': b'\t', b'b': b'\b', b'f': b'\f'}.get(m.group(1), m.group(1)), s)

    tok = re.compile(rb'\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[|\]|/[^\s/\[\]()<>]+|[-+]?\d*\.?\d+|[A-Za-z\'"*]+', re.S)
    sifirla = {b'Tf', b'Td', b'TD', b'Tm', b'T*', b'Tj', b"'", b'"', b'TJ', b'BT', b'ET', b'cm', b're', b'f', b'q', b'Q', b'Do', b'gs', b'BDC', b'EMC'}
    sayfalar = [b for _, b in sorted(nesne.items()) if re.search(rb'/Type\s*/Page(?![s\w])', b)]
    cikti = []
    for b in sayfalar[:sayfa_sayisi]:
        res = nesne.get(ref(b, rb'Resources'), b) if ref(b, rb'Resources') else b
        fm = re.search(rb'/Font\s*(\d+)\s+0\s+R', res)
        fsoz = nesne.get(int(fm.group(1)), b'') if fm else (re.search(rb'/Font\s*<<(.*?)>>', res, re.S) or [b'', b''])[1]
        fharita = {k.decode('latin1'): int(v) for k, v in re.findall(rb'/([\w+.-]+)\s+(\d+)\s+0\s+R', fsoz or b'')}
        cm = re.search(rb'/Contents\s*\[(.*?)\]', b, re.S)
        refs = [int(x) for x in re.findall(rb'(\d+)\s+0\s+R', cm.group(1))] if cm else [ref(b, rb'Contents')]
        icerik = b'\n'.join(akis(nesne.get(r, b'')) for r in refs if r)
        f, yigin, y, tampon = (False, {}), [], None, []
        for t in tok.findall(icerik):
            if t == b'Tf' and len(yigin) >= 2 and yigin[-2].startswith(b'/'):
                no = fharita.get(yigin[-2][1:].decode('latin1'))
                f = font(no) if no else (False, {})
            elif t in (b'Td', b'TD') and len(yigin) >= 2:
                try:
                    tampon.append('\n' if float(yigin[-1]) != 0 else ' ')
                except ValueError:
                    pass
            elif t == b'Tm' and len(yigin) >= 6:
                try:
                    ny = round(float(yigin[-1]))
                    if y is not None and ny != y:
                        tampon.append('\n')
                    y = ny
                except ValueError:
                    pass
            elif t in (b'Tj', b"'", b'"', b'TJ'):
                for s in yigin:
                    if s.startswith(b'('):
                        tampon.append(coz(kacis(s[1:-1]), f))
                    elif s.startswith(b'<'):
                        tampon.append(coz(bytes.fromhex(re.sub(rb'\s', b'', s[1:-1]).decode()), f))
                    elif t == b'TJ' and re.fullmatch(rb'[-+]?\d*\.?\d+', s) and float(s) < -150:
                        tampon.append(' ')
            if t in sifirla:
                yigin = []
            elif t not in (b'[', b']'):
                yigin.append(t)
        metin = re.sub(r'[ \t]+', ' ', ''.join(tampon)).translate(RAKAM)
        cikti.append(re.sub(r'\n\s*\n+', '\n', metin))
    return '\n'.join(cikti)


# ---------- 4. RAPOR ----------
def rapor_yaz(yeni, degisen, baglantilar, site_yillari):
    bugun = date.today().isoformat()
    if yeni:
        baslik = f'Yeni akademik takvim: {yeni[-1]}'
    else:
        baslik = 'Akademik takvim PDF\'i değişti: ' + ', '.join(d['yil'] for d in degisen)
    satir = [f'# {baslik}', '', f'Denetim tarihi: {bugun}. Sitedeki yıllar: {", ".join(site_yillari)}.', '']
    for yil in yeni:
        satir += [f'## {yil} yayımlandı', '', f'PDF: {baglantilar[yil]}', '']
        try:
            _, _, veri = istek(baglantilar[yil])
            metin = pdf_metni(veri, 1)
            satir += ['İlk sayfanın (ön lisans ve lisans genel takvimi) kaba metni. Bazı harfler bozuk görünebilir; rakamlar çözüldü:', '', '```', '\n'.join(metin.splitlines()[:90]), '```', '']
        except Exception as e:
            satir += [f'PDF metni çıkarılamadı: {e}', '']
    for d in degisen:
        satir += [f'## {d["yil"]} PDF\'i değişti', '', f'PDF: {d["url"]}', f'- Önceki: Last-Modified `{d["onceki"].get("last_modified")}`, ETag `{d["onceki"].get("etag")}`',
                  f'- Şimdi: Last-Modified `{d["simdi"]["last_modified"]}`, ETag `{d["simdi"]["etag"]}`', '',
                  'Tarihlerden biri değişmiş olabilir. PDF\'i açıp `index.html` içindeki `TAKVIMLER` kaydıyla karşılaştır.', '']
    satir += ['## Yapılacaklar', '',
              '1. PDF\'in ilk sayfasındaki genel takvimi aç (ön lisans ve lisans).',
              '2. `index.html` içinde `TAKVIMLER` nesnesine yeni yılı ekle ya da mevcut yılı düzelt: haftaların pazartesileri, ara sınav, final, bütünleme, bayram haftaları ve `events`.',
              '3. Tarayıcıda `localStorage.setItem(\'mizan_tarih\', \'YYYY-AA-GG\')` ile birkaç günü dene, sonra `localStorage.removeItem(\'mizan_tarih\')`.',
              '4. `python tools/takvim_kontrol.py --kaydet` çalıştırıp `tools/takvim-durum.json` dosyasını da commit et.',
              '5. Bu issue\'yu kapat.', '']
    return baslik, '\n'.join(satir)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--index', default=str(KOK / 'index.html'))
    ap.add_argument('--durum', default=str(KOK / 'tools' / 'takvim-durum.json'))
    ap.add_argument('--rapor', help='raporu bu dosyaya yaz')
    ap.add_argument('--kaydet', action='store_true', help='sitedeki yılların PDF durumunu kaydet')
    ap.add_argument('--yillar', help='deneme için sitedeki yılları elle ver: 2025-2026,2026-2027')
    a = ap.parse_args()
    try:
        site_yillari = a.yillar.split(',') if a.yillar else sitedeki_yillar(a.index)
        baglantilar = takvim_baglantilari()
        durum = durum_oku(a.durum)

        if a.kaydet:
            for yil in site_yillari:
                if yil in baglantilar:
                    durum[yil] = {**pdf_durumu(baglantilar[yil]), 'denetim': date.today().isoformat()}
            Path(a.durum).write_text(json.dumps(durum, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
            print(f'Kaydedildi: {", ".join(y for y in site_yillari if y in durum)} -> {a.durum}')
            return 0

        son_site = max(site_yillari)
        yeni = sorted(y for y in baglantilar if y > son_site)
        degisen = []
        for yil in site_yillari:
            if yil in baglantilar and yil in durum:
                simdi = pdf_durumu(baglantilar[yil])
                onceki = durum[yil]
                if (simdi['etag'] and simdi['etag'] != onceki.get('etag')) or (simdi['last_modified'] and simdi['last_modified'] != onceki.get('last_modified')):
                    degisen.append({'yil': yil, 'url': baglantilar[yil], 'onceki': onceki, 'simdi': simdi})

        print(f'TOGÜ sayfasındaki yıllar: {", ".join(sorted(baglantilar))}')
        print(f'Sitedeki yıllar: {", ".join(site_yillari)}')
        if not yeni and not degisen:
            print('Değişiklik yok.')
            return 0
        baslik, govde = rapor_yaz(yeni, degisen, baglantilar, site_yillari)
        if a.rapor:
            Path(a.rapor).write_text(govde, encoding='utf-8', newline='\n')
            print(f'Güncelleme gerekiyor: {baslik} (rapor: {a.rapor})')
        else:
            print(govde)
        return 10
    except Exception as e:
        print(f'HATA: {e}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
