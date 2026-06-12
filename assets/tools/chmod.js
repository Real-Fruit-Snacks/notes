// chmod Calculator: a 12-bit mode (setuid/setgid/sticky + three rwx triads)
// kept in three-way sync between the checkbox grid, an octal input, and a
// symbolic input (absolute u=rwx clauses and relative +/- ones, incl. X, s,
// t), plus a umask panel masking the classic 666/777 creation requests.
// Symbolic "=" replaces the class triad and clears that class's special bit
// unless listed (GNU file behavior). Verified by curated vectors and a full
// 4096-mode canonical round-trip in the extraction harness.
(function () {
  var grid = document.getElementById("chmod-grid");
  var octalInput = document.getElementById("chmod-octal");
  if (!grid || !octalInput) return;
  var symbolicInput = document.getElementById("chmod-symbolic");
  var umaskInput = document.getElementById("chmod-umask");
  var errorEl = document.getElementById("chmod-error");
  var descEl = document.getElementById("chmod-desc");
  var factsEl = document.getElementById("chmod-facts");
  var umaskFacts = document.getElementById("umask-facts");
  var outputEl = document.getElementById("chmod-output");

  // Bit values: special digit << 9, then user/group/other triads.
  var BITS = {
    su: 2048, sg: 1024, st: 512,
    ur: 256, uw: 128, ux: 64,
    gr: 32, gw: 16, gx: 8,
    or: 4, ow: 2, ox: 1,
  };
  var CLASSES = [
    { key: "u", name: "user", shift: 6, special: BITS.su },
    { key: "g", name: "group", shift: 3, special: BITS.sg },
    { key: "o", name: "other", shift: 0, special: BITS.st },
  ];

  function triad(mode, shift) { return (mode >> shift) & 7; }

  function octalStr(mode) {
    var special = (mode >> 9) & 7;
    var body = String(triad(mode, 6)) + String(triad(mode, 3)) + String(triad(mode, 0));
    return special ? String(special) + body : body;
  }

  function parseOctal(text) {
    if (!/^[0-7]{3,4}$/.test(text)) return null;
    return parseInt(text, 8) & 4095;
  }

  // ls -l permission string: s/S in user and group execute slots, t/T in
  // other's - capital when the special bit is set without execute.
  function lsString(mode) {
    var out = "";
    for (var c = 0; c < 3; c++) {
      var t = triad(mode, CLASSES[c].shift);
      out += (t & 4) ? "r" : "-";
      out += (t & 2) ? "w" : "-";
      var x = (t & 1) !== 0;
      var sp = (mode & CLASSES[c].special) !== 0;
      var letter = c === 2 ? "t" : "s";
      if (sp) out += x ? letter : letter.toUpperCase();
      else out += x ? "x" : "-";
    }
    return out;
  }

  function triadLetters(t) {
    return ((t & 4) ? "r" : "") + ((t & 2) ? "w" : "") + ((t & 1) ? "x" : "");
  }

  // Canonical absolute symbolic form; specials ride inline (u=rwxs, o=rxt).
  function symbolicCanonical(mode) {
    var parts = [];
    for (var c = 0; c < 3; c++) {
      var letters = triadLetters(triad(mode, CLASSES[c].shift));
      if (mode & CLASSES[c].special) letters += c === 2 ? "t" : "s";
      parts.push(CLASSES[c].key + "=" + letters);
    }
    return parts.join(",");
  }

  // Apply a symbolic expression to a base mode. One operator per comma
  // clause: [ugoa]* then = + or -, then perm letters rwxXst.
  function parseSymbolic(text, base) {
    var mode = base & 4095;
    var clauses = text.split(",");
    for (var i = 0; i < clauses.length; i++) {
      var m = /^([ugoa]*)([=+-])([rwxXst]*)$/.exec(clauses[i].trim());
      if (!m) return { error: 'unreadable clause "' + clauses[i].trim() + '"' };
      var who = m[1] === "" || m[1].indexOf("a") >= 0 ? "ugo" : m[1];
      var op = m[2], perms = m[3];
      var wantX = perms.indexOf("X") >= 0 &&
        (base & (BITS.ux | BITS.gx | BITS.ox)) !== 0; // X: only if any x already
      var bits = 0;
      if (perms.indexOf("r") >= 0) bits |= 4;
      if (perms.indexOf("w") >= 0) bits |= 2;
      if (perms.indexOf("x") >= 0 || wantX) bits |= 1;
      for (var c = 0; c < 3; c++) {
        var cls = CLASSES[c];
        if (who.indexOf(cls.key) < 0) continue;
        var hasS = perms.indexOf("s") >= 0 && c < 2; // s ignored for "other"
        var hasT = perms.indexOf("t") >= 0 && c === 2; // sticky via the o class
        if (op === "=") {
          mode = (mode & ~(7 << cls.shift)) | (bits << cls.shift);
          mode = hasS || hasT ? (mode | cls.special) : (mode & ~cls.special);
        } else if (op === "+") {
          mode |= bits << cls.shift;
          if (hasS || hasT) mode |= cls.special;
        } else {
          mode &= ~(bits << cls.shift);
          if (hasS || hasT) mode &= ~cls.special;
        }
      }
      // Bare +t / -t (or with "a") applies the sticky bit too.
      if (perms.indexOf("t") >= 0 && (m[1] === "" || m[1].indexOf("a") >= 0)) {
        if (op === "-") mode &= ~BITS.st;
        else mode |= BITS.st;
      }
    }
    return { mode: mode & 4095 };
  }

  // ---- plain English ----
  function abilityList(t) {
    var parts = [];
    if (t & 4) parts.push("read");
    if (t & 2) parts.push("write");
    if (t & 1) parts.push("execute");
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + " and " + parts[1];
    return parts[0] + ", " + parts[1] + " and " + parts[2];
  }

  function english(mode) {
    var u = triad(mode, 6), g = triad(mode, 3), o = triad(mode, 0);
    var groups = [];
    if (g === o) {
      groups.push(["Owner", u]);
      groups.push(["group and others", g]);
    } else if (u === g) {
      groups.push(["Owner and group", u]);
      groups.push(["others", o]);
    } else {
      groups.push(["Owner", u]);
      groups.push(["group", g]);
      groups.push(["others", o]);
    }
    var said = [];
    for (var i = 0; i < groups.length; i++) {
      var who = groups[i][0], what = abilityList(groups[i][1]);
      said.push(what ? who + " can " + what : who + " " +
        (who === "Owner" ? "has" : "have") + " no access");
    }
    var sentence = said.join("; ") + ".";
    if (mode & BITS.su) sentence += " Runs with the owner's identity (setuid).";
    if (mode & BITS.sg) sentence += " Runs with the group's identity; on a directory, new files inherit its group (setgid).";
    if (mode & BITS.st) sentence += " In a directory, only a file's owner may delete it (sticky).";
    return sentence;
  }

  // ---- state + sync ----
  var mode = parseInt("755", 8);
  var umaskVal = parseInt("022", 8);
  var boxes = grid.querySelectorAll("input.chmod-bit");

  function factRow(label, dd) {
    var wrap = document.createElement("div");
    wrap.className = "fact";
    var t = document.createElement("dt");
    t.textContent = label;
    var d = document.createElement("dd");
    d.textContent = dd;
    wrap.appendChild(t);
    wrap.appendChild(d);
    return wrap;
  }

  function refresh(source) {
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = (mode & BITS[boxes[i].getAttribute("data-bit")]) !== 0;
    }
    var digits = grid.querySelectorAll(".chmod-digit");
    for (var d = 0; d < digits.length; d++) {
      var key = digits[d].getAttribute("data-digit");
      digits[d].textContent = String(triad(mode, key === "u" ? 6 : key === "g" ? 3 : 0));
    }
    if (source !== "octal" || document.activeElement !== octalInput) {
      octalInput.value = octalStr(mode);
    }
    if (source !== "symbolic" || document.activeElement !== symbolicInput) {
      symbolicInput.value = symbolicCanonical(mode);
    }
    descEl.textContent = english(mode);
    factsEl.textContent = "";
    factsEl.appendChild(factRow("Octal", octalStr(mode)));
    factsEl.appendChild(factRow("Symbolic", symbolicCanonical(mode)));
    factsEl.appendChild(factRow("ls -l", "-" + lsString(mode)));
    factsEl.appendChild(factRow("Command", "chmod " + octalStr(mode) + " file"));
    refreshUmask();
  }

  function refreshUmask() {
    umaskFacts.textContent = "";
    var m = umaskVal & 511;
    var file = 438 & ~m; // 666
    var dir = 511 & ~m;  // 777
    var cur = (mode & 511) & ~m;
    umaskFacts.appendChild(factRow("New file (666 & ~" + octalStr(m) + ")",
      octalStr(file) + " · -" + lsString(file)));
    umaskFacts.appendChild(factRow("New directory (777 & ~" + octalStr(m) + ")",
      octalStr(dir) + " · d" + lsString(dir)));
    umaskFacts.appendChild(factRow("This mode through it",
      octalStr(cur) + " · -" + lsString(cur)));
  }

  function setMode(m, source) {
    mode = m & 4095;
    errorEl.hidden = true;
    octalInput.classList.remove("invalid");
    symbolicInput.classList.remove("invalid");
    outputEl.classList.remove("stale");
    refresh(source);
  }

  function fail(which, msg) {
    errorEl.textContent = "Can't parse: " + msg + ".";
    errorEl.hidden = false;
    which.classList.add("invalid");
    outputEl.classList.add("stale");
  }

  for (var b = 0; b < boxes.length; b++) {
    boxes[b].addEventListener("change", function () {
      var m = 0;
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].checked) m |= BITS[boxes[i].getAttribute("data-bit")];
      }
      setMode(m, "boxes");
    });
  }

  var octalTimer = null;
  octalInput.addEventListener("input", function () {
    clearTimeout(octalTimer);
    octalTimer = setTimeout(function () {
      var m = parseOctal(octalInput.value.trim());
      if (m === null) fail(octalInput, "octal mode is 3-4 digits, each 0-7");
      else setMode(m, "octal");
    }, 150);
  });
  octalInput.addEventListener("blur", function () {
    if (parseOctal(octalInput.value.trim()) !== null) octalInput.value = octalStr(mode);
  });

  var symTimer = null;
  symbolicInput.addEventListener("input", function () {
    clearTimeout(symTimer);
    symTimer = setTimeout(function () {
      var res = parseSymbolic(symbolicInput.value.trim(), mode);
      if (res.error) fail(symbolicInput, "symbolic field: " + res.error);
      else setMode(res.mode, "symbolic");
    }, 200);
  });
  symbolicInput.addEventListener("blur", function () {
    var res = parseSymbolic(symbolicInput.value.trim(), mode);
    if (!res.error) symbolicInput.value = symbolicCanonical(mode);
  });

  var umaskTimer = null;
  umaskInput.addEventListener("input", function () {
    clearTimeout(umaskTimer);
    umaskTimer = setTimeout(function () {
      var text = umaskInput.value.trim();
      if (!/^[0-7]{1,4}$/.test(text)) {
        fail(umaskInput, "umask is 1-4 octal digits");
        return;
      }
      umaskVal = parseInt(text, 8) & 511;
      errorEl.hidden = true;
      umaskInput.classList.remove("invalid");
      outputEl.classList.remove("stale");
      refreshUmask();
    }, 150);
  });

  // ---- one-click examples ----
  var EXAMPLES = {
    classic: { octal: "755" },
    setuid: { octal: "4755" },
    private: { symbolic: "u=rw,go=" },
  };
  var exampleBtns = document.querySelectorAll(".example-btn[data-example]");
  for (var ei = 0; ei < exampleBtns.length; ei++) {
    exampleBtns[ei].addEventListener("click", function () {
      var ex = EXAMPLES[this.getAttribute("data-example")];
      if (ex == null) return;
      if (ex.octal) {
        setMode(parseOctal(ex.octal), "buttons");
      } else {
        symbolicInput.value = ex.symbolic;
        var res = parseSymbolic(ex.symbolic, mode);
        if (!res.error) setMode(res.mode, "buttons");
      }
    });
  }

  refresh("init");
})();
