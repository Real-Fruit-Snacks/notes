"""Build-time port reference table.

Merges the vendored IANA service-names registry (``data/iana-ports.csv``,
trimmed to the well-known range plus curated registered ports) with a
hand-written overlay: a category per port, transport as *actually used*
(IANA registers both for nearly everything), and notes for the ports with
stories. Emitted as ``ports.json`` and rendered by the Port Reference tool.
"""
from __future__ import annotations

import csv
import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "iana-ports.csv"

CATEGORIES = {
    "web": "Web",
    "mail": "Mail",
    "file": "File transfer",
    "remote": "Remote access",
    "name": "Naming / DNS",
    "auth": "Auth / Directory",
    "db": "Databases",
    "msg": "Messaging / Queues",
    "voip": "VoIP / Media",
    "vpn": "VPN / Tunnels",
    "infra": "Net infrastructure",
    "windows": "Windows / AD",
    "print": "Printing",
    "game": "Games",
    "iot": "IoT / SCADA",
    "mon": "Monitoring",
    "dev": "Dev / Containers",
    "evil": "Notorious",
    "legacy": "Legacy",
    "other": "Other",
}

# Curated overlay. "proto" overrides IANA's register-everything-twice habit
# with how the port is used in practice; "note" is the story worth knowing.
# Registered ports (>1023) appear in the table ONLY if listed here.
OVERRIDES: dict[int, dict] = {
    0: {"cat": "other", "note": "Reserved — 'any port' in the sockets API; never travels on the wire."},
    7: {"cat": "legacy", "note": "RFC 862 debugging relic; long disabled by default."},
    9: {"cat": "legacy", "proto": "tcp/udp", "note": "Discard protocol — but UDP 9 is also a common Wake-on-LAN target."},
    13: {"cat": "legacy"},
    19: {"cat": "legacy", "note": "Chargen: historic DDoS amplification source — filter it."},
    20: {"cat": "file", "proto": "tcp", "note": "FTP data channel (active mode)."},
    21: {"cat": "file", "proto": "tcp", "note": "FTP control channel; credentials in cleartext."},
    22: {"cat": "remote", "proto": "tcp", "note": "SSH — also carries SCP, SFTP, and port forwarding."},
    23: {"cat": "remote", "proto": "tcp", "note": "Telnet: everything in cleartext. If it's open, that's a finding."},
    25: {"cat": "mail", "proto": "tcp", "note": "Server-to-server SMTP; client submission moved to 587."},
    37: {"cat": "legacy", "note": "Time protocol, superseded by NTP (123)."},
    43: {"cat": "name", "proto": "tcp"},
    49: {"cat": "auth", "proto": "tcp", "note": "TACACS+ device administration AAA."},
    53: {"cat": "name", "proto": "tcp/udp", "note": "DNS: UDP for queries, TCP for zone transfers and answers over 512/1232 bytes."},
    67: {"cat": "infra", "proto": "udp", "note": "DHCP server side."},
    68: {"cat": "infra", "proto": "udp", "note": "DHCP client side."},
    69: {"cat": "file", "proto": "udp", "note": "TFTP — no auth at all; the workhorse of PXE boot."},
    70: {"cat": "legacy"},
    79: {"cat": "legacy", "note": "finger — the 1988 Morris worm's friend."},
    80: {"cat": "web", "proto": "tcp", "note": "HTTP. Plain text; increasingly just a redirect to 443."},
    88: {"cat": "auth", "proto": "tcp/udp", "note": "Kerberos — the heart of Active Directory authentication."},
    110: {"cat": "mail", "proto": "tcp", "note": "POP3 cleartext; 995 is the TLS version."},
    111: {"cat": "infra", "proto": "tcp/udp", "note": "ONC RPC portmapper — fronts NFS and friends."},
    113: {"cat": "legacy", "note": "ident — IRC servers still probe it."},
    119: {"cat": "legacy", "note": "NNTP Usenet news."},
    123: {"cat": "infra", "proto": "udp", "note": "NTP. monlist abuse made it a top DDoS amplifier — patch or filter."},
    135: {"cat": "windows", "proto": "tcp", "note": "MS-RPC endpoint mapper; a classic lateral-movement door."},
    137: {"cat": "windows", "proto": "udp", "note": "NetBIOS name service."},
    138: {"cat": "windows", "proto": "udp", "note": "NetBIOS datagram."},
    139: {"cat": "windows", "proto": "tcp", "note": "NetBIOS session / SMB over NetBIOS."},
    143: {"cat": "mail", "proto": "tcp", "note": "IMAP cleartext; 993 is the TLS version."},
    161: {"cat": "mon", "proto": "udp", "note": "SNMP agent. 'public' community strings still leak whole networks."},
    162: {"cat": "mon", "proto": "udp", "note": "SNMP traps (agent → manager)."},
    179: {"cat": "infra", "proto": "tcp", "note": "BGP — the routing table of the internet rides on this."},
    194: {"cat": "msg", "proto": "tcp", "note": "IRC as registered; real servers mostly use 6667/6697."},
    389: {"cat": "auth", "proto": "tcp", "note": "LDAP cleartext/StartTLS; AD domain controllers listen here."},
    427: {"cat": "infra", "proto": "tcp/udp", "note": "Service Location Protocol; 2023's reflection-attack comeback."},
    443: {"cat": "web", "proto": "tcp/udp", "note": "HTTPS on TCP — and HTTP/3 (QUIC) on UDP 443."},
    445: {"cat": "windows", "proto": "tcp", "note": "SMB direct. EternalBlue/WannaCry's door; never expose to the internet."},
    464: {"cat": "auth", "proto": "tcp/udp", "note": "Kerberos kpasswd."},
    465: {"cat": "mail", "proto": "tcp", "note": "SMTP over implicit TLS (re-standardized for submission)."},
    500: {"cat": "vpn", "proto": "udp", "note": "IKE/ISAKMP for IPsec; pairs with UDP 4500 behind NAT."},
    514: {"cat": "mon", "proto": "tcp/udp", "note": "UDP: classic syslog. TCP: the old rsh. Same number, different worlds."},
    515: {"cat": "print", "proto": "tcp", "note": "LPD line printer daemon."},
    520: {"cat": "infra", "proto": "udp", "note": "RIP — distance-vector routing's elder."},
    521: {"cat": "infra", "proto": "udp", "note": "RIPng for IPv6."},
    546: {"cat": "infra", "proto": "udp", "note": "DHCPv6 client."},
    547: {"cat": "infra", "proto": "udp", "note": "DHCPv6 server."},
    554: {"cat": "voip", "proto": "tcp/udp", "note": "RTSP — IP cameras everywhere."},
    587: {"cat": "mail", "proto": "tcp", "note": "SMTP submission (STARTTLS) — where your mail client should point."},
    593: {"cat": "windows", "proto": "tcp", "note": "RPC over HTTP."},
    631: {"cat": "print", "proto": "tcp/udp", "note": "IPP / CUPS — and a 2024 RCE headline."},
    636: {"cat": "auth", "proto": "tcp", "note": "LDAP over TLS."},
    646: {"cat": "infra", "proto": "tcp/udp", "note": "MPLS LDP."},
    853: {"cat": "name", "proto": "tcp", "note": "DNS over TLS."},
    873: {"cat": "file", "proto": "tcp", "note": "rsync daemon — anonymous module listings are a classic find."},
    902: {"cat": "remote", "proto": "tcp", "note": "VMware ESXi management agent."},
    989: {"cat": "file", "proto": "tcp", "note": "FTPS data."},
    990: {"cat": "file", "proto": "tcp", "note": "FTPS control (implicit TLS)."},
    993: {"cat": "mail", "proto": "tcp", "note": "IMAP over TLS."},
    995: {"cat": "mail", "proto": "tcp", "note": "POP3 over TLS."},
    1080: {"cat": "vpn", "proto": "tcp", "note": "SOCKS proxy."},
    1194: {"cat": "vpn", "proto": "tcp/udp", "name": "openvpn", "note": "OpenVPN — UDP by convention, TCP 443 when evading filters."},
    1337: {"cat": "evil", "name": "—", "desc": "No official assignment", "note": "'leet' — a perennial home for dev servers and malware alike."},
    1433: {"cat": "db", "proto": "tcp", "note": "Microsoft SQL Server."},
    1434: {"cat": "db", "proto": "udp", "note": "MSSQL browser — the 2003 Slammer worm in 376 bytes."},
    1521: {"cat": "db", "proto": "tcp", "note": "Oracle TNS listener."},
    1701: {"cat": "vpn", "proto": "udp", "note": "L2TP — usually wrapped in IPsec."},
    1720: {"cat": "voip", "proto": "tcp", "note": "H.323 call signalling."},
    1723: {"cat": "vpn", "proto": "tcp", "note": "PPTP — cryptographically broken since 2012; retire it."},
    1812: {"cat": "auth", "proto": "udp", "note": "RADIUS authentication."},
    1813: {"cat": "auth", "proto": "udp", "note": "RADIUS accounting."},
    1883: {"cat": "iot", "proto": "tcp", "note": "MQTT plaintext; 8883 is the TLS version."},
    1900: {"cat": "iot", "proto": "udp", "note": "SSDP/UPnP discovery — big DDoS amplifier; block at the edge."},
    2049: {"cat": "file", "proto": "tcp/udp", "note": "NFS."},
    2082: {"cat": "web", "proto": "tcp", "name": "cpanel", "desc": "cPanel", "note": "cPanel HTTP (2083 for TLS)."},
    2083: {"cat": "web", "proto": "tcp", "name": "cpanel-tls", "desc": "cPanel over TLS"},
    2222: {"cat": "remote", "proto": "tcp", "note": "De-facto alternate SSH (officially EtherNet/IP-2)."},
    2375: {"cat": "dev", "proto": "tcp", "note": "Docker API without TLS — exposing this hands over the host."},
    2376: {"cat": "dev", "proto": "tcp", "note": "Docker API with TLS."},
    2379: {"cat": "dev", "proto": "tcp", "note": "etcd client API — Kubernetes' entire state lives here."},
    2380: {"cat": "dev", "proto": "tcp", "note": "etcd peer traffic."},
    2598: {"cat": "remote", "proto": "tcp", "note": "Citrix session reliability."},
    3128: {"cat": "web", "proto": "tcp", "note": "Squid proxy default."},
    3260: {"cat": "file", "proto": "tcp", "note": "iSCSI target."},
    3268: {"cat": "windows", "proto": "tcp", "note": "AD Global Catalog LDAP."},
    3269: {"cat": "windows", "proto": "tcp", "note": "AD Global Catalog over TLS."},
    3306: {"cat": "db", "proto": "tcp", "note": "MySQL / MariaDB."},
    3389: {"cat": "remote", "proto": "tcp/udp", "note": "RDP (UDP since 8.0). BlueKeep taught everyone not to expose it."},
    3478: {"cat": "voip", "proto": "tcp/udp", "note": "STUN/TURN — how WebRTC escapes NAT."},
    3544: {"cat": "vpn", "proto": "udp", "note": "Teredo IPv6-over-UDP tunneling."},
    4369: {"cat": "msg", "proto": "tcp", "note": "Erlang EPMD — RabbitMQ/CouchDB clustering."},
    4444: {"cat": "evil", "note": "Metasploit's default listener — its presence on a box is rarely good news."},
    4500: {"cat": "vpn", "proto": "udp", "note": "IPsec NAT traversal (ESP in UDP)."},
    4789: {"cat": "infra", "proto": "udp", "note": "VXLAN overlay networks."},
    5004: {"cat": "voip", "proto": "udp", "note": "RTP media."},
    5060: {"cat": "voip", "proto": "tcp/udp", "note": "SIP signalling — scanned relentlessly for toll fraud."},
    5061: {"cat": "voip", "proto": "tcp", "note": "SIP over TLS."},
    5222: {"cat": "msg", "proto": "tcp", "note": "XMPP client connections."},
    5269: {"cat": "msg", "proto": "tcp", "note": "XMPP server-to-server."},
    5353: {"cat": "name", "proto": "udp", "note": "mDNS / Bonjour — how AirPrint and Chromecast find things."},
    5355: {"cat": "name", "proto": "tcp/udp", "note": "LLMNR — poisoning it is a pentest classic; disable via GPO."},
    5432: {"cat": "db", "proto": "tcp", "note": "PostgreSQL."},
    5555: {"cat": "dev", "proto": "tcp", "note": "ADB over TCP — thousands of Androids exposed it; botnets noticed."},
    5601: {"cat": "mon", "proto": "tcp", "name": "kibana", "desc": "Kibana", "note": "Kibana dashboards."},
    5671: {"cat": "msg", "proto": "tcp", "note": "AMQP over TLS."},
    5672: {"cat": "msg", "proto": "tcp", "note": "AMQP — RabbitMQ."},
    5683: {"cat": "iot", "proto": "udp", "note": "CoAP for constrained devices."},
    5900: {"cat": "remote", "proto": "tcp", "note": "VNC display :0 — frequently passwordless on the internet."},
    5985: {"cat": "windows", "proto": "tcp", "note": "WinRM HTTP — PowerShell remoting."},
    5986: {"cat": "windows", "proto": "tcp", "note": "WinRM HTTPS."},
    6000: {"cat": "legacy", "proto": "tcp", "note": "X11 display :0 — unauthenticated X servers were the 90s' open RDP."},
    6379: {"cat": "db", "proto": "tcp", "note": "Redis — unauthenticated by default; a favorite cryptominer entry."},
    6443: {"cat": "dev", "proto": "tcp", "name": "kubernetes", "desc": "Kubernetes API server", "note": "Kubernetes API server."},
    6514: {"cat": "mon", "proto": "tcp", "note": "Syslog over TLS."},
    6667: {"cat": "msg", "proto": "tcp", "note": "IRC — also the classic botnet C2 channel of the 2000s."},
    6697: {"cat": "msg", "proto": "tcp", "note": "IRC over TLS."},
    6881: {"cat": "file", "proto": "tcp/udp", "note": "BitTorrent's traditional first port (6881-6889)."},
    7001: {"cat": "dev", "proto": "tcp", "name": "weblogic", "desc": "Oracle WebLogic", "note": "WebLogic — a deserialization-CVE hall of famer."},
    7547: {"cat": "iot", "proto": "tcp", "note": "TR-069 ISP router management — Mirai's 2016 expansion pack."},
    8000: {"cat": "dev", "proto": "tcp", "note": "Dev HTTP (python -m http.server and countless others)."},
    8006: {"cat": "dev", "proto": "tcp", "name": "proxmox", "desc": "Proxmox VE web UI", "note": "Proxmox VE web interface."},
    8009: {"cat": "web", "proto": "tcp", "note": "Tomcat AJP — Ghostcat (2020) made everyone close it."},
    8080: {"cat": "web", "proto": "tcp", "note": "The alternate HTTP port: proxies, Tomcat, dev servers."},
    8086: {"cat": "db", "proto": "tcp", "name": "influxdb", "desc": "InfluxDB", "note": "InfluxDB HTTP API."},
    8123: {"cat": "iot", "proto": "tcp", "name": "home-assistant", "desc": "Home Assistant", "note": "Home Assistant web UI."},
    8333: {"cat": "other", "proto": "tcp", "name": "bitcoin", "desc": "Bitcoin P2P", "note": "Bitcoin node peer traffic."},
    8443: {"cat": "web", "proto": "tcp", "note": "Alternate HTTPS — appliance admin UIs love it."},
    8530: {"cat": "windows", "proto": "tcp", "note": "WSUS HTTP."},
    8531: {"cat": "windows", "proto": "tcp", "note": "WSUS HTTPS."},
    8883: {"cat": "iot", "proto": "tcp", "note": "MQTT over TLS."},
    8888: {"cat": "dev", "proto": "tcp", "note": "Jupyter and other dev HTTP defaults."},
    9000: {"cat": "dev", "proto": "tcp", "note": "PHP-FPM, SonarQube, MinIO console — crowded address."},
    9090: {"cat": "mon", "proto": "tcp", "note": "Prometheus (and Cockpit)."},
    9092: {"cat": "msg", "proto": "tcp", "name": "kafka", "desc": "Apache Kafka", "note": "Kafka brokers."},
    9100: {"cat": "print", "proto": "tcp", "note": "Raw JetDirect printing — pipe text in, paper comes out."},
    9200: {"cat": "db", "proto": "tcp", "name": "elasticsearch", "desc": "Elasticsearch REST", "note": "Elasticsearch — unsecured clusters fueled a decade of breach headlines."},
    9300: {"cat": "db", "proto": "tcp", "name": "elasticsearch-nodes", "desc": "Elasticsearch transport", "note": "Elasticsearch node-to-node."},
    9418: {"cat": "dev", "proto": "tcp", "note": "The git:// protocol — unauthenticated, read-only."},
    9993: {"cat": "vpn", "proto": "udp", "name": "zerotier", "desc": "ZeroTier", "note": "ZeroTier virtual networking."},
    10000: {"cat": "remote", "proto": "tcp", "note": "Webmin (officially NDMP)."},
    10050: {"cat": "mon", "proto": "tcp", "note": "Zabbix agent."},
    10051: {"cat": "mon", "proto": "tcp", "note": "Zabbix server."},
    11211: {"cat": "db", "proto": "tcp/udp", "note": "Memcached — UDP reflection produced 2018's record 1.7 Tbps DDoS."},
    12345: {"cat": "evil", "name": "netbus", "desc": "No official assignment", "note": "NetBus backdoor's default — 90s remote-access trojan royalty."},
    25565: {"cat": "game", "name": "minecraft", "desc": "Minecraft server", "note": "Minecraft Java Edition."},
    27015: {"cat": "game", "proto": "tcp/udp", "name": "srcds", "desc": "Source engine games", "note": "Source dedicated servers (CS, TF2) and Steam."},
    27017: {"cat": "db", "proto": "tcp", "name": "mongodb", "desc": "MongoDB", "note": "MongoDB — the 2017 ransom wave hit unsecured ones."},
    31337: {"cat": "evil", "name": "back-orifice", "desc": "No official assignment", "note": "Back Orifice, 'elite' — the most famous backdoor number ever."},
    32400: {"cat": "voip", "proto": "tcp", "name": "plex", "desc": "Plex Media Server", "note": "Plex web/streaming."},
    33434: {"cat": "infra", "proto": "udp", "name": "traceroute", "desc": "traceroute base port", "note": "Where classic UDP traceroute starts probing (33434+hop)."},
    47808: {"cat": "iot", "proto": "udp", "note": "BACnet building automation."},
    51820: {"cat": "vpn", "proto": "udp", "name": "wireguard", "desc": "WireGuard (conventional)", "note": "WireGuard's conventional port — technically in the dynamic range."},
}

