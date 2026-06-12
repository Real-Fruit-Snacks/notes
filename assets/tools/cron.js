// Cron Parser: parse a five-field (or @shortcut) crontab expression and
// render a plain-English description, a field-by-field breakdown, and the
// next ten run times in the browser's local timezone. Clean-room Vixie-cron
// semantics: 3-letter names, ranges, lists, steps, 0-or-7 Sunday, and the
// day-of-month/day-of-week OR rule (OR only when neither field starts with
// "*"). Verified against curated calendar vectors plus an independent
// brute-force minute scanner in the extraction harness.
(function () {
  var input = document.getElementById("cron-input");
  var descEl = document.getElementById("cron-desc");
  if (!input || !descEl) return;
  var errorEl = document.getElementById("cron-error");
  var fieldsEl = document.getElementById("cron-fields");
  var runsEl = document.getElementById("cron-runs");
  var outputEl = document.getElementById("cron-output");

  var RUN_COUNT = 10;
  var SCAN_DAYS = 366 * 5; // enough to reach a Feb-29-only schedule

  var MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                     "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var DOW_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var MONTH_FULL = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"];
  var DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday",
                  "Thursday", "Friday", "Saturday"];

  var SHORTCUTS = {
    "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *",
    "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0",
    "@daily": "0 0 * * *", "@midnight": "0 0 * * *",
    "@hourly": "0 * * * *",
  };

  // Field index order matches the expression: minute hour dom month dow.
  var FIELDS = [
    { label: "Minute", min: 0, max: 59 },
    { label: "Hour", min: 0, max: 23 },
    { label: "Day of month", min: 1, max: 31 },
    { label: "Month", min: 1, max: 12, names: MONTH_NAMES },
    { label: "Day of week", min: 0, max: 7, names: DOW_NAMES }, // 7 folds to 0
  ];

  function atom(tok, f) {
    if (/^\d+$/.test(tok)) return Number(tok);
    if (f.names && /^[A-Za-z]{3}$/.test(tok)) {
      var i = f.names.indexOf(tok.toUpperCase());
      if (i >= 0) return f.names === DOW_NAMES ? i : i + 1; // months are 1-based
    }
    return null;
  }

  // One field -> { set, star, parts } or { error }. The star flag mirrors
  // Vixie cron: set when the field TEXT starts with "*", step or not.
  function parseField(text, f) {
    var set = [];
    for (var i = 0; i <= f.max; i++) set.push(false);
    var star = text.charAt(0) === "*";
    var parts = [];
    var toks = text.split(",");
    for (var t = 0; t < toks.length; t++) {
      var m = /^([^\/]+)(?:\/(\d+))?$/.exec(toks[t]);
      if (!m || !m[1]) return { error: 'unreadable value "' + toks[t] + '"' };
      var step = m[2] === undefined ? 1 : Number(m[2]);
      if (step < 1) return { error: "step /" + m[2] + " must be at least 1" };
      var body = m[1], a, b;
      if (body === "*") {
        a = f.min; b = f.max;
      } else {
        var r = body.split("-");
        if (r.length > 2) return { error: 'unreadable range "' + body + '"' };
        a = atom(r[0], f);
        if (a === null) return { error: 'unreadable value "' + r[0] + '"' };
        if (r.length === 2) {
          b = atom(r[1], f);
          if (b === null) return { error: 'unreadable value "' + r[1] + '"' };
        } else {
          b = m[2] === undefined ? a : f.max; // Vixie "5/10": from 5 to max
        }
      }
      if (a < f.min || a > f.max || b < f.min || b > f.max) {
        return { error: '"' + body + '" is outside ' + f.min + "-" + f.max };
      }
      if (a > b) {
        return { error: 'range "' + body + '" runs backwards' +
          (f.names === DOW_NAMES ? " (weeks don't wrap; list the days instead)" : "") };
      }
      for (var v = a; v <= b; v += step) set[v] = true;
      parts.push({ a: a, b: b, step: step, star: body === "*" });
    }
    if (f.names === DOW_NAMES && set[7]) { set[0] = true; set[7] = false; }
    return { set: set, star: star, parts: parts };
  }

  function parse(text) {
    var t = text.trim();
    if (!t) return { error: "type a schedule - five space-separated fields" };
    var lower = t.toLowerCase();
    if (lower === "@reboot") return { reboot: true };
    if (SHORTCUTS[lower]) t = SHORTCUTS[lower];
    else if (t.charAt(0) === "@") return { error: 'unknown shortcut "' + t + '"' };
    var raw = t.split(/\s+/);
    if (raw.length !== 5) {
      return { error: "expected 5 fields, got " + raw.length +
        (raw.length === 6 || raw.length === 7
          ? " (a seconds field is a Quartz extension, not classic cron)" : "") };
    }
    var fields = [];
    for (var i = 0; i < 5; i++) {
      var p = parseField(raw[i], FIELDS[i]);
      if (p.error) return { error: FIELDS[i].label.toLowerCase() + " field: " + p.error };
      p.raw = raw[i];
      fields.push(p);
    }
    return { fields: fields, expanded: t };
  }

  function valuesOf(field, max) {
    var out = [];
    for (var i = 0; i < field.set.length && i <= max; i++) {
      if (field.set[i]) out.push(i);
    }
    return out;
  }

  // Vixie day rule: OR when BOTH day fields are restricted (no leading "*"),
  // AND otherwise - so "*/2" in one field still forces both to match.
  function dayMatches(spec, dom, dow) {
    var domHit = spec.fields[2].set[dom];
    var dowHit = spec.fields[4].set[dow];
    if (spec.fields[2].star || spec.fields[4].star) return domHit && dowHit;
    return domHit || dowHit;
  }

  function nextRuns(spec, from, count) {
    var runs = [];
    var minutes = valuesOf(spec.fields[0], 59);
    var hours = valuesOf(spec.fields[1], 23);
    var start = new Date(from.getTime());
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1); // strictly in the future
    var day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (var d = 0; d < SCAN_DAYS && runs.length < count; d++) {
      var y = day.getFullYear(), mo = day.getMonth(), dt = day.getDate();
      if (spec.fields[3].set[mo + 1] && dayMatches(spec, dt, day.getDay())) {
        for (var hi = 0; hi < hours.length && runs.length < count; hi++) {
          for (var mi = 0; mi < minutes.length && runs.length < count; mi++) {
            var when = new Date(y, mo, dt, hours[hi], minutes[mi]);
            if (when >= start) runs.push(when);
          }
        }
      }
      day = new Date(y, mo, dt + 1);
    }
    return runs;
  }

  // ---- plain-English description ----
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function joinAnd(arr) {
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + " and " + arr[1];
    return arr.slice(0, arr.length - 1).join(", ") + " and " + arr[arr.length - 1];
  }

  // Shape of a field for phrasing: every | step | one | range | steprange | list.
  function kindOf(field) {
    if (field.parts.length !== 1) return { kind: "list" };
    var p = field.parts[0];
    if (p.star) return p.step === 1 ? { kind: "every" } : { kind: "step", n: p.step };
    if (p.a === p.b) return { kind: "one", a: p.a };
    return p.step === 1 ? { kind: "range", a: p.a, b: p.b }
                        : { kind: "steprange", a: p.a, b: p.b, n: p.step };
  }

  function timePhrase(minF, hourF) {
    var mk = kindOf(minF), hk = kindOf(hourF);
    if (mk.kind === "one" && hk.kind === "one") {
      return "At " + pad2(hk.a) + ":" + pad2(mk.a);
    }
    if (mk.kind === "one" && hk.kind === "every") {
      return "At minute " + mk.a + " of every hour";
    }
    var hourVals = valuesOf(hourF, 23);
    if (mk.kind === "one" && hourVals.length <= 4) {
      var times = [];
      for (var i = 0; i < hourVals.length; i++) {
        times.push(pad2(hourVals[i]) + ":" + pad2(mk.a));
      }
      return "At " + joinAnd(times);
    }
    var minPart;
    if (mk.kind === "every") minPart = "Every minute";
    else if (mk.kind === "step") minPart = "Every " + mk.n + " minutes";
    else if (mk.kind === "one") minPart = "At minute " + mk.a;
    else if (mk.kind === "range") {
      minPart = "Every minute from :" + pad2(mk.a) + " through :" + pad2(mk.b);
    } else if (mk.kind === "steprange") {
      minPart = "Every " + mk.n + " minutes from :" + pad2(mk.a) + " through :" + pad2(mk.b);
    } else {
      var mv = valuesOf(minF, 59), mlist = [];
      for (var j = 0; j < mv.length; j++) mlist.push(":" + pad2(mv[j]));
      minPart = "At minutes " + joinAnd(mlist);
    }
    var hourPart;
    if (hk.kind === "every") hourPart = "";
    else if (hk.kind === "one") hourPart = "during the " + pad2(hk.a) + ":00 hour";
    else if (hk.kind === "range") {
      hourPart = "between " + pad2(hk.a) + ":00 and " + pad2(hk.b) + ":59";
    } else if (hk.kind === "step") hourPart = "every " + hk.n + " hours";
    else if (hk.kind === "steprange") {
      hourPart = "every " + hk.n + " hours from " + pad2(hk.a) + ":00 through " + pad2(hk.b) + ":59";
    } else {
      hourPart = "during hours " + joinAnd(hourVals);
    }
    return hourPart ? minPart + " " + hourPart : minPart;
  }

  function domPhrase(field) {
    var k = kindOf(field);
    if (k.kind === "every") return "";
    if (k.kind === "step") return "on every " + ordinal(k.n) + " day of the month";
    if (k.kind === "one") return "on day " + k.a + " of the month";
    if (k.kind === "range") return "on days " + k.a + " through " + k.b + " of the month";
    return "on days " + joinAnd(valuesOf(field, 31)) + " of the month";
  }

  function dowPhrase(field) {
    var k = kindOf(field);
    if (k.kind === "every") return "";
    if (k.kind === "one") return "on " + DOW_FULL[k.a % 7];
    if (k.kind === "range" && k.b <= 6) {
      return "on " + DOW_FULL[k.a] + " through " + DOW_FULL[k.b];
    }
    var names = [];
    var dv = valuesOf(field, 6);
    for (var i = 0; i < dv.length; i++) names.push(DOW_FULL[dv[i]]);
    return "on " + joinAnd(names);
  }

  function monthPhrase(field) {
    var k = kindOf(field);
    if (k.kind === "every") return "";
    if (k.kind === "one") return "in " + MONTH_FULL[k.a - 1];
    if (k.kind === "range") return "in " + MONTH_FULL[k.a - 1] + " through " + MONTH_FULL[k.b - 1];
    var names = [];
    var mv = valuesOf(field, 12);
    for (var i = 0; i < mv.length; i++) names.push(MONTH_FULL[mv[i] - 1]);
    return "in " + joinAnd(names);
  }

  function ordinal(n) {
    var tail = n % 100;
    if (tail >= 11 && tail <= 13) return n + "th";
    if (n % 10 === 1) return n + "st";
    if (n % 10 === 2) return n + "nd";
    if (n % 10 === 3) return n + "rd";
    return n + "th";
  }

  function describe(spec) {
    var dom = spec.fields[2], dow = spec.fields[4];
    var domP = domPhrase(dom), dowP = dowPhrase(dow);
    var dayPart;
    if (domP && dowP) {
      // Both phrased: OR when both are restricted, AND when a "*" step is in play.
      dayPart = (dom.star || dow.star) ? domP + ", and only " + dowP
                                       : domP + ", or " + dowP;
    } else {
      dayPart = domP || dowP;
    }
    var parts = [timePhrase(spec.fields[0], spec.fields[1])];
    if (dayPart) parts.push(dayPart);
    var monthP = monthPhrase(spec.fields[3]);
    if (monthP) parts.push(monthP);
    return parts.join(", ") + ".";
  }

  // ---- field-by-field breakdown ----
  function meaning(idx, field) {
    var k = kindOf(field);
    if (idx === 0) {
      if (k.kind === "every") return "every minute";
      if (k.kind === "one") return "only minute " + k.a + " (:" + pad2(k.a) + ")";
      var mv = valuesOf(field, 59), ml = [];
      for (var i = 0; i < mv.length; i++) ml.push(":" + pad2(mv[i]));
      if (k.kind === "step") {
        return "every " + ordinal(k.n) + " minute" +
          (ml.length <= 8 ? " (" + ml.join(", ") + ")" : "");
      }
      return ml.length <= 8 ? "minutes " + ml.join(", ")
                            : mv.length + " selected minutes";
    }
    if (idx === 1) {
      if (k.kind === "every") return "every hour";
      if (k.kind === "one") return "only " + pad2(k.a) + ":00-" + pad2(k.a) + ":59";
      if (k.kind === "range") return pad2(k.a) + ":00 through " + pad2(k.b) + ":59";
      var hv = valuesOf(field, 23);
      if (k.kind === "step") return "every " + ordinal(k.n) + " hour (" + hv.join(", ") + ")";
      return hv.length <= 8 ? "hours " + hv.join(", ") : hv.length + " selected hours";
    }
    if (idx === 2) {
      if (k.kind === "every") return "every day of the month";
      if (k.kind === "one") return "only day " + k.a;
      var dv = valuesOf(field, 31);
      if (k.kind === "step") {
        return "every " + ordinal(k.n) + " day" +
          (dv.length <= 8 ? " (" + dv.join(", ") + ")" : " (" + dv[0] + ", " + dv[1] + ", " + dv[2] + ", …)");
      }
      return dv.length <= 8 ? "days " + dv.join(", ") : dv.length + " selected days";
    }
    if (idx === 3) {
      if (k.kind === "every") return "every month";
      var mv2 = valuesOf(field, 12), mn = [];
      for (var j = 0; j < mv2.length; j++) mn.push(MONTH_FULL[mv2[j] - 1]);
      return mn.length === 1 ? "only " + mn[0] : mn.join(", ");
    }
    if (k.kind === "every") return "every day of the week";
    var wv = valuesOf(field, 6), wn = [];
    for (var w = 0; w < wv.length; w++) wn.push(DOW_FULL[wv[w]]);
    return wn.length === 1 ? "only " + wn[0] : wn.join(", ");
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

  function fmtRun(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function humanDelta(ms) {
    var min = Math.round(ms / 60000);
    if (min < 1) return "in under a minute";
    if (min < 60) return "in " + min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    if (h < 48) return "in " + h + " h" + (m ? " " + m + " min" : "");
    return "in " + Math.round(min / 1440) + " days";
  }

  function mutedLi(text) {
    var li = document.createElement("li");
    li.className = "muted";
    li.textContent = text;
    return li;
  }

  function render() {
    var res = parse(input.value);
    if (res.error) {
      errorEl.textContent = "Can't parse: " + res.error + ".";
      errorEl.hidden = false;
      input.classList.add("invalid");
      outputEl.classList.add("stale");
      return;
    }
    errorEl.hidden = true;
    input.classList.remove("invalid");
    outputEl.classList.remove("stale");
    fieldsEl.textContent = "";
    runsEl.textContent = "";

    if (res.reboot) {
      descEl.textContent = "At every system boot — @reboot has no calendar schedule.";
      fieldsEl.hidden = true;
      runsEl.appendChild(mutedLi("Runs once at boot; there are no times to project."));
      return;
    }
    fieldsEl.hidden = false;
    descEl.textContent = describe(res);

    if (res.expanded !== input.value.trim()) {
      fieldsEl.appendChild(factRow("Expands to", res.expanded));
    }
    for (var i = 0; i < 5; i++) {
      fieldsEl.appendChild(factRow(
        FIELDS[i].label + " · " + res.fields[i].raw, meaning(i, res.fields[i])));
    }
    var domF = res.fields[2], dowF = res.fields[4];
    var domTrivial = kindOf(domF).kind === "every";
    var dowTrivial = kindOf(dowF).kind === "every";
    if (!domTrivial && !dowTrivial) {
      fieldsEl.appendChild(factRow("Day rule",
        (domF.star || dowF.star)
          ? "both day fields must match (a field starting with * keeps AND matching)"
          : "day of month OR day of week — either match runs the job"));
    }

    var now = new Date();
    var runs = nextRuns(res, now, RUN_COUNT);
    for (var r = 0; r < runs.length; r++) {
      var li = document.createElement("li");
      li.textContent = fmtRun(runs[r]) + " · " + DOW_NAMES[runs[r].getDay()];
      if (r === 0) {
        var delta = document.createElement("span");
        delta.className = "muted";
        delta.textContent = " · " + humanDelta(runs[r].getTime() - now.getTime());
        li.appendChild(delta);
      }
      runsEl.appendChild(li);
    }
    if (!runs.length) {
      runsEl.appendChild(mutedLi("No matching times in the next 5 years."));
    } else if (runs.length < RUN_COUNT) {
      runsEl.appendChild(mutedLi("only " + runs.length + " matching time" +
        (runs.length > 1 ? "s" : "") + " in the next 5 years"));
    }
  }

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });

  // ---- one-click examples ----
  var EXAMPLES = {
    quarter: "*/15 2 * * 1-5",
    names: "0 9 * * MON,WED,FRI",
    trap: "0 0 13 * FRI", // every Friday AND every 13th: the OR rule
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
