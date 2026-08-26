# Wenable.se – Claude-kontext
> Starta Claude Code i denna katalog (`~/Utveckling/Wenable.se`) för allt arbete med webbplatsen.
> Detta är ett **eget projekt**, skilt från Home Assistant-kontexten.

Publik marknadsföringssajt för **Wenable Consulting AB** (specialistkonsulter inom AI & cybersäkerhet, Göteborg). Statisk HTML/CSS/JS byggd med Claude Design, med admin-inloggning + uppdragshantering via Supabase.

---

## Drift & hosting

| Del | Detalj |
|-----|--------|
| **Repo** | https://github.com/wenablese/wenable.se (publikt), remote `origin`, gren `main` |
| **Hosting** | GitHub Pages (Deploy from branch: `main` / root). **Ingen byggsteg** – ren statisk HTML |
| **Domän** | wenable.se, registrerad hos **STRATO** (DNS hanteras i STRATOs panel) |
| **HTTPS** | Let's Encrypt, utfärdas automatiskt av GitHub. Enforce HTTPS på |
| **Deploy** | `git push origin main` → Pages bygger om automatiskt (~1 min). Inget mer behövs |

### DNS hos STRATO (så här är det satt)
| Typ | Namn | Värde |
|-----|------|-------|
| A | `@` | `185.199.108.153` (GitHub Pages) |
| AAAA | `@` | `2606:50c0:8000::153` |
| CNAME | `www` | `wenablese.github.io.` |
| CNAME | `autodiscover` | `autodiscover.outlook.com.` — **Microsoft 365-e-post, RÖR EJ** |

Filen `CNAME` i repot (`wenable.se`) binder domänen till Pages – ta inte bort den.

---

## Struktur

```
index.html                 Startsida (roterande rubrik "Vi förverkligar …")
For Clients.html           För kunder (tjänster, arbetssätt, FAQ)
For Consultants.html       För konsulter (nätverk, FAQ)
Wenable are us.html        Teamet (PLACEHOLDER-personer, byts ut mot riktiga)
Wenable CV.html            CV-mall (demo: Erik Lindqvist)
assignments.html           Uppdrag (Supabase-drivet, admin-login)
assets/
  wenable.css, site.css    Sidstilar (mycket CSS ligger även inline i <style> per sida)
  admin.js                 Login + uppdrag-CRUD mot Supabase (se nedan)
  i18n.js                  Språkväxling SV/EN (se nedan)
  bg-network.js            Animerad bakgrund (canvas)
  vendor/supabase.js       Supabase-JS, VENDORAT lokalt (global window.supabase)
CNAME, DEPLOY.md           Pages-domän + driftsättningsguide
```

---

## Tvåspråkighet (i18n) – VIKTIGT arbetsmönster

Engelska är **standardtexten** i HTML:en. Svenskan ligger i `data-sv`-attribut och växlas av `i18n.js` när användaren klickar SV/EN.

```html
<h2 data-sv="Svensk text">English text</h2>
<input data-sv-attr-placeholder="Svensk platshållare" placeholder="English placeholder">
```

- **Ändra svenska** → redigera `data-sv`-attributet.
- **Ändra engelska** → redigera elementets synliga text (och kontrollera att `data-sv` fortfarande stämmer).
- Håll siffror/fakta i synk mellan SV och EN. Bolaget är **Göteborg**-baserat (ej Stockholm – en sådan felöversättning har redan rättats en gång).
- Undvik "calque" (direktöversatt engelska) i svenskan – skriv idiomatiskt.

---

## Admin-login + uppdrag (Supabase)

Statisk sajt kan inte ha egen backend, så **Supabase** sköter inloggning + delad databas. All logik ligger i `assets/admin.js`.

### Supabase-projekt
- **URL:** `https://kvhfqedtjtlzrgmajuqq.supabase.co`
- **Nyckel i koden:** `sb_publishable_…` (publishable/anon) – ligger överst i `assets/admin.js`. **Säker att vara publik** eftersom RLS är på; ger bara läsning av uppdrag + skrivning som inloggad. Använd **ALDRIG** `service_role`/`sb_secret_…` i frontend.
- **Tabell:** `public.assignments`
  - kolumner: `id uuid`, `title`, `category` (`ai`|`cyber`|`it`), `status` (`open`|`filled`), `location`, `start`, `lede`, `work`, `ref`, `tags text[]`, `created_at`
  - **OBS:** kolumnerna `duration` och `rate` finns kvar i DB men är **borttagna ur UI** (formulär + visning). Oanvända, ofarliga.
