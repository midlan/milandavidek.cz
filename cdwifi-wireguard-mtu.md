# ČD WiFi (CDWiFi) Breaks WireGuard VPN — SSH Hangs, Git Fails

**Keywords:** české dráhy, CDWiFi, wifi, VPN, WireGuard, MTU

---

## The Problem

You board a Czech Railways (České dráhy) train, connect to **CDWiFi**, fire up your WireGuard VPN, and suddenly:

- SSH sessions hang immediately after connecting — you can't even `Ctrl+C` out
- `git clone git@github.com:...` hangs indefinitely
- Small commands (`echo test`) work fine, but anything that transfers real data freezes

It looks like a firewall or a broken `.bashrc`. It isn't.

## Root Cause

ČD WiFi silently drops IP packets larger than approximately **1398 bytes**. This is caused by extra encapsulation in their infrastructure (reportedly multi-carrier signal bonding on trains). The network doesn't reject oversized packets with an error — it just drops them, which is why everything appears to hang rather than fail cleanly.

WireGuard adds **~60 bytes of overhead** per packet (outer IP + UDP + WireGuard headers + auth tag). With the default WireGuard MTU of 1420, the outer packets reach **1480 bytes** — well above the 1398-byte limit. Large SSH data transfers and git operations hit this ceiling and vanish silently.

Small commands work because the TCP handshake and tiny responses fit within the limit. The session appears established, then hangs the moment real data flows.

> This is not a new discovery — brozkeff documented the same ČD WiFi MTU issue in 2024 with OpenVPN:
> **https://www.brozkeff.net/2024/08/09/wifi-ve-vlacich-cd-cdwifi-a-vpn-workaround-mtu-1398/**
> A 2026 update in that post notes that **Railjet trains require an even lower MTU (~1120 bytes)**.

## Diagnosing It Yourself

Run the appropriate command for your OS to find the working threshold. Replace `192.168.0.1` with the IP of any host behind your VPN.

**Windows — Git Bash**:
```bash
for s in 1400 1350 1300 1250 1200 1150; do echo "=== $s ==="; ping -n 5 -f -l $s 192.168.0.1; done
```

**Windows — Command Prompt (CMD)**:
```cmd
for %s in (1400 1350 1300 1250 1200 1150) do @(echo === %s === & ping -n 5 -f -l %s 192.168.0.1)
```

**Linux / macOS**:
```bash
for s in 1400 1350 1300 1250 1200 1150; do echo "=== $s ==="; ping -c 5 -M do -s $s 192.168.0.1; done
```

The highest size that gets consistent replies (most packets, not necessarily all) is your working payload MTU.

On ČD WiFi the threshold is around **1300 bytes** (ICMP payload), meaning the outer packet limit is ~1388 bytes — safely below the 1398-byte network ceiling once WireGuard overhead is accounted for.

On a normal home network the same test passes at 1350 bytes and above, confirming the issue is specific to the ČD WiFi path.

## The Fix — Low-MTU WireGuard Profile

Don't change your regular WireGuard config. Instead, create a **second tunnel profile** in the WireGuard app for use on unreliable networks:

1. Open the WireGuard app
2. Duplicate your existing tunnel (or add a new one with the same peer settings)
3. Name it something like `home-lowmtu`
4. In the `[Interface]` section, add:

```ini
MTU = 1280
```

Switch to this profile when connecting from trains or other networks with unusual MTU constraints. Your regular profile (MTU 1420) stays optimal for home and office use.

**Why 1280?** It's the IPv6 minimum MTU — a universally safe floor. With 60 bytes WireGuard overhead, outer packets are 1340 bytes, well under even the Railjet's ~1120-byte limit if you further lower it.

## Bonus: GitHub SSH on Port 443

If your WireGuard routes all traffic and GitHub SSH (port 22) is also broken, add this to `~/.ssh/config`:

```
Host github.com
    Hostname ssh.github.com
    Port 443
```

GitHub supports SSH over port 443 (`ssh.github.com`), which bypasses both port-22 blocking and the MTU issues that affect large handshake packets.

## Summary

| Symptom | Cause | Fix |
|---|---|---|
| SSH hangs, can't Ctrl+C | ČD WiFi drops packets >1398 bytes | WireGuard profile with `MTU = 1280` |
| `git clone` over SSH hangs | Same MTU issue | Same fix, or use HTTPS remotes |
| GitHub SSH fails | Port 22 blocked or MTU | `ssh.github.com` port 443 |
| Small commands work, large transfers don't | Classic MTU blackhole | Ping test to confirm, lower MTU |
