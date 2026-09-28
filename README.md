# Mizan

TOGÜ **Muhasebe ve Vergi Uygulamaları** (ön lisans) programına yeni başlayan öğrenci için ilk dönem uygulaması.
Ad, muhasebedeki borç = alacak kontrol tablosundan (mizan) ve "denge" anlamından geliyor.

`index.html` tek başına bütün uygulamadır: bağımlılık yok, derleme yok. Çift tıklayınca açılır. GitHub Pages'te yayımlanınca telefona uygulama olarak eklenebilir ve internetsiz çalışır.

## Bölümler

| Bölüm | İçerik |
|---|---|
| Özet | Bugünün tarihine göre dönem ve hafta, haftanın Genel Muhasebe I konusu, yaklaşan tarihler, çalışma durumu |
| Konu notları | Genel Muhasebe I'in 15 konusu: açıklamalar, tablolar, formüller, 45 örnek yevmiye kaydı; kampüse göre haftalık plan |
| Alıştırma | ABC Ticaret (10 kayıt, büyük defter ve mizan) ve 36 işlem türünden rastgele serbest alıştırma |
| Tekrar | 10 soruluk testler (45 soruluk banka + üretilen sorular) ve kartlar (hesap kodları, temel kavramlar, sözlük) |
| Hesap planı | İlk yıl derslerinde geçen 89 hesap; kod, grup, işleyiş, ilgili konu |
| Sözlük | 63 terim |
| Hesap araçları | Final notu, dönem ortalaması, KDV, basit faiz, kâr, amortisman tablosu |
| Takvim | Güz, bahar ve yaz okulu tarihleri; kontrol listesi |
| Dersler | Birinci yarıyıl dersleri, geçme ve mezuniyet koşulları |
| Ayarlar ve kaynaklar | Kampüs, tema (cihaz / açık / koyu), verileri sıfırlama, kaynaklar, veri denetimi |

## Dosyalar

```
index.html                            uygulamanın tamamı
manifest.webmanifest                  telefona ekleme (PWA)
sw.js                                 çevrimdışı önbellek
icons/                                uygulama ikonları (tools/ikon_uret.py üretir)
tools/takvim_kontrol.py               TOGÜ takvim sayfasını denetler
tools/takvim-durum.json               sitedeki yılların PDF durumu (Last-Modified, ETag)
tools/ikon_uret.py                    ikonları yeniden üretir
.github/workflows/takvim-kontrol.yml  haftalık takvim denetimi; gerekirse issue açar
.nojekyll                             GitHub Pages dosyaları olduğu gibi sunsun
```

Python betikleri yalnızca standart kütüphaneyi kullanır.

## GitHub Pages'te yayımlamak

1. GitHub'da `Mizan` adlı boş bir depo oluştur (README ekleme).
2. Üst klasördeki `2-Mizan-GitHuba-Gonder.bat` dosyasını çalıştır.
3. Depoda **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. Birkaç dakika sonra site `https://<kullanıcı-adı>.github.io/Mizan/` adresinde açılır. Telefonda tarayıcı menüsünden "Ana ekrana ekle" ile uygulama olarak kurulur.
5. **Actions** sekmesinde "Takvim kontrolü" iş akışını bir kez elle çalıştır.

## Takvim

- Takvim `index.html` içindeki `TAKVIMLER` nesnesinde, eğitim yılı başına bir kayıt olarak durur. Sayfa bugünün tarihine uyan yılı seçer; güz ve bahar haftalarını, ara sınav, final, bütünleme ve bayram haftalarını tanır. Eklenmiş son yılın süresi dolunca eski tarihleri göstermek yerine "Takvim güncel değil" der.
- Tarayıcı TOGÜ'den takvim çekemez: `ogr.gop.edu.tr` CORS başlığı göndermiyor. TOGÜ PDF'lerinin fontları da bozuk kodlanmış; tarihler bir insan kontrol etmeden yazılmaz.
- `takvim-kontrol.yml` her pazartesi TOGÜ'nün takvim sayfasını okur. Sitede olmayan bir yıl ya da mevcut yılın PDF'inde değişiklik görürse PDF'in çözülmüş ilk sayfasını içeren bir issue açar.
- GitHub, 60 gün commit almayan depolarda zamanlanmış iş akışlarını durdurur; durursa **Actions → Takvim kontrolü → Enable workflow**.

### Yeni yılı eklemek

