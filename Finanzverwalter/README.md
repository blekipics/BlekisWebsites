# Sparplan (PWA, verschlüsselt)

## Online stellen (kostenlos, ca. 5 Minuten)
1. Cloudflare Pages (oder Netlify) -> "Direct Upload" / "Drag & Drop".
2. Den ganzen Ordner hochladen (inkl. `_headers`, das setzt die Sicherheits-Header).
3. Die https-URL auf dem iPhone in Safari öffnen -> Teilen -> "Zum Home-Bildschirm".
4. Beim ersten Start Passphrase wählen (mind. 12 Zeichen, besser 4-5 Wörter).

HTTPS ist Pflicht, sonst funktioniert die Verschlüsselung (WebCrypto) nicht.
Lokal testen am PC: `python -m http.server 8000` -> http://localhost:8000

## Wichtig
- Daten liegen verschlüsselt NUR im Browser-Speicher des jeweiligen Geräts.
- Regelmässig unter Mehr -> "Verschlüsselte Sicherung exportieren".
- Passphrase vergessen = Daten weg (gewollt, es gibt keine Hintertür).
