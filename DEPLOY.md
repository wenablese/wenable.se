# Wenable — driftsättning (GitHub Pages + Supabase + STRATO)

Sajten är statisk HTML. Login och uppdrag är nu kopplade till **Supabase**
(riktig serververifierad inloggning + delad databas), medan själva sajten
hostas gratis på **GitHub Pages** under domänen **wenable.se** (registrerad hos STRATO).

Arkitektur:

```
STRATO (domän + DNS)  ──►  GitHub Pages (statisk sajt)  ──►  Supabase (Auth + databas)
```

All inloggning och datalagring sker i webbläsaren direkt mot Supabase, så GitHub
Pages behöver aldrig köra serverkod. Admin loggar in → publicerar uppdrag → de syns
för alla besökare (läses från Supabase).

---

## 1. Supabase — engångsuppsättning (~10 min)

### 1.1 Skapa projekt
1. Gå till https://supabase.com → **New project** (gratisnivån räcker).
2. Välj region **Europe (Frankfurt/Stockholm)** för bäst latens.
3. Vänta tills projektet är klart.

### 1.2 Skapa tabell + säkerhetsregler
Öppna **SQL Editor** → **New query**, klistra in och kör:

```sql
-- Tabell för uppdrag
create table public.assignments (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  category   text not null default 'it',   -- 'ai' | 'cyber' | 'it'
  status     text not null default 'open', -- 'open' | 'filled'
  location   text,
  duration   text,
  start      text,
  rate       text,
  lede       text,
  work       text,
  ref        text,
  tags       text[] default '{}',
  created_at timestamptz not null default now()
);

-- Row Level Security PÅ (utan detta kan vem som helst skriva!)
alter table public.assignments enable row level security;

-- Alla (även utloggade besökare) får LÄSA
create policy "public read" on public.assignments
  for select using (true);

-- Endast inloggade får SKRIVA / ÄNDRA / TA BORT
create policy "auth insert" on public.assignments
  for insert to authenticated with check (true);
create policy "auth update" on public.assignments
  for update to authenticated using (true) with check (true);
create policy "auth delete" on public.assignments
  for delete to authenticated using (true);
```

### 1.3 Skapa admin-användaren
1. **Authentication → Users → Add user**.
2. Ange admins **e-post** + **lösenord**.
3. Kryssa i **Auto Confirm User** (annars kan hen inte logga in direkt).

### 1.4 Stäng av självregistrering (viktigt)
**Authentication → Sign In / Providers → Email** → stäng av **"Allow new users
to sign up"**. Då kan bara den användare du skapat manuellt logga in.

### 1.5 Hämta nycklarna
**Project Settings → API**:
- **Project URL** (t.ex. `https://abcd1234.supabase.co`)
- **anon public**-nyckeln (lång `eyJ...`-sträng)

> Anon-nyckeln är säker att ha i frontend-koden **så länge RLS är påslaget** (steg 1.2).
> Den ger bara de rättigheter som dina policies tillåter — läsa allt, skriva bara som inloggad.

---

## 2. Fyll i nycklarna i koden

Öppna `assets/admin.js` och ändra de tre översta raderna i CONFIG-blocket:

```js
var SUPABASE_URL      = "https://abcd1234.supabase.co";   // din Project URL
var SUPABASE_ANON_KEY = "eyJhbGciOi...";                  // din anon public-nyckel
var TABLE             = "assignments";                    // lämna som den är
```

Klart. Ingen annan kod behöver röras.

---

## 3. Publicera på GitHub Pages

### 3.1 Lägg upp koden
Kör i den här mappen (där `index.html` ligger):

```bash
git init
git add .
git commit -m "Wenable site + Supabase-kopplad admin"
```

Skapa ett repo på github.com (t.ex. `wenable-site`) och pusha:

```bash
git remote add origin https://github.com/DITT-KONTO/wenable-site.git
git branch -M main
git push -u origin main
```

### 3.2 Slå på Pages
På github.com → repo → **Settings → Pages**:
- **Source:** *Deploy from a branch*
- **Branch:** `main` / `(root)` → **Save**

Sajten blir live på `https://DITT-KONTO.github.io/wenable-site/` inom ~1 min.

### 3.3 Koppla domänen
1. Filen `CNAME` (finns redan i repot, innehåller `wenable.se`) talar om för GitHub
   vilken domän som gäller. Ändra innehållet om du vill använda `www.wenable.se` istället.
2. **Settings → Pages → Custom domain:** skriv `wenable.se` → **Save**.
3. Kryssa i **Enforce HTTPS** (blir valbart när DNS pekar rätt; certifikatet kan ta upp
   till ~24 h).

---

## 4. STRATO — DNS för wenable.se

Du valde att behålla STRATO:s DNS. I STRATO:s kundpanel → **Domän → DNS-inställningar**
för wenable.se, sätt:

| Typ   | Namn / Host | Värde                        |
|-------|-------------|------------------------------|
| A     | `@`         | `185.199.108.153`            |
| A     | `@`         | `185.199.109.153`            |
| A     | `@`         | `185.199.110.153`            |
| A     | `@`         | `185.199.111.153`            |
| CNAME | `www`       | `DITT-KONTO.github.io`       |

- `@` = själva roten (wenable.se). Alla fyra A-posterna ska finnas (GitHubs fyra IP-adresser).
- Ta bort ev. gamla A/AAAA-poster på `@` som pekar på STRATO:s parkeringssida.
- DNS-ändringar slår igenom inom några minuter till några timmar.

Verifiera när det spridit sig:

```bash
dig +short wenable.se
dig +short www.wenable.se
```

A-posterna ska returnera GitHub-IP:na ovan.

---

## 5. Så fungerar det efteråt

- **Besökare** ser uppdragslistan (läses live från Supabase).
- **Admin** klickar **Login** i menyn → loggar in med e-post + lösenord →
  ett **"Lägg till uppdrag"**-fält dyker upp på `assignments.html`.
- Publicerade uppdrag sparas i Supabase och syns direkt för alla.
- Varje uppdrag har **Redigera**- och **Ta bort**-knappar (visas endast för inloggad admin).
  Redigera öppnar samma formulär förifyllt; "Spara ändringar" uppdaterar posten i Supabase.

### Om något inte funkar
Öppna webbläsarens konsol (F12). Vanliga fel:
- `[wenable] Supabase är inte konfigurerat…` → nycklarna i steg 2 är inte ifyllda.
- `ERR_NAME_NOT_RESOLVED` mot `DITT-PROJEKT.supabase.co` → fel/oifylld Project URL.
- Login nekas → kontrollera att användaren är **Auto Confirmed** (steg 1.3).
- Kan inte publicera (RLS-fel) → kör om SQL:en i steg 1.2, kontrollera att policies finns.

---

## Noteringar

- De **8 inbyggda demo-uppdragen är borttagna** ur `assignments.html` — listan fylls nu
  enbart från Supabase. Tomtillståndet ("Välj ett uppdrag …") visas tills det finns uppdrag.
  En backup av original-HTML:en finns i `assignments.html.bak-demo` (committas inte, se `.gitignore`).
- Supabase-biblioteket är **vendorat lokalt** i `assets/vendor/supabase.js` så att den
  strikta CSP:n (`script-src 'self'`) inte behöver släppa in externa skript. Uppdatera
  det bara om du vill ha en nyare version.
- CSP:n på `assignments.html`, `For Clients.html` och `For Consultants.html` har fått
  `connect-src` utökad för `*.supabase.co` — det behövs för att nå API:t.
```