# Keyword -> category for well-known rows without a curated entry.
_HEURISTICS = [
    (("http", "www", "web"), "web"),
    (("smtp", "mail", "imap", "pop"), "mail"),
    (("ftp", "file", "nfs"), "file"),
    (("telnet", "shell", "login", "exec", "remote"), "remote"),
    (("dns", "domain", "name", "whois"), "name"),
    (("kerberos", "ldap", "radius", "tacacs", "auth"), "auth"),
    (("sql", "database", "db2"), "db"),
    (("irc", "chat", "messag", "xmpp", "amqp", "mqtt"), "msg"),
    (("rtsp", "rtp", "sip", "voice", "video", "audio", "media"), "voip"),
    (("vpn", "tunnel", "ipsec", "pptp", "l2tp", "socks"), "vpn"),
    (("snmp", "syslog", "monitor"), "mon"),
    (("netbios", "microsoft", "ms-", "windows", "active directory"), "windows"),
    (("print", "ipp", "lpd"), "print"),
    (("game",), "game"),
    (("routing", "router", "rip", "bgp", "ospf", "dhcp", "bootp", "ntp", "time"), "infra"),
]


def _category_for(name: str, desc: str) -> str:
    hay = (name + " " + desc).lower()
    for keys, cat in _HEURISTICS:
        if any(k in hay for k in keys):
            return cat
    return "other"