1. Issue'daki PDF'in ilk sayfasını (ön lisans ve lisans genel takvimi) aç.
2. `TAKVIMLER` içine yeni yılı ekle: `start`/`end`; güz ve bahar için ders haftalarının pazartesileri (`weeks`, 14 hafta; ara sınav ve bayram haftaları atlanır), `midterm`, `finals`, `makeup`, `breaks`, `events`. Kontrol: 14. haftanın cuması takvimdeki "Derslerin bitimi" tarihine denk gelmeli.
3. Yılın PDF'i için `SOURCES` içine kayıt ekle ve yılın `src` alanını ona bağla.
4. Dene: tarayıcı konsolunda `localStorage.setItem('mizan_tarih', '2027-11-18')`, sayfayı yenile (Özet'te "deneme tarihi" yazar). Bitince `localStorage.removeItem('mizan_tarih')`.
5. **Ayarlar ve kaynaklar → Veri denetimi** bölümündeki bütün maddeler "Geçti" olmalı.
6. `python tools/takvim_kontrol.py --kaydet` çalıştır; `sw.js` içindeki `CACHE` sürümünü artır; commit et, issue'yu kapat.

Program kılavuzları (haftalık konular) için otomatik denetim yok; yeni izlence yayımlanınca `CAMPUS.*.weeks` elle güncellenir.

## Kararlar

- **Kampüs katmanı.** Kampüse göre değişen bilgiler (ders kodu, not dağılımı, haftalık sıra ve konular, kaynak kitap) `CAMPUS` nesnesinde. Şu an Tokat merkez ve Niksar.
- **KDV güncel oranla.** Tokat 2025-2026 kılavuzundaki çözümlü örnek %18 ve %8 kullanıyor; 7346 sayılı Cumhurbaşkanı Kararı ile 10.07.2023'ten beri %20 ve %10. Bütün alıştırmalar %20 ile; denetim eski oranı ayrıca yakalar.
- **İçerik kaynağa dayanır.** Mevzuat bilgileri kanun metninden okundu: VUK m. 176, 182, 219, 231, 234–236, 315, mük. 315; 3568 m. 5–6. Hesap adları iki ayrı hesap planı listesiyle karşılaştırıldı. Temel kavramlar MSUGT'deki 12 kavramdır.
- **Serbest alıştırmada puan.** İlk geçerli deneme sayılır; çözüm önce açıldıysa doğru sayılmaz.
- **Saklama** `localStorage`, `mizan_` önekli: `campus`, `tema`, `abc`, `abcIndex`, `pratik`, `pratikSekme`, `quiz`, `kartlar`, `deste`, `tekrarSekme`, `gno`, `checks` (anahtar `yıl:olay`), `tarih` (yalnızca deneme). Her okuma `try/catch` ve tür denetimiyle; bozuk kayıt yok sayılır.

## Doğrulama

Test paketi yok; denetimler uygulamanın içinde:

1. `python -m http.server 8765` ile aç, konsolda hata olmadığını gör.
2. **Ayarlar ve kaynaklar → Veri denetimi**: 13 madde. Hesap planı, 45 örnek kayıt, ABC kayıtları ve KDV mahsubu, 36 şablondan 1.080 örnek, soru bankası, üretilen sorular, takvim ve kampüs planları denetlenir.
3. ABC Ticaret'in on kaydını çözümle gir: mizan denk çıkmalı.
4. Deneme tarihiyle güz haftası, ara sınav, bayram, bahar ve takvim sonrası bir gün dene.
5. `python tools/takvim_kontrol.py` → "Değişiklik yok" (çıkış 0). `--yillar 2025-2026` ile yeni yıl benzetimi → çıkış 10 ve rapor.

## TOGÜ PDF'lerini okumak

Kılavuzlar Word 2013 çıktısı; bazı gömülü fontlarda ToUnicode tablosu yok.
- Arial/Times alt kümeleri 2 baytlık glif numarası taşır: ASCII için `karakter = glif + 29`; Türkçe: 213 ı, 247 ğ, 248 İ, 249 Ş, 250 ş, 100 Ç, 111 ç, 103 Ö, 124 ö, 104 Ü, 129 ü.
- Calibri tabanlı parçalarda rakamlar `í î ï ð ñ ò ó ô õ ì` = `1 2 3 4 5 6 7 8 9 0` olarak görünür.
- `tools/takvim_kontrol.py` içindeki `pdf_metni()` ikisini de uygular.
