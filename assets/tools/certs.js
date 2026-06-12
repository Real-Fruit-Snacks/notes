// Certificate Checker: extract PEM blocks from pasted text (bare certs,
// chains, or whole .ovpn configs), parse each CERTIFICATE's validity with a
// minimal clean-room DER walker, and report expiry verdicts. Everything runs
// locally; nothing is uploaded. Field parsing is verified against Node's
// X509Certificate in the extraction harness.
(function () {
  var input = document.getElementById("cert-input");
  var results = document.getElementById("cert-results");
  if (!input || !results) return;
  var errorEl = document.getElementById("cert-error");
  var ignoredEl = document.getElementById("cert-ignored");
  var placeholder = document.getElementById("cert-placeholder");

  var WARN_DAYS = 30;
  var MS_PER_DAY = 86400000;

  // ---- PEM extraction (mixed-case label: "OpenVPN Static key V1") ----
  var PEM_RE = /-----BEGIN ([A-Za-z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;

  function pemBlocks(text) {
    var blocks = [];
    var m;
    PEM_RE.lastIndex = 0;
    while ((m = PEM_RE.exec(text)) !== null) {
      blocks.push({ label: m[1], body: m[2] });
    }
    return blocks;
  }

  function classifyBlock(label) {
    if (label === "CERTIFICATE") return "cert";
    if (label === "CERTIFICATE REQUEST" || label === "NEW CERTIFICATE REQUEST") return "csr";
    return "ignored";
  }

  function b64ToBytes(body) {
    var clean = body.replace(/[^A-Za-z0-9+/=]/g, "");
    var bin;
    try {
      bin = atob(clean);
    } catch (e) {
      return null;
    }
    var bytes = [];
    for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
    return bytes;
  }

  // ---- minimal DER reader: TLV with long-form lengths, no indefinite ----
  function derRead(bytes, offset) {
    if (offset + 2 > bytes.length) return null;
    var tag = bytes[offset];
    var len = bytes[offset + 1];
    var header = 2;
    if (len === 0x80) return null; // indefinite length: not DER
    if (len > 0x80) {
      var n = len & 0x7f;
      if (n > 3 || offset + 2 + n > bytes.length) return null;
      len = 0;
      for (var i = 0; i < n; i++) len = len * 256 + bytes[offset + 2 + i];
      header = 2 + n;
    }
    if (offset + header + len > bytes.length) return null;
    return { tag: tag, start: offset + header, end: offset + header + len };
  }

  function derChildren(bytes, node) {
    var kids = [];
    var off = node.start;
    while (off < node.end) {
      var child = derRead(bytes, off);
      if (!child) return null;
      kids.push(child);
      off = child.end;
    }
    return kids;
  }

  function bytesToLatin1(bytes, start, end) {
    var s = "";
    for (var i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function derString(bytes, node) {
    if (node.tag === 0x1e) { // BMPString: UTF-16BE code units
      var s = "";
      for (var i = node.start; i + 1 < node.end; i += 2) {
        s += String.fromCharCode(bytes[i] * 256 + bytes[i + 1]);
      }
      return s;
    }
    var raw = bytesToLatin1(bytes, node.start, node.end);
    try {
      return decodeURIComponent(escape(raw)); // UTF-8 decode with fallback
    } catch (e) {
      return raw;
    }
  }

  function hexOf(bytes, start, end, stripPad) {
    var s = start;
    if (stripPad) while (s < end - 1 && bytes[s] === 0) s++;
    var out = "";
    for (var i = s; i < end; i++) {
      out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16).toUpperCase();
    }
    return out;
  }

  // ---- Name (RDNSequence) -> display string: CN, else O, else first ----
  var OID_CN = "550403"; // 2.5.4.3 commonName
  var OID_O = "55040a";  // 2.5.4.10 organizationName

  function nameDisplay(bytes, nameNode) {
    var cn = null, o = null, first = null;
    var rdns = derChildren(bytes, nameNode);
    if (!rdns) return "(unreadable name)";
    for (var i = 0; i < rdns.length; i++) {
      var atvs = derChildren(bytes, rdns[i]);
      if (!atvs) continue;
      for (var j = 0; j < atvs.length; j++) {
        var pair = derChildren(bytes, atvs[j]);
        if (!pair || pair.length < 2 || pair[0].tag !== 0x06) continue;
        var oid = hexOf(bytes, pair[0].start, pair[0].end, false).toLowerCase();
        var val = derString(bytes, pair[1]);
        if (first === null) first = val;
        if (oid === OID_CN && cn === null) cn = val;
        if (oid === OID_O && o === null) o = val;
      }
    }
    return cn !== null ? cn : (o !== null ? o : (first !== null ? first : "(unnamed)"));
  }

  // ---- UTCTime (0x17) / GeneralizedTime (0x18) -> Date or null ----
  function derTime(bytes, node) {
    var s = bytesToLatin1(bytes, node.start, node.end);
    var m;
    if (node.tag === 0x17) {
      m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
      if (!m) return null;
      var yy = Number(m[1]);
      var year = yy < 50 ? 2000 + yy : 1900 + yy; // RFC 5280 two-digit rule
      return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]),
        Number(m[4]), Number(m[5]), Number(m[6])));
    }
    if (node.tag === 0x18) {
      m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
      if (!m) return null;
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4]), Number(m[5]), Number(m[6])));
    }
    return null;
  }

  // ---- Certificate walk: serial -> issuer -> validity -> subject ----
  function parseCert(bytes) {
    var outer = derRead(bytes, 0);
    if (!outer || outer.tag !== 0x30) return { error: "not a DER SEQUENCE" };
    var top = derChildren(bytes, outer);
    if (!top || top.length < 1 || top[0].tag !== 0x30) return { error: "no TBSCertificate" };
    var tbs = derChildren(bytes, top[0]);
    if (!tbs || tbs.length < 5) return { error: "truncated TBSCertificate" };
    var idx = 0;
    if (tbs[idx].tag === 0xa0) idx++; // [0] EXPLICIT version
    var serialNode = tbs[idx++];
    if (!serialNode || serialNode.tag !== 0x02) return { error: "missing serial" };
    idx++; // AlgorithmIdentifier (skipped)
    var issuerNode = tbs[idx++];
    var validity = tbs[idx++];
    var subjectNode = tbs[idx++];
    if (!issuerNode || !validity || !subjectNode || validity.tag !== 0x30) {
      return { error: "missing validity" };
    }
    var times = derChildren(bytes, validity);
    if (!times || times.length !== 2) return { error: "bad validity" };
    var notBefore = derTime(bytes, times[0]);
    var notAfter = derTime(bytes, times[1]);
    if (!notBefore || !notAfter) return { error: "unparseable validity dates" };
    var selfSigned =
      bytesToLatin1(bytes, issuerNode.start, issuerNode.end) ===
      bytesToLatin1(bytes, subjectNode.start, subjectNode.end);
    return {
      subject: nameDisplay(bytes, subjectNode),
      issuer: nameDisplay(bytes, issuerNode),
      selfSigned: selfSigned,
      notBefore: notBefore,
      notAfter: notAfter,
      serial: hexOf(bytes, serialNode.start, serialNode.end, true),
    };
  }

  // ---- verdict: expiry keys off the timestamp, NOT a days calculation ----
  function verdictOf(notAfter) {
    var now = Date.now();
    if (notAfter.getTime() < now) {
      return { cls: "cert-expired", text: "expired",
        days: Math.floor((now - notAfter.getTime()) / MS_PER_DAY), remaining: false };
    }
    var days = Math.ceil((notAfter.getTime() - now) / MS_PER_DAY);
    if (days <= WARN_DAYS) {
      return { cls: "cert-warn", text: "expiring soon", days: days, remaining: true };
    }
    return { cls: "cert-valid", text: "valid", days: days, remaining: true };
  }

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  // ---- rendering ----
  function factRow(dt, dd) {
    var wrap = document.createElement("div");
    wrap.className = "fact";
    var t = document.createElement("dt");
    t.textContent = dt;
    var d = document.createElement("dd");
    d.textContent = dd;
    wrap.appendChild(t);
    wrap.appendChild(d);
    return wrap;
  }

  function certCard(n, parsed) {
    var card = document.createElement("div");
    card.className = "cert-card";
    var head = document.createElement("div");
    head.className = "cert-card-head";
    var title = document.createElement("span");
    title.textContent = "Certificate " + n;
    head.appendChild(title);
    if (parsed.error) {
      card.appendChild(head);
      var p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Could not parse this block (" + parsed.error +
        ") — corrupted or truncated?";
      card.appendChild(p);
      return card;
    }
    var v = verdictOf(parsed.notAfter);
    var b = document.createElement("span");
    b.className = "cert-badge " + v.cls;
    b.textContent = v.text;
    head.appendChild(b);
    card.appendChild(head);
    var dl = document.createElement("dl");
    dl.className = "subnet-facts";
    dl.appendChild(factRow("Subject", parsed.subject));
    dl.appendChild(factRow("Issuer",
      parsed.issuer + (parsed.selfSigned ? " · self-signed" : "")));
    dl.appendChild(factRow("Valid from", isoDate(parsed.notBefore)));
    dl.appendChild(factRow("Expires", isoDate(parsed.notAfter) + " · " +
      v.days.toLocaleString() + (v.remaining ? " days remaining" : " days ago")));
    dl.appendChild(factRow("Serial", parsed.serial));
    card.appendChild(dl);
    return card;
  }

  function render() {
    results.textContent = "";
    errorEl.hidden = true;
    ignoredEl.hidden = true;
    var text = input.value;
    if (!text.replace(/\s/g, "")) {
      placeholder.hidden = false;
      return;
    }
    placeholder.hidden = true;

    var blocks = pemBlocks(text);
    var certs = 0, ignored = 0, csrs = 0;
    for (var i = 0; i < blocks.length; i++) {
      var kind = classifyBlock(blocks[i].label);
      if (kind === "cert") {
        certs++;
        var bytes = b64ToBytes(blocks[i].body);
        results.appendChild(certCard(certs,
          bytes ? parseCert(bytes) : { error: "invalid base64" }));
      } else if (kind === "csr") {
        csrs++;
      } else {
        ignored++;
      }
    }

    if (!blocks.length) {
      errorEl.textContent = "No PEM blocks found — paste the whole file, " +
        "including the BEGIN/END lines.";
      errorEl.hidden = false;
      return;
    }
    var notes = [];
    if (ignored) {
      notes.push(ignored + " non-certificate block" + (ignored > 1 ? "s" : "") +
        " ignored (keys never expire — and nothing you paste leaves this page)");
    }
    if (csrs) {
      notes.push(csrs + " signing request" + (csrs > 1 ? "s have" : " has") +
        " no validity");
    }
    if (notes.length) {
      ignoredEl.textContent = notes.join(" · ");
      ignoredEl.hidden = false;
    }
    if (!certs) {
      errorEl.textContent = "No CERTIFICATE blocks found among the pasted PEM blocks.";
      errorEl.hidden = false;
    }
  }

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 200);
  });

  // ---- one-click examples (stable dates so verdicts never rot: valid to
  // 2060, expired 2021, and an .ovpn whose CA expired in 2025 while its
  // client cert runs to 2060, the classic gotcha the wiki describes) ----
  var EX_VALID = [
    "-----BEGIN CERTIFICATE-----",
    "MIIDTzCCAjegAwIBAgIUQQU2TuBfC7KWTvnNT8wtFrkwbvIwDQYJKoZIhvcNAQEL",
    "BQAwNjEZMBcGA1UEAwwQZGVtby5leGFtcGxlLm9yZzEZMBcGA1UECgwQTm90ZXMg",
    "VG9vbHMgRGVtbzAgFw0yNDAxMDEwMDAwMDBaGA8yMDYwMDEwMTAwMDAwMFowNjEZ",
    "MBcGA1UEAwwQZGVtby5leGFtcGxlLm9yZzEZMBcGA1UECgwQTm90ZXMgVG9vbHMg",
    "RGVtbzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALegw1vpHJxl/CQP",
    "8Ci6bOJPaq1M5QpIghSlQ4tt7gi0WjsZtAgpHFsE3OLOYHrdkpmheQkmdXvEfv2S",
    "GQuChtLhN4esM3mYG2f2Qtzv24mASUkRG1dyjO3sNkr2dBylHIDIqK+MTz0KRefk",
    "7fKFxpkIV1uVOrfOI5g9z/CiR4I3YG7lqNvN4ijvmkWpvAeis9XWtD9iBd5L48Mc",
    "79CZSLe1NsikHa1QIrzndxKYERpybmeoYiRi30Omg32wIlE4lY16bYhDJ5AtkTXP",
    "8LrF2NfqeahIGIIpnWdcHUZ+Rfw2ICNWmo+mB5htFlHYYf8UGEUKveA/orcmoZKz",
    "GEYr9qcCAwEAAaNTMFEwHQYDVR0OBBYEFFec4NV5uquWGdbBkQzLgAE6gF0MMB8G",
    "A1UdIwQYMBaAFFec4NV5uquWGdbBkQzLgAE6gF0MMA8GA1UdEwEB/wQFMAMBAf8w",
    "DQYJKoZIhvcNAQELBQADggEBACwInAusflLn09sVCTsIeXYVYKkzOc6OuQujnMkm",
    "lgLp03xSUepX9o/Mo7P7lvjtdLc6IpjbKmz5mCxYILmEQpzknk+kp9sNW+5jFEdR",
    "jnKkd/ykLZve/aN1jy/kwzQ/obnlzVL7ufgx0i5+H1LKJvTkIzEUHhWHjzDCXHaq",
    "zfKj6N7P4tyRCts45X2j7fkf/8ZAw/SJKInC/YfRWDlyNLP14Rt5uV5eNjw3AYze",
    "RZSJDLLXII2Siu7XxIbA/cUpgEQcWdUBfnBerW8tfDz0Gos73guEjL0ShfFMVpUr",
    "/bwsNeZbWh2DEwUvEGo0IudRbjlCz163CEvHy1CfepsqAMs=",
    "-----END CERTIFICATE-----",
  ].join("\n");
  var EX_EXPIRED = [
    "-----BEGIN CERTIFICATE-----",
    "MIIDIjCCAgqgAwIBAgIUONNLquhfw7SDodXEtnZrJLNr05wwDQYJKoZIhvcNAQEL",
    "BQAwLTEQMA4GA1UEAwwHRGVtbyBDQTEZMBcGA1UECgwQTm90ZXMgVG9vbHMgRGVt",
    "bzAeFw0xOTA0MDEwMDAwMDBaFw0yMTA0MDEwMDAwMDBaMBoxGDAWBgNVBAMMD29s",
    "ZC5leGFtcGxlLm9yZzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAM/1",
    "893mkd7nqH1sP+TVBQ4jFmV+sLIPC+B0RvioAOAb6MHDWVPWtBQ/myB6SatYGSfb",
    "g9ET9VCSJOwmzgXC6ceOof4z1aG2bcrABeUW8S/ldCYFOF34nUNYgrDx1HoF3IgR",
    "jYIeOHxINfAHihsPSsdR7VOEjAHD4FkmZ5Hu4Zou8dYCaxJTm9i5s2zT0ySEWuyw",
    "27o7f4rU0uy86kuX7KXOyBAx8KQBuhIaGGL2TmYWf6qLen7pVqHi+WJCCXyMSHY7",
    "F6Qi+dZ+Pc5YPxHuD/ier3+GClz0rTqLtIYvSvFRoBR0XLh+nB2ONo674wQACnRL",
    "9Xt7jSNEOWRkN064+RECAwEAAaNNMEswCQYDVR0TBAIwADAdBgNVHQ4EFgQU1y1O",
    "acWoypb6UqqqudddX1xCOBkwHwYDVR0jBBgwFoAUASaNhYsvJOcJAjtLEte56gN7",
    "UkIwDQYJKoZIhvcNAQELBQADggEBAGTHQ/JOiP7b/sfljNTSw+Pv5b9nckPHy3L2",
    "U75rqJafOAZWNnowz23BudOMCA84w0IrwyIY3cIJ5JABwviv8oStkLMXXh65qfc0",
    "9Ty6xw8yhLsUQJzXSNtM9tVTqwisMTiMDecEV8ksoKHuny4ZRXq/SRogvztNV6uQ",
    "EY3mPgbJ77uljY64Esifz3SxijB8q/lT9AJlzTeORn8UyDyePUKyvX25zsoOY/Sw",
    "MS+eTopYv9dUSBtory9vL/B9X/tqPe7z4WVAaMYNGBmjs9zVkWiQOLdlAVEqoAzM",
    "OmKMcExfTUlAviV7RYhVratZB7vZOceNni6tHyQ2taTFeCVd+xc=",
    "-----END CERTIFICATE-----",
  ].join("\n");
  var EX_VPN_CA = [
    "-----BEGIN CERTIFICATE-----",
    "MIIDQzCCAiugAwIBAgIUBlZ6rcDg7OBaE9lEozLu/W6X0XkwDQYJKoZIhvcNAQEL",
    "BQAwMTEUMBIGA1UEAwwLRGVtbyBWUE4gQ0ExGTAXBgNVBAoMEE5vdGVzIFRvb2xz",
    "IERlbW8wHhcNMTUwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjAxMRQwEgYDVQQD",
    "DAtEZW1vIFZQTiBDQTEZMBcGA1UECgwQTm90ZXMgVG9vbHMgRGVtbzCCASIwDQYJ",
    "KoZIhvcNAQEBBQADggEPADCCAQoCggEBAKUEBN03bq1rDSi6eKa1I6BiRIy+STFe",
    "b9Lob+GQD24Yj9qV/PjIiCmslAOIPQFEMgHZ3XPOqCT4vRxexMAkki4BOHxvZE/O",
    "eQ+ZeiLHWVepBD5HLAvLRtx1mbqTvMtABpYCAZiufyhfvNKsOrU/J8PPGeoiu4B7",
    "NOjd7xOqw8AYSACj5hZxL2wjq76A4WyqnMy+XlXtX7mPJiie9Ye/uu+5lpz3rxse",
    "c9RMGbF4AlL/ImPXEK2a8ebbJ1/hiRYbdPMGDywUep+WnNaFcEOJjKgfZ1VWjiCo",
    "JJGkfrw9va64ht+Ln/wG38bxDxEOcoBRaRGOJCjMAAa44U0Rqae7POMCAwEAAaNT",
    "MFEwHQYDVR0OBBYEFAz4UOI7hCFXDPDfX1qwFPtiDnTlMB8GA1UdIwQYMBaAFAz4",
    "UOI7hCFXDPDfX1qwFPtiDnTlMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEL",
    "BQADggEBAJSeZCNzhdLjKwCW0rcGETmmGxUxNU/ZFDGmG0qq8BeZjZZOgyMlU3gX",
    "W3JSodMF3XAB2HNk9BQXAQFrEg0w/AUTtW5d4MzkrbF0/sRGprQdnM83lKEkxZez",
    "QiEY3ZCoStGttn0u3mlOGaKmVOZPDkPIkOMyfa3N4dexasqzeJr4ll5CzHNV2XKz",
    "tjHGLLC3SCvBpgH2+VFbjZnbOae8Rnsu1UycYykRaHuHlrV3XIcXKjUuYKFUr+P2",
    "/Hyo4qywmBzHYDAK3EiCm3YwVcJlbg+VT47b9EfzD/eyEA4DpKw1lYfEca9LnLxq",
    "d4KTwMpmtdFqkRklZjofaxJ5DIwN5is=",
    "-----END CERTIFICATE-----",
  ].join("\n");
  var EX_VPN_CLIENT = [
    "-----BEGIN CERTIFICATE-----",
    "MIIDJDCCAgygAwIBAgIUAqdPp73wwwhpO2jUUGWj4blvS8IwDQYJKoZIhvcNAQEL",
    "BQAwMTEUMBIGA1UEAwwLRGVtbyBWUE4gQ0ExGTAXBgNVBAoMEE5vdGVzIFRvb2xz",
    "IERlbW8wIBcNMjQwMTAxMDAwMDAwWhgPMjA2MDAxMDEwMDAwMDBaMBYxFDASBgNV",
    "BAMMC3Zwbi1jbGllbnQxMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA",
    "jnfdLuOeLTV7r1AX5zNgpq0gJQyWWSKnCkBDUxySAIPXY+PqqDLPxjIVDH5pIjgy",
    "k5KWtDWIdTOErz6DSUyUz56YW6KrqlFqSiUhYj88gN7G7STMGJ7ikGLRtwBAi5k6",
    "dccW1byZSP2Xnt+FOGqw+FleK9svIVdomotrtMwPjQ0WdsggYovKEwRpeA8J0i7o",
    "xXT21pprSAW383S+3yAaosnY/AwmlDYT7eZHdzy+fHfjUdeaIcE84hxsL8uHvJIL",
    "F14mUtXqAuhHQQNbggqjTqFTJOnk6S5Zcx2EJMa5tC0NjIXzvdy3fl+taObnsRsQ",
    "CAYrvuXtyF67Y9ddaVlOxQIDAQABo00wSzAJBgNVHRMEAjAAMB0GA1UdDgQWBBS3",
    "YB41cC7aBxjXiw7oQx4TX0Dl4zAfBgNVHSMEGDAWgBQM+FDiO4QhVwzw319asBT7",
    "Yg505TANBgkqhkiG9w0BAQsFAAOCAQEAFdXovG4ig8iwUNOYGnc+IbBgdTWiprub",
    "wVmInkuwmMOMQdWQRRGJg3XUvgPYERbb8hQUp58AfsJXQYR8oHCYg/HK01fQEjsz",
    "kRxj/dPlo4c+SyhZ5knyUFsLQ3V95motqvEXoPoECDKaRaV2i4UePKCWny1dVE6Y",
    "pnhHqJlFizrVICj8Iu37nUvOpxGCzr79TCPycX2y98QWHvOh5zJugmBOMH1J95MD",
    "fUMmka2CtEV0dcKRF6nywnxcwUOKtHp66iWYQ007xTBKJXduMFqw6tW3esRPksY5",
    "SfzwexlsQD6NSRNgieWCaSRPvks6PKGpYQrxVjyAkVpchf4fQO/qDg==",
    "-----END CERTIFICATE-----",
  ].join("\n");
  var EXAMPLES = {
    valid: EX_VALID,
    expired: EX_EXPIRED,
    ovpn: [
      "# Demo OpenVPN profile - the certificates are real, parseable",
      "# examples; the key blocks are fake placeholders.",
      "client",
      "dev tun",
      "proto udp",
      "remote vpn.example.org 1194",
      "<ca>",
      EX_VPN_CA,
      "</ca>",
      "<cert>",
      EX_VPN_CLIENT,
      "</cert>",
      "<key>",
      "-----BEGIN PRIVATE KEY-----",
      "ZmFrZSBkZW1vIGtleSAtIG5vdCBhIHJlYWwgb25l",
      "-----END PRIVATE KEY-----",
      "</key>",
      "<tls-auth>",
      "-----BEGIN OpenVPN Static key V1-----",
      "ZmFrZSBkZW1vIGtleSAtIG5vdCBhIHJlYWwgb25l",
      "-----END OpenVPN Static key V1-----",
      "</tls-auth>",
    ].join("\n"),
  };
  var exampleBtns = document.querySelectorAll(".example-btn[data-example]");
  for (var ei = 0; ei < exampleBtns.length; ei++) {
    exampleBtns[ei].addEventListener("click", function () {
      var ex = EXAMPLES[this.getAttribute("data-example")];
      if (ex == null) return;
      clearTimeout(timer);
      input.value = ex;
      render();
    });
  }
  render();
})();