@lru_cache(maxsize=1)
def port_table() -> list[dict]:
    """Sorted port entries: p, proto, n(ame), d(esc), c(ategory), note?."""
    merged: dict[int, dict] = {}
    with open(DATA, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            port = int(row["port"])
            proto = row["proto"]
            entry = merged.setdefault(
                port, {"protos": set(), "name": "", "desc": ""}
            )
            entry["protos"].add(proto)
            # Prefer the TCP row's naming when both exist.
            if not entry["name"] or proto == "tcp":
                entry["name"] = row["name"]
                entry["desc"] = row["desc"]

    out = []
    for port in sorted(set(merged) | set(OVERRIDES)):
        base = merged.get(port, {"protos": set(), "name": "", "desc": ""})
        over = OVERRIDES.get(port, {})
        if port > 1023 and port not in OVERRIDES:
            continue  # registered range: curated entries only
        proto = over.get("proto") or "/".join(
            p for p in ("tcp", "udp") if p in base["protos"]
        ) or "tcp/udp"
        name = over.get("name") or base["name"] or "—"
        desc = over.get("desc") or base["desc"] or "No official assignment"
        cat = over.get("cat") or _category_for(name, desc)
        if cat not in CATEGORIES:
            raise ValueError(f"unknown category {cat!r} for port {port}")
        item = {"p": port, "proto": proto, "n": name, "d": desc, "c": cat}
        if "note" in over:
            item["note"] = over["note"]
        out.append(item)
    return out


def ports_json() -> str:
    return json.dumps(
        {"categories": CATEGORIES, "ports": port_table()},
        separators=(",", ":"), ensure_ascii=False,
    )