- **RLS-policies:** public `select`; `authenticated` för `insert`/`update`/`delete`.
- **Auth:** en admin-användare (e-post + lösenord), självregistrering avstängd.

### Admin-flöde
Login-knapp i menyn → logga in med Supabase-admin (e-post + lösenord) → på `assignments.html` visas **Lägg till / Redigera / Ta bort**. Uppdrag sparas i Supabase och syns direkt för alla. Uppdrag hanteras via **live-sajten**, inte i kod.

### Återställa/bekräfta admin-konto (Supabase SQL Editor)
```sql
-- nytt lösenord (utan e-postutskick):
update auth.users set encrypted_password = crypt('nytt-lösenord', gen_salt('bf'))
where email = 'admin@…';
-- bekräfta konto (om "Email not confirmed"):
update auth.users set email_confirmed_at = now() where email = 'admin@…';
```

### admin.js – hur det hänger ihop
- Laddar vendorad `assets/vendor/supabase.js` (global `window.supabase.createClient`) och skapar klienten från `SUPABASE_URL` + `SUPABASE_ANON_KEY` överst i filen.
- Bygger login-modal (e-post/lösenord), nav-login-kontroll, och på uppdragssidan add/edit-modal + rendering av uppdrag i den befintliga `.assign-list` / `.assign-detail-stage`.
- **Tomtillstånd:** `body.wadm-has-assignments` (sätts av admin.js när det finns uppdrag) växlar mellan "Nya uppdrag kommer inom kort" (0 st) och "Välj ett uppdrag i listan" (>0). CSS styr vilket som visas.
- Redigering återanvänder add-modalen (läge växlas via `#wadm-add-mode`/`#wadm-add-submit`, `editingId`).

---

## CSP (Content Security Policy) – VIKTIGT

`For Clients.html`, `For Consultants.html` och `assignments.html` har en strikt CSP i `<meta>`:
`default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; …`

- Supabase-libben är därför **vendorad lokalt** (`assets/vendor/supabase.js`) så `script-src 'self'` räcker.
- `connect-src` är öppnad för `*.supabase.co` (REST + auth + realtime).
- **Lägger du till externa resurser (CDN, teckensnitt, API:er) måste CSP:n uppdateras** på dessa sidor, annars blockeras de tyst.

---

## Designprincip (uttalad av ägaren)

Så mycket **statisk HTML/CSS som möjligt**, minimal JS → mindre attackyta. Den egentliga säkerhetsgränsen är **Supabase RLS** (serversidan), inte JS:en – därför är publik anon-nyckel + öppen källkod ofarligt. När en förändring kan göras i HTML/CSS i stället för JS, gör det.

---

## Fakta som återkommer

- **Telefon:** +46 70 635 25 24 (`tel:+46706352524`) – på flera sidor, håll i synk.
- **E-post:** `hello@wenable.se` (och `network@wenable.se` för konsultnätverket).
- **Adress / org:** Göteborg · Lindholmspiren 5A · Org.nr 559571-3164.
- **Personerna på "Wenable are us" är platshållare** – ska bytas mot riktiga.
- **E-post går via Microsoft 365** – `autodiscover`-CNAME:n hos STRATO ska vara kvar.

---

## Vanliga uppgifter

### Lokal förhandsvisning
```bash
cd ~/Utveckling/Wenable.se && python3 -m http.server 8000
```
Öppna `http://localhost:8000/…`. **OBS:** webbläsaren cachar hårt – lägg på `?v=N` som cache-buster när du testar CSS/JS-ändringar.

### Kolla JS-syntax utan Node (Node saknas ofta lokalt)
```bash
osascript -l JavaScript -e 'ObjC.import("Foundation"); \
  var s=$.NSString.alloc.initWithContentsOfFileEncodingError("'"$PWD"'/assets/admin.js",4,null).js; \
  try{ new Function(s); "PARSE_OK" }catch(e){ "ERR: "+e.message }'
```

### Deploy
```bash
git add -A && git commit -m "…" && git push origin main
```
Pages bygger om automatiskt (~1 min). Verifiera live med `curl -sI https://wenable.se`.

---

## Fallgropar

- **Filnamn med mellanslag** (`For Clients.html`, `Wenable are us.html`) – citera alltid i shell.
- **Browser-cache** vid lokal test – använd cache-buster (`?v=N`), inte bara reload.
- **Ändra inte** `autodiscover`-CNAME (e-post) eller `CNAME`-filen (domän).
- **`git` + iCloud krockar** – repot ligger därför i `~/Utveckling`, inte i iCloud-mappen. Håll det så.
- Uppdrags-demodata är borttaget; listan fylls enbart från Supabase.
