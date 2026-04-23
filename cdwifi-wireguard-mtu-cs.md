# CDWiFi rozbíjí WireGuard VPN — SSH se zasekne, Git nefunguje

**Klíčová slova:** české dráhy, CDWiFi, wifi, VPN, WireGuard, MTU

---

## Problém

Nastoupíte do vlaku Českých drah, připojíte se na **CDWiFi**, spustíte WireGuard VPN a najednou:

- SSH session se okamžitě zasekne — ani `Ctrl+C` nepomůže
- `git clone git@github.com:...` visí donekonečna
- Malé příkazy (`echo test`) fungují, ale cokoliv co přenáší víc dat zamrzne

Vypadá to jako firewall nebo rozbitý `.bashrc`. Není.

## Příčina

CDWiFi tiše zahazuje IP pakety větší než přibližně **1398 bytů**. Důvodem je pravděpodobně extra zapouzdření v jejich infrastruktuře (bonding více operátorských signálů ve vlaku). Síť odmítnuté pakety neohlásí chybou — prostě je zahodí. Proto vše vypadá jako zaseknutí, nikoli jako chyba.

WireGuard přidává ke každému paketu **~60 bytů režie** (vnější IP + UDP + WireGuard hlavičky + autentizační tag). Při výchozím MTU WireGuardu 1420 bytů dosahují vnější pakety **1480 bytů** — výrazně nad limit 1398 bytů. Velké SSH přenosy a git operace tento strop překročí a tiše zmizí.

Malé příkazy fungují, protože TCP handshake a krátké odpovědi se do limitu vejdou. Spojení vypadá jako navázané, pak se zasekne ve chvíli, kdy začnou téct skutečná data.

> Toto není nový objev — brozkeff zdokumentoval stejný problém s CDWiFi a MTU v roce 2024 pro OpenVPN:
> **https://www.brozkeff.net/2024/08/09/wifi-ve-vlacich-cd-cdwifi-a-vpn-workaround-mtu-1398/**
> Aktualizace z roku 2026 v tom článku uvádí, že **vlaky Railjet vyžadují ještě nižší MTU (~1120 bytů)**.

## Jak to diagnostikovat

Spusťte příkaz odpovídající vašemu operačnímu systému. Nahraďte `192.168.0.1` IP adresou libovolného hostitele za vaší VPN.

**Windows — Git Bash**:
```bash
for s in 1400 1350 1300 1250 1200 1150; do echo "=== $s ==="; ping -n 5 -f -l $s 192.168.0.1; done
```

**Windows — Příkazový řádek (CMD)**:
```cmd
for %s in (1400 1350 1300 1250 1200 1150) do @(echo === %s === & ping -n 5 -f -l %s 192.168.0.1)
```

**Linux / macOS**:
```bash
for s in 1400 1350 1300 1250 1200 1150; do echo "=== $s ==="; ping -c 5 -M do -s $s 192.168.0.1; done
```

Nejvyšší velikost, při které dostáváte konzistentní odpovědi (většina paketů projde, ne nutně všechny), je váš funkční MTU.

Na CDWiFi je práh přibližně **1300 bytů** (ICMP payload), tedy limit vnějšího paketu ~1388 bytů — bezpečně pod limitem 1398 bytů sítě po přičtení režie WireGuardu.

Na normální domácí síti test projde i na 1350 bytů a výš, což potvrzuje, že problém je specifický pro cestu přes CDWiFi.

## Řešení — WireGuard profil s nízkým MTU

Neměňte svůj stávající WireGuard profil. Místo toho si vytvořte **druhý tunelový profil** v aplikaci WireGuard pro použití na nespolehlivých sítích:

1. Otevřete aplikaci WireGuard
2. Duplikujte existující tunel (nebo přidejte nový se stejným nastavením peera)
3. Pojmenujte ho např. `home-lowmtu`
4. V sekci `[Interface]` přidejte:

```ini
MTU = 1280
```

Na tento profil přepněte při připojení z vlaku nebo jiných sítí s nestandardním MTU. Váš běžný profil (MTU 1420) zůstane optimální pro domácí a kancelářské použití.

**Proč 1280?** Je to minimální MTU pro IPv6 — univerzálně bezpečné minimum. S 60 byty režie WireGuardu jsou vnější pakety 1340 bytů, výrazně pod limitem i pro vlaky Railjet.

## Bonus: GitHub SSH přes port 443

Pokud váš WireGuard přesměrovává veškerý provoz a GitHub SSH (port 22) také nefunguje, přidejte do `~/.ssh/config`:

```
Host github.com
    Hostname ssh.github.com
    Port 443
```

GitHub podporuje SSH přes port 443 (`ssh.github.com`), což obejde jak blokování portu 22, tak MTU problémy při SSH handshaku.

## Shrnutí

| Příznak | Příčina | Řešení |
|---|---|---|
| SSH se zasekne, nejde Ctrl+C | CDWiFi zahazuje pakety >1398 bytů | WireGuard profil s `MTU = 1280` |
| `git clone` přes SSH visí | Stejný MTU problém | Stejné řešení, nebo použít HTTPS |
| GitHub SSH nefunguje | Port 22 blokován nebo MTU | `ssh.github.com` port 443 |
| Malé příkazy fungují, velké přenosy ne | Klasický MTU blackhole | Ping test pro ověření, snížit MTU |
