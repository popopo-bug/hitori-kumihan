/*! ひとり組版 v1.0.0 (web) */
(function(g){g.HK=g.HK||{};g.HK.edition="web";g.HK.version="1.0.0";})(window);
/* ---- kumi.js ---- */
/* ひとり組版 — 組版エンジン（DOMを使わない。node --test で確かめる） */
(function (g) {
  'use strict';
  const HK = (g.HK = g.HK || {});
  HK.edition = HK.edition || 'web'; // build で 'web' | 'pro' | 'trial'

  // ---------------- 文字の分類 ----------------
  const SMALL_KANA = 'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ';
  const START_NG_BASE = '、。，．」』）〕］｝〉》】〙〗〟’”｠！？‼⁇⁈⁉・：；ゝゞヽヾ々〻' + ')]}>,.!?:;';
  const START_NG_STRICT = START_NG_BASE + SMALL_KANA + 'ー';
  const END_NG = '「『（〔［｛〈《【〘〖〝‘“｟' + '([{<';
  const HANG = '、。，．';
  const OPEN = '「『（〔［｛〈《【〘〖〝‘“';
  const CLOSE_OR_PUNCT = '」』）〕］｝〉》】〙〗〟’”、。，．！？‼⁇⁈⁉　 ';
  const KANJI = /[㐀-䶿一-鿿豈-﫿々〆〇ヶヵ仝\u{20000}-\u{2ffff}]/u;

  const chars = (s) => Array.from(s || '');

  // ---------------- 設定 ----------------
  const PT = 25.4 / 72; // 1pt = 0.3528mm

  const SIZES = {
    bunko: { name: '文庫（A6）', w: 105, h: 148, fontSize: 9, chars: 37, lines: 15, cols: 1 },
    shinsho: { name: '新書', w: 103, h: 182, fontSize: 9, chars: 41, lines: 15, cols: 1 },
    shinsho2: { name: '新書・2段組', w: 103, h: 182, fontSize: 8.5, chars: 22, lines: 17, cols: 2, lineGap: 0.6 },
    shiroku: { name: '四六判', w: 127, h: 188, fontSize: 9, chars: 41, lines: 17, cols: 1 },
    b6: { name: 'B6', w: 128, h: 182, fontSize: 9, chars: 42, lines: 18, cols: 1 },
    a5: { name: 'A5・2段組', w: 148, h: 210, fontSize: 9, chars: 26, lines: 20, cols: 2 },
    a5one: { name: 'A5・1段', w: 148, h: 210, fontSize: 10, chars: 39, lines: 18, cols: 1 },
    custom: { name: '自由に決める', w: 105, h: 148, fontSize: 9, chars: 37, lines: 15, cols: 1 }
  };

  const DEFAULTS = {
    size: 'bunko',
    pageW: 105,
    pageH: 148,
    bleed: 0, // 塗り足し mm（0 または 3）
    font: 'bizmin',
    fontSize: 9, // pt
    chars: 37, // 1行（1段）の字数
    lines: 15, // 1ページの行数
    lineGap: 0.75, // 行間（文字サイズの何倍あけるか）
    cols: 1,
    colGap: 2, // 段間（字）
    gutterDiff: 4, // のどを小口より何mm広くするか
    vShift: 0, // 版面を下へずらす mm（マイナスで上）
    nombre: 'bottom-outer', // bottom-outer | bottom-center | top-outer | none
    nombreSize: 7.5,
    hiddenNombre: true,
    nombreStart: 1,
    runningHead: false,
    indent: 'auto', // auto | keep
    dialogNoIndent: true,
    blankLines: 'keep', // keep | collapse | remove
    kinsoku: 'strict', // strict | loose
    hang: true,
    fixBang: true,
    fixBangSpace: true,
    fixEllipsis: true,
    fixDash: true,
    tcyDigits: 2, // 何けたまでの半角数字を縦中横にするか（0 で縦中横にしない）
    fixKana: true,
    fixQuotes: true,
    latin: 'sideways', // sideways | upright
    chapterBreak: 'page', // page | odd | none
    headScale: 1.3,
    title: '',
    author: '',
    titlePage: true,
    toc: false,
    bodyStartOdd: true,
    colophon: true,
    coDate: '',
    coPublisher: '',
    coContact: '',
    coPrinter: '',
    coNote: '本書の無断転載・複製を禁じます。',
    pad: 4 // 総ページ数を何の倍数にするか（0 でそろえない）
  };

  function settings(over) {
    const s = Object.assign({}, DEFAULTS, over || {});
    s.cols = s.cols === 2 ? 2 : 1;
    s.chars = clampInt(s.chars, 8, 80);
    s.lines = clampInt(s.lines, 4, 60);
    s.fontSize = clampNum(s.fontSize, 5, 20);
    s.lineGap = clampNum(s.lineGap, 0.2, 2);
    s.bleed = s.bleed ? 3 : 0;
    return s;
  }
  function clampInt(v, lo, hi) {
    v = Math.round(Number(v));
    return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
  }
  function clampNum(v, lo, hi) {
    v = Number(v);
    return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
  }

  /** 版面と余白の計算（mm）。side は 'L'（奇数・左ページ）か 'R'（偶数・右ページ） */
  function geom(sIn) {
    const s = settings(sIn);
    const fs = s.fontSize * PT;
    const pitch = fs * (1 + s.lineGap);
    const colH = s.chars * fs;
    const gapH = s.cols === 2 ? s.colGap * fs : 0;
    const blockH = s.cols * colH + gapH;
    const blockW = (s.lines - 1) * pitch + fs;
    const top = (s.pageH - blockH) / 2 + s.vShift;
    const center = (s.pageW - blockW) / 2;
    const leftL = center - s.gutterDiff / 2; // 左ページ：のどは右
    const leftR = center + s.gutterDiff / 2; // 右ページ：のどは左
    const m = {
      top,
      bottom: s.pageH - top - blockH,
      koguchi: leftL,
      nodo: s.pageW - leftL - blockW
    };
    const warnings = [];
    if (blockH > s.pageH || blockW > s.pageW) warnings.push('文字がページに入りきりません。字数・行数か文字サイズを減らしてください');
    else {
      if (m.top < 8 || m.bottom < 8) warnings.push('天か地（上下の余白）が8mmより狭くなっています');
      if (m.koguchi < 8) warnings.push('小口（外側の余白）が8mmより狭くなっています');
      if (m.nodo < 12) warnings.push('のど（綴じる側の余白）が12mmより狭くなっています。厚い本は15mm以上が安心です');
    }
    return {
      s,
      fs,
      pitch,
      colH,
      gapH,
      blockH,
      blockW,
      top,
      left: { L: leftL, R: leftR },
      margins: m,
      pageW: s.pageW + s.bleed * 2,
      pageH: s.pageH + s.bleed * 2,
      bleed: s.bleed,
      warnings
    };
  }

  // ---------------- 原稿の読み取り ----------------
  /** テキスト → ブロックの列 {type:'p'|'blank'|'h'|'break', ...} */
  function parse(text, sIn) {
    const s = settings(sIn);
    let src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const lines = src.split('\n');
    const blocks = [];
    let blockIndent = 0;
    for (let raw of lines) {
      let line = raw.replace(/[ \t]+$/, '');
      // 行頭の半角スペース・タブを全角スペースに
      line = line.replace(/^[ \t]+/, (m) => {
        let n = 0;
        for (const c of m) n += c === '\t' ? 2 : 1;
        return '　'.repeat(Math.ceil(n / 2));
      });
      // ---- 行単位の指定 ----
      if (/^\s*(\[newpage\]|［＃改ページ］|［＃改見開き］)\s*$/.test(line)) {
        blocks.push({ type: 'break', kind: 'page' });
        continue;
      }
      if (/^\s*［＃改丁］\s*$/.test(line)) {
        blocks.push({ type: 'break', kind: 'odd' });
        continue;
      }
      if (/^\s*［＃改段］\s*$/.test(line)) {
        blocks.push({ type: 'break', kind: 'col' });
        continue;
      }
      let m;
      if ((m = /^［＃ここから(\d+|[０-９]+)字下げ］$/.exec(line.trim()))) {
        blockIndent = toInt(m[1]);
        continue;
      }
      if (/^［＃ここで字下げ終わり］$/.test(line.trim())) {
        blockIndent = 0;
        continue;
      }
      let indent = blockIndent;
      let align = '';
      // 行頭の［＃N字下げ］・［＃地付き］・［＃地からN字上げ］
      line = line.replace(/^［＃(\d+|[０-９]+)字下げ］/, (_, n) => {
        indent = toInt(n);
        return '';
      });
      line = line.replace(/［＃地付き］/, () => {
        align = 'bottom:0';
        return '';
      });
      line = line.replace(/［＃地から(\d+|[０-９]+)字上げ］/, (_, n) => {
        align = 'bottom:' + toInt(n);
        return '';
      });
      const head = heading(line);
      if (head) {
        blocks.push({ type: 'h', level: head.level, items: inline(head.text, s) });
        continue;
      }
      if (line.trim() === '' || /^(［＃[^］]*］)+$/.test(line.trim())) {
        blocks.push({ type: 'blank' });
        continue;
      }
      const p = { type: 'p', items: inline(line, s) };
      if (indent) p.indent = indent;
      if (align) p.align = align;
      blocks.push(p);
    }
    return collapseBlanks(blocks, s.blankLines);
  }

  function toInt(n) {
    return parseInt(String(n).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)), 10) || 0;
  }

  function heading(line) {
    const t = line.trim();
    let m;
    if ((m = /^(#{1,2}|＃{1,2})[ 　]+(.+)$/.exec(t))) return { level: m[1].length, text: m[2].trim() };
    if ((m = /^\[chapter:(.+)\]$/.exec(t))) return { level: 1, text: m[1].trim() };
    const t2 = t.replace(/^(［＃[^］]*字下げ］)+/, '');
    if ((m = /^［＃(大|中|小|窓|同行)見出し］(.+?)［＃\1見出し終わり］$/.exec(t2))) return { level: m[1] === '大' ? 1 : 2, text: m[2] };
    if ((m = /^(.+?)［＃「(.+?)」は(大|中|小|窓|同行)見出し］$/.exec(t2)) && m[1].endsWith(m[2])) return { level: m[3] === '大' ? 1 : 2, text: m[1] };
    return null;
  }

  function collapseBlanks(blocks, mode) {
    if (mode === 'keep') return blocks;
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].type !== 'blank') {
        out.push(blocks[i]);
        continue;
      }
      let j = i;
      while (j < blocks.length && blocks[j].type === 'blank') j++;
      const run = j - i;
      if (mode === 'collapse') out.push(blocks[i]);
      else if (mode === 'remove' && run >= 2) out.push(blocks[i]);
      i = j - 1;
    }
    return out;
  }

  /** 1段落の文字列 → items [{k:'t',s}|{k:'r',base,rt}|{k:'e',s}|{k:'y',s}] */
  function inline(str, s) {
    const items = [];
    const pushText = (t, k) => {
      if (!t) return;
      const last = items[items.length - 1];
      if (last && last.k === (k || 't')) last.s += t;
      else items.push({ k: k || 't', s: t });
    };
    let i = 0;
    const src = str;
    while (i < src.length) {
      const rest = src.slice(i);
      let m;
      // pixiv [[rb:漢字 > かんじ]]
      if ((m = /^\[\[rb:\s*([^>\]]+?)\s*>\s*([^\]]+?)\s*\]\]/.exec(rest))) {
        pushRuby(m[1], m[2]);
        i += m[0].length;
        continue;
      }
      // 傍点 《《 》》
      if ((m = /^《《([^》]+)》》/.exec(rest))) {
        pushText(m[1], 'e');
        i += m[0].length;
        continue;
      }
      // ｜親文字《ルビ》 ／ |親文字(ルビ)
      if ((m = /^[｜|]([^｜|《》\n]+?)《([^》\n]+)》/.exec(rest)) || (m = /^[｜|]([^｜|()（）\n]+?)[(（]([^)）\n]+)[)）]/.exec(rest))) {
        pushRuby(m[1], m[2]);
        i += m[0].length;
        continue;
      }
      // 漢字《かんじ》（親文字は直前の漢字の続き）
      if ((m = /^《([^》\n]+)》/.exec(rest))) {
        const last = items[items.length - 1];
        if (last && last.k === 't') {
          const cs = chars(last.s);
          let j = cs.length;
          while (j > 0 && KANJI.test(cs[j - 1])) j--;
          if (j < cs.length) {
            const base = cs.slice(j).join('');
            last.s = cs.slice(0, j).join('');
            if (!last.s) items.pop();
            pushRuby(base, m[1]);
            i += m[0].length;
            continue;
          }
        }
        pushText('《');
        i += 1;
        continue;
      }
      // 青空文庫の注記
      if (rest.startsWith('［＃')) {
        const end = rest.indexOf('］');
        if (end > 0) {
          const note = rest.slice(2, end);
          i += end + 1;
          if ((m = /^「(.+?)」に(.*傍点|.*圏点)$/.exec(note))) {
            markEmphasis(m[1]);
            continue;
          }
          if (note === '縦中横') {
            const close = src.indexOf('［＃縦中横終わり］', i);
            if (close > i) {
              pushText(src.slice(i, close), 'y');
              i = close + '［＃縦中横終わり］'.length;
            }
            continue;
          }
          if ((m = /U\+([0-9A-Fa-f]{4,6})/.exec(note))) {
            // ※［＃「…」、U+XXXX、…］ → その文字に
            const last = items[items.length - 1];
            if (last && last.k === 't' && last.s.endsWith('※')) last.s = last.s.slice(0, -1);
            pushText(String.fromCodePoint(parseInt(m[1], 16)));
          }
          continue; // そのほかの注記は消す
        }
      }
      if (rest[0] === '\\' && /^\\[《》｜|]/.test(rest)) {
        pushText(rest[1]);
        i += 2;
        continue;
      }
      // ふつうの文字（サロゲートペアごと）
      const cp = src.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      pushText(ch);
      i += ch.length;
    }
    function pushRuby(base, rt) {
      if (/^[・﹅･]+$/.test(rt)) pushText(base, 'e');
      else items.push({ k: 'r', base, rt });
    }
    function markEmphasis(target) {
      for (let k = items.length - 1; k >= 0; k--) {
        const it = items[k];
        if (it.k !== 't') continue;
        const at = it.s.lastIndexOf(target);
        if (at < 0) continue;
        const before = it.s.slice(0, at), after = it.s.slice(at + target.length);
        const repl = [];
        if (before) repl.push({ k: 't', s: before });
        repl.push({ k: 'e', s: target });
        if (after) repl.push({ k: 't', s: after });
        items.splice(k, 1, ...repl);
        return;
      }
    }
    // 自動修正（文字列のまま直せるもの）
    for (const it of items) {
      if (it.k === 't' || it.k === 'e') it.s = fixText(it.s, s);
      else if (it.k === 'r') it.base = fixText(it.base, Object.assign({}, s, { fixDash: false, fixEllipsis: false }));
    }
    return items;
  }

  const HW_KANA = /[｡-ﾟ]+/g;
  function fixText(t, s) {
    if (s.fixKana) t = t.replace(HW_KANA, (m) => m.normalize('NFKC'));
    if (s.fixQuotes) {
      t = t.replace(/“/g, '〝').replace(/”/g, '〟');
      let open = true;
      if ((t.match(/"/g) || []).length % 2 === 0) t = t.replace(/"/g, () => ((open = !open), open ? '〟' : '〝'));
    }
    if (s.fixEllipsis) {
      t = t.replace(/\.{3,}|・{3,}|･{3,}/g, (m) => '……'.repeat(Math.max(1, Math.round(m.length / 3))));
      t = t.replace(/…+/g, (m) => '…'.repeat(m.length + (m.length % 2)));
    }
    if (s.fixDash) t = t.replace(/[—―─━]+/g, (m) => '―'.repeat(m.length + (m.length % 2)));
    return t;
  }

  // ---------------- 箱（行分けの単位）に分ける ----------------
  // 箱: {k:'c'|'sp'|'tcy'|'lat'|'dash'|'run'|'ruby', w(字), s, em?, rt?, auto?}
  const isLatin = (c) => /[A-Za-z]/.test(c);
  const isDigit = (c) => /[0-9]/.test(c);
  const toFull = (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0);

  function boxesOf(items, s, measure) {
    const out = [];
    for (const it of items) {
      if (it.k === 'r') {
        const baseW = chars(it.base).length;
        const rtW = chars(it.rt).length / 2;
        out.push({ k: 'ruby', s: it.base, rt: it.rt, w: Math.max(baseW, rtW), bw: baseW });
        continue;
      }
      if (it.k === 'y') {
        out.push({ k: 'tcy', s: it.s, w: 1 });
        continue;
      }
      const em = it.k === 'e';
      const cs = chars(it.s);
      let i = 0;
      while (i < cs.length) {
        const c = cs[i];
        // 英単語
        if (isLatin(c) && s.latin !== 'upright') {
          let j = i + 1;
          while (j < cs.length && /[A-Za-z0-9'’.\-&]/.test(cs[j])) j++;
          // 末尾のピリオドは単語に含めない（文の終わり）
          while (j > i + 1 && cs[j - 1] === '.') j--;
          const word = cs.slice(i, j).join('');
          out.push({ k: 'lat', s: word, w: measure(word), em });
          i = j;
          continue;
        }
        if (isLatin(c) && s.latin === 'upright') {
          out.push({ k: 'c', s: toFull(c), w: 1, em });
          i++;
          continue;
        }
        // 半角数字
        if (isDigit(c)) {
          let j = i + 1;
          while (j < cs.length && isDigit(cs[j])) j++;
          const num = cs.slice(i, j).join('');
          if (num.length >= 2 && num.length <= s.tcyDigits) out.push({ k: 'tcy', s: num, w: 1, em });
          else for (const d of num) out.push({ k: 'c', s: toFull(d), w: 1, em });
          i = j;
          continue;
        }
        // ! ?
        if (/[!?！？]/.test(c)) {
          let j = i + 1;
          while (j < cs.length && /[!?！？]/.test(cs[j])) j++;
          const run = cs.slice(i, j);
          if (s.fixBang && run.length === 2) out.push({ k: 'tcy', s: run.map(half).join(''), w: 1, bang: true, em });
          else for (const b of run) out.push({ k: 'c', s: s.fixBang ? full(b) : b, w: 1, em });
          i = j;
          continue;
        }
        // ダッシュ（2つ組）
        if (c === '―') {
          let j = i + 1;
          while (j < cs.length && cs[j] === '―') j++;
          let n = j - i;
          while (n >= 2) {
            out.push({ k: 'dash', s: '――', w: 2 });
            n -= 2;
          }
          if (n) out.push({ k: 'dash', s: '―', w: 1 });
          i = j;
          continue;
        }
        // 三点・二点リーダー（2つ組で分けない）
        if (c === '…' || c === '‥') {
          let j = i + 1;
          while (j < cs.length && cs[j] === c) j++;
          let n = j - i;
          while (n >= 2) {
            out.push({ k: 'run', s: c + c, w: 2, em });
            n -= 2;
          }
          if (n) out.push({ k: 'c', s: c, w: 1, em });
          i = j;
          continue;
        }
        if (c === '　') {
          out.push({ k: 'sp', s: c, w: 1 });
          i++;
          continue;
        }
        if (c === ' ') {
          out.push({ k: 'sp', s: ' ', w: 0.3 });
          i++;
          continue;
        }
        out.push({ k: 'c', s: c, w: 1, em });
        i++;
      }
    }
    // ！？ のあとの全角スペース
    if (s.fixBangSpace) {
      for (let i = out.length - 2; i >= 0; i--) {
        const b = out[i];
        const isBang = (b.k === 'c' && /[！？‼⁇⁈⁉]/.test(b.s)) || (b.k === 'tcy' && b.bang);
        if (!isBang) continue;
        const n = out[i + 1];
        const nf = firstChar(n);
        if (n.k === 'sp' || CLOSE_OR_PUNCT.includes(nf) || (n.k === 'tcy' && n.bang) || /[！？‼⁇⁈⁉]/.test(nf)) continue;
        out.splice(i + 1, 0, { k: 'sp', s: '　', w: 1, auto: true });
      }
    }
    return out;
  }
  const half = (c) => (c === '！' ? '!' : c === '？' ? '?' : c);
  const full = (c) => (c === '!' ? '！' : c === '?' ? '？' : c);

  function firstChar(b) {
    if (!b) return '';
    return chars(b.s)[0] || '';
  }
  function lastChar(b) {
    const cs = chars(b.s);
    return cs[cs.length - 1] || '';
  }

  // ---------------- 行分け（禁則・ぶら下げ・追い出し） ----------------
  function makeRules(s) {
    const startSet = s.kinsoku === 'loose' ? START_NG_BASE : START_NG_STRICT;
    const startNG = (b) => {
      if (!b) return false;
      if (b.k === 'tcy') return !!b.bang;
      if (b.k === 'sp' || b.k === 'lat' || b.k === 'dash' || b.k === 'run') return false;
      return startSet.includes(firstChar(b));
    };
    const endNG = (b) => !!b && (b.k === 'c' || b.k === 'ruby') && END_NG.includes(lastChar(b));
    const hangable = (b) => !!b && b.k === 'c' && HANG.includes(b.s);
    return { startNG, endNG, hangable };
  }

  const EPS = 1e-6;
  /** 箱の列を、長さ L（字）の行に分ける。行: {b:[箱], gap, hang?, last?} */
  function breakLines(boxes, L, s) {
    const R = makeRules(s);
    const lines = [];
    const n = boxes.length;
    let i = 0;
    if (!n) return [{ b: [], gap: 0, last: true }];
    while (i < n) {
      // 行頭に来た自動の全角スペース（！？のあと）は消す
      while (i < n && i > 0 && boxes[i].k === 'sp' && boxes[i].auto) i++;
      if (i >= n) break;
      let w = 0;
      let j = i;
      while (j < n && w + boxes[j].w <= L + EPS) {
        w += boxes[j].w;
        j++;
      }
      if (j === n) {
        lines.push({ b: boxes.slice(i, j), last: true });
        break;
      }
      if (j === i) {
        // 1つの箱が行より長い（長い英単語など）
        lines.push({ b: [boxes[i]], over: true });
        i++;
        continue;
      }
      // ぶら下げ
      if (s.hang && R.hangable(boxes[j]) && !R.startNG(boxes[j + 1])) {
        lines.push({ b: boxes.slice(i, j), hang: boxes[j] });
        i = j + 1;
        if (i >= n) lines[lines.length - 1].last = true;
        continue;
      }
      // 追い出し：次の行の頭が行頭禁則／この行の終わりが行末禁則なら、前の箱ごと送る
      let k = j;
      while (k > i + 1 && (R.startNG(boxes[k]) || R.endNG(boxes[k - 1]))) k--;
      if (R.startNG(boxes[k]) || R.endNG(boxes[k - 1])) k = j; // どうしても直せないとき
      lines.push({ b: boxes.slice(i, k) });
      i = k;
    }
    for (const ln of lines) justify(ln, L);
    return lines;
  }

  /** 行の箱に位置 y（字）を入れる。最後の行以外は均等に字間を広げて行長にそろえる */
  function justify(ln, L) {
    const total = ln.b.reduce((a, b) => a + b.w, 0);
    let gap = 0;
    if (!ln.last && !ln.over && ln.b.length > 1 && L - total > EPS) gap = (L - total) / (ln.b.length - 1);
    ln.gap = gap;
    let y = 0;
    for (const b of ln.b) {
      b.y = y;
      y += b.w + gap;
    }
    ln.len = total + gap * Math.max(0, ln.b.length - 1);
    if (ln.hang) ln.hang.y = L;
  }

  /** 段落 → 行。字下げ（auto）・地付き・ブロック字下げ */
  function paraLines(block, L, s, measure) {
    let boxes = boxesOf(block.items, s, measure);
    if (s.indent === 'auto' && !block.indent && !block.align) {
      const f = boxes[0];
      const already = f && f.k === 'sp';
      const dialog = f && OPEN.includes(firstChar(f));
      if (!already && !(dialog && s.dialogNoIndent)) boxes.unshift({ k: 'sp', s: '　', w: 1 });
    }
    const ind = Math.min(block.indent || 0, L - 4);
    const lines = breakLines(boxes, L - ind, s);
    for (const ln of lines) {
      if (ind) shift(ln, ind);
      if (block.align && lines.length === 1) {
        const up = Number(block.align.split(':')[1]) || 0;
        shift(ln, Math.max(0, L - up - ln.len) - (ind || 0));
      }
    }
    return lines;
  }
  function shift(ln, d) {
    for (const b of ln.b) b.y += d;
    if (ln.hang) ln.hang.y += d;
  }

  // ---------------- ページ分け ----------------
  /**
   * 組版の本体。text と設定から、ページの列を返す。
   * measure(word) は英単語の幅（字）。ブラウザでは実際のフォントで測る
   */
  function layout(text, sIn, measure) {
    const s = settings(sIn);
    measure = measure || ((w) => w.length * 0.55);
    const blocks = parse(text, s);
    const L = s.chars;
    const per = s.lines;
    const headIndent = 3;
    const headSlots = 3;

    // 目次のページ数を先に出す（本文の開始ページを決めるため）
    const heads = blocks.filter((b) => b.type === 'h');
    const tocOn = s.toc && heads.length > 0;
    const tocPages = tocOn ? tocPageCount(heads, per) : 0;
    let front = (s.titlePage ? 2 : 0) + tocPages;
    let frontBlank = 0;
    if ((s.titlePage || tocOn) && s.bodyStartOdd && front % 2 === 1) frontBlank = 1;
    front += frontBlank;

    const body = [];
    let page = null;
    let col = 0;
    let slot = 0;
    let chapter = null;
    const tocEntries = [];
    const pageNo = () => front + body.length; // 今のページの通し番号（1から）

    function newPage() {
      page = { kind: 'body', cols: [[]], chapter, chapterStart: false };
      for (let c = 1; c < s.cols; c++) page.cols.push([]);
      body.push(page);
      col = 0;
      slot = 0;
    }
    function pageEmpty() {
      return !page || page.cols.every((c) => c.length === 0);
    }
    function nextCol() {
      col++;
      slot = 0;
      if (col >= s.cols) newPage();
    }
    function breakPage(odd) {
      if (!pageEmpty()) newPage();
      if (!page) newPage();
      if (odd && pageNo() % 2 === 0) {
        page.kind = 'blank';
        page.cols = page.cols.map(() => []);
        newPage();
      }
    }
    function place(row) {
      if (!page) newPage();
      if (slot + row.span > per) nextCol();
      row.slot = slot;
      page.cols[col].push(row);
      slot += row.span;
    }

    newPage();
    let first = true;
    for (const b of blocks) {
      if (b.type === 'break') {
        if (b.kind === 'col' && s.cols === 2) nextCol();
        else breakPage(b.kind === 'odd');
        first = false;
        continue;
      }
      if (b.type === 'h') {
        if (!first && b.level === 1 && s.chapterBreak !== 'none') breakPage(s.chapterBreak === 'odd');
        const hl = headLines(b, L - headIndent, s, measure);
        const span = Math.max(headSlots, hl.length + 1);
        if (slot + span + 2 > per && !(slot === 0)) nextCol();
        if (b.level === 1) {
          chapter = plain(b.items);
          page.chapter = chapter;
          if (slot === 0 && col === 0) page.chapterStart = true;
        }
        place({ kind: 'head', level: b.level, lines: hl, span, scale: b.level === 1 ? s.headScale : 1.1, indent: headIndent });
        tocEntries.push({ level: b.level, items: b.items, text: plain(b.items), page: pageNo() });
        first = false;
        continue;
      }
      if (b.type === 'blank') {
        place({ kind: 'blank', span: 1 });
        first = false;
        continue;
      }
      const lines = paraLines(b, L, s, measure);
      for (const ln of lines) place({ kind: 'text', line: ln, span: 1 });
      first = false;
    }
    // 最後の空ページを取り除く
    while (body.length > 1 && body[body.length - 1].cols.every((c) => c.length === 0)) body.pop();

    // ページを組み立てる
    const pages = [];
    if (s.titlePage) {
      pages.push({ kind: 'title' });
      pages.push({ kind: 'blank' });
    }
    if (tocOn) {
      const Ltoc = s.cols === 2 ? s.chars * 2 + s.colGap : s.chars;
      const tp = tocPagesOf(tocEntries, per, Ltoc, s, measure);
      pages.push(...tp);
    }
    for (let i = 0; i < frontBlank; i++) pages.push({ kind: 'blank' });
    pages.push(...body);
    const tail = s.colophon ? 1 : 0;
    let padN = 0;
    if (s.pad) {
      const total = pages.length + tail;
      padN = (s.pad - (total % s.pad)) % s.pad;
    }
    for (let i = 0; i < padN; i++) pages.push({ kind: 'blank', pad: true });
    if (s.colophon) pages.push({ kind: 'colophon' });

    pages.forEach((p, i) => {
      p.index = i + 1;
      p.no = i + (s.nombreStart || 1);
      p.side = (i + 1) % 2 === 1 ? 'L' : 'R';
      p.nombre = p.kind === 'body' || p.kind === 'toc' ? 'show' : s.hiddenNombre ? 'hidden' : 'none';
      if (s.nombre === 'none' && p.nombre === 'show') p.nombre = s.hiddenNombre ? 'hidden' : 'none';
    });
    // 目次のページ番号は、ノンブルの開始番号に合わせる
    const off = (s.nombreStart || 1) - 1;
    for (const p of pages) if (p.kind === 'toc') for (const c of p.cols[0]) if (c.entry) c.pageNo = c.entry.page + off;
    return { s, pages, toc: tocEntries, padN, bodyPages: body.length };
  }

  function plain(items) {
    return items.map((it) => (it.k === 'r' ? it.base : it.s)).join('');
  }

  function headLines(b, L, s, measure) {
    const scale = b.level === 1 ? s.headScale : 1.1;
    const boxes = boxesOf(b.items, s, measure);
    const Lh = Math.max(4, Math.floor(L / scale));
    const lines = breakLines(boxes, Lh, Object.assign({}, s, { hang: true }));
    for (const ln of lines) {
      // 見出しは字間を広げない
      ln.last = true;
      justify(ln, Lh);
    }
    return lines;
  }

  function tocPageCount(heads, per) {
    // 1行に1項目として数える（長い見出しが2行になる分は tocPagesOf で調整する）
    const first = per - 3;
    const n = heads.length;
    if (n <= first) return 1;
    return 1 + Math.ceil((n - first) / per);
  }

  function tocPagesOf(entries, per, L, s, measure) {
    const pages = [];
    let page = null;
    let slot = 0;
    const newPage = () => {
      page = { kind: 'toc', cols: [[]], full: true };
      pages.push(page);
      slot = 0;
    };
    newPage();
    page.cols[0].push({ kind: 'head', level: 1, lines: headLines({ level: 1, items: [{ k: 't', s: '目次' }] }, L - 3, s, measure), span: 3, scale: s.headScale, indent: 3, slot: 0 });
    slot = 3;
    for (const e of entries) {
      const ind = e.level === 1 ? 2 : 3;
      const boxes = boxesOf(e.items, s, measure);
      const avail = L - ind - 5;
      const lines = breakLines(boxes, avail, s).map((ln) => {
        ln.last = true;
        justify(ln, avail);
        shift(ln, ind);
        return ln;
      });
      if (slot + 1 > per) newPage();
      // 長い見出しは1行目だけ（目次では切り詰める）
      page.cols[0].push({ kind: 'toc', line: lines[0], cut: lines.length > 1, entry: e, slot, span: 1, L });
      slot += 1;
    }
    // 2段組でも目次は1段で組む
    return pages;
  }

  /** 青空文庫のテキストなら、書名・著者名と本文に分ける（前書きの記号の説明と、底本などの後書きを外す） */
  function aozora(text) {
    const t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const m = /^([^\n]+)\n([^\n]+)\n(?:[^\n]*\n)*?-{20,}\n【テキスト中に現れる記号について】[\s\S]*?\n-{20,}\n/.exec(t);
    if (!m) return null;
    let body = t.slice(m[0].length);
    const foot = body.search(/\n\s*\n底本：/);
    if (foot >= 0) body = body.slice(0, foot);
    return { title: m[1].trim(), author: m[2].trim(), body: body.replace(/^\n+/, '').replace(/\s+$/, '') + '\n' };
  }

  HK.kumi = { PT, SIZES, DEFAULTS, settings, geom, parse, inline, boxesOf, breakLines, layout, fixText, plain, aozora, START_NG_STRICT, END_NG };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- render.js ---- */
/* ひとり組版 — ページを HTML に描く（mm 単位の絶対配置） */
(function (g) {
  'use strict';
  const HK = (g.HK = g.HK || {});
  const K = HK.kumi;

  const FONTS = {
    bizmin: { name: 'BIZ UD明朝', css: '"BIZ UDMincho", "BIZ UD明朝 Medium", "BIZ UD明朝", serif', web: 'BIZ+UDMincho' },
    shippori: { name: 'しっぽり明朝', css: '"Shippori Mincho", serif', web: 'Shippori+Mincho' },
    notoserif: { name: 'Noto Serif JP（源ノ明朝）', css: '"Noto Serif JP", serif', web: 'Noto+Serif+JP:wght@400' },
    zenold: { name: 'Zen Old Mincho', css: '"Zen Old Mincho", serif', web: 'Zen+Old+Mincho' },
    yumin: { name: '游明朝（パソコンの文字）', css: '"Yu Mincho", "YuMincho", "游明朝", serif' },
    hiramin: { name: 'ヒラギノ明朝（Mac の文字）', css: '"Hiragino Mincho ProN", "Hiragino Mincho Pro", serif' },
    bizgo: { name: 'BIZ UDゴシック', css: '"BIZ UDGothic", "BIZ UDゴシック", sans-serif', web: 'BIZ+UDGothic' }
  };
  const fontCss = (key) => (FONTS[key] || FONTS.bizmin).css;

  const mm = (n) => Math.round(n * 1000) / 1000 + 'mm';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const chars = (s) => Array.from(s || '');

  // 傍点（ゴマ点）。CSS の text-emphasis は点の場所を字の枠の中に取って字を左へ押し出すので使わず、
  // ルビと同じく行の右（半分の幅）に点を描く。フォントの「﹅」は字形の位置がフォントごとに違う（上に寄る）ので、
  // ゴマの形を SVG で描いて、字の真横の中央に置く。句読点・かっこには付けない
  const NO_DOT = '、。，．「」『』（）〔〕［］｛｝〈〉《》【】〝〟‘’“”！？‼⁇⁈⁉・：；…‥―　 ';
  const SESAME = 'M6.5 2.2C5.3 3 3 4.6 3 6.3C3 7.4 3.9 8 4.7 8C5.7 8 6.4 7.2 6.4 6.1C6.4 4.9 6 3.6 6.5 2.2Z';
  const dotHtml = (x, y, fs) =>
    `<svg class="dt" viewBox="0 0 10 10" style="left:${mm(x + fs)};top:${mm(y + fs / 4)};width:${mm(fs / 2)};height:${mm(fs / 2)}"><path d="${SESAME}" fill="#000"/></svg>`;

  /** 1行の箱を描く。x は行の左端、top は行頭、fs は字の大きさ（mm） */
  function lineHtml(ln, x, top, fs) {
    let out = '';
    const gapMm = (ln.gap || 0) * fs;
    const list = ln.hang ? ln.b.concat([ln.hang]) : ln.b;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const y = top + b.y * fs;
      if (b.k === 'c' && !b.em && b !== ln.hang) {
        // 続く文字をまとめて1つの span に
        let s = b.s;
        let j = i + 1;
        while (j < ln.b.length && ln.b[j].k === 'c' && !ln.b[j].em) s += ln.b[j++].s;
        out += `<span class="k" style="left:${mm(x)};top:${mm(y)}${gapMm ? ';letter-spacing:' + mm(gapMm) : ''}">${esc(s)}</span>`;
        i = j - 1;
        continue;
      }
      switch (b.k) {
        case 'c':
          out += `<span class="k" style="left:${mm(x)};top:${mm(y)}">${esc(b.s)}</span>`;
          if (b.em && !NO_DOT.includes(b.s)) out += dotHtml(x, y, fs);
          break;
        case 'run':
          out += `<span class="k" style="left:${mm(x)};top:${mm(y)}">${esc(b.s)}</span>`;
          break;
        case 'tcy':
          out += `<span class="t" style="left:${mm(x)};top:${mm(y)}">${esc(b.s)}</span>`;
          if (b.em) out += dotHtml(x, y, fs);
          break;
        case 'lat':
          out += `<span class="l" style="left:${mm(x)};top:${mm(y)}">${esc(b.s)}</span>`;
          break;
        case 'dash': {
          const t = Math.max(0.1, fs * 0.055);
          out += `<span class="d" style="left:${mm(x + fs / 2 - t / 2)};top:${mm(y + fs * 0.06)};height:${mm(b.w * fs - fs * 0.12)};border-left-width:${mm(t)}"></span>`;
          break;
        }
        case 'ruby': {
          const base = chars(b.s);
          const n = base.length;
          const bg = b.w > n ? (b.w - n) / n : 0;
          out += `<span class="k" style="left:${mm(x)};top:${mm(y + (bg / 2) * fs)}${bg ? ';letter-spacing:' + mm(bg * fs) : ''}">${esc(b.s)}</span>`;
          const rt = chars(b.rt);
          const m = rt.length;
          const rg = b.w > m / 2 ? (b.w - m / 2) / m : 0; // ルビ1字あたりの空き（字）
          out += `<span class="r" style="left:${mm(x + fs)};top:${mm(y + (rg / 2) * fs)};font-size:${mm(fs / 2)}${rg ? ';letter-spacing:' + mm(rg * fs) : ''}">${esc(b.rt)}</span>`;
          break;
        }
        default:
          break; // 'sp'
      }
    }
    return out;
  }

  /** 1ページを描く。opt: {trial} */
  function pageHtml(p, G, opt) {
    const s = G.s;
    const fs = G.fs;
    const side = p.side;
    const bl = G.left[side];
    const bt = G.top;
    const right = bl + G.blockW;
    let body = '';

    const slotX = (slot) => right - fs - slot * G.pitch;

    if (p.cols) {
      p.cols.forEach((rows, c) => {
        const colTop = bt + (p.full ? 0 : c * (G.colH + G.gapH));
        for (const r of rows) {
          if (r.kind === 'text') body += lineHtml(r.line, slotX(r.slot), colTop, fs);
          else if (r.kind === 'head') {
            const hf = fs * r.scale;
            const n = r.lines.length;
            const center = right - fs / 2 - (r.slot + (r.span - 1) / 2) * G.pitch;
            const hp = hf * 1.6;
            r.lines.forEach((ln, i) => {
              const cx = center - (i - (n - 1) / 2) * hp;
              body += lineHtml(ln, cx - hf / 2, colTop + r.indent * fs, hf);
            });
          } else if (r.kind === 'toc') {
            const x = slotX(r.slot);
            body += lineHtml(r.line, x, colTop, fs);
            const num = String(r.pageNo || '');
            const L = r.L;
            const endY = r.line.len + (r.line.b[0] ? r.line.b[0].y : 0) + (r.cut ? 0 : 0);
            const numTop = colTop + (L - 1) * fs;
            if (num.length === 1) body += `<span class="k" style="left:${mm(x)};top:${mm(numTop)}">${esc(String.fromCharCode(num.charCodeAt(0) + 0xfee0))}</span>`;
            else body += `<span class="t" style="left:${mm(x)};top:${mm(numTop)}">${esc(num)}</span>`;
            const ly = colTop + (endY + 0.6) * fs;
            const lh = numTop - fs * 0.6 - ly;
            if (lh > 0) body += `<span class="ld" style="left:${mm(x + fs / 2 - 0.2)};top:${mm(ly)};height:${mm(lh)}"></span>`;
          }
        }
      });
    }

    if (p.kind === 'title') {
      const tf = fs * 2;
      body += `<div class="ttl" style="right:${mm(s.pageW - right + G.pitch)};top:${mm(bt + fs * 3)};font-size:${mm(tf)};max-height:${mm(G.blockH - fs * 6)}">${esc(s.title || '（書名）')}</div>`;
      if (s.author) body += `<div class="aut" style="right:${mm(s.pageW - right + G.pitch * 5)};bottom:${mm(G.margins.bottom + fs * 3)};font-size:${mm(fs * 1.2)}">${esc(s.author)}</div>`;
    }
    if (p.kind === 'colophon') body += colophonHtml(G);

    // 柱
    if (s.runningHead && p.kind === 'body' && !p.chapterStart) {
      const text = side === 'R' ? s.title : p.chapter || s.title;
      if (text) {
        const top = Math.max(2, bt - 4.5);
        body += side === 'L'
          ? `<div class="rh" style="left:${mm(bl)};top:${mm(top)}">${esc(text)}</div>`
          : `<div class="rh" style="right:${mm(s.pageW - right)};top:${mm(top)};text-align:right">${esc(text)}</div>`;
      }
    }
    // ノンブル
    if (p.nombre === 'show') body += nombreHtml(p, G, bl, right);
    else if (p.nombre === 'hidden') {
      const y = bt + G.blockH - 2;
      body += side === 'L'
        ? `<div class="nb hid" style="right:3mm;top:${mm(y)}">${p.no}</div>`
        : `<div class="nb hid" style="left:3mm;top:${mm(y)}">${p.no}</div>`;
    }
    if (opt && opt.trial) body += '<div class="wm">ひとり組版 体験版</div>';

    const b = G.bleed;
    return (
      `<div class="hk-page" data-no="${p.index}" style="width:${mm(G.pageW)};height:${mm(G.pageH)}">` +
      `<div class="hk-trim" style="left:${mm(b)};top:${mm(b)};width:${mm(s.pageW)};height:${mm(s.pageH)};font-size:${mm(fs)}">${body}</div></div>`
    );
  }

  function nombreHtml(p, G, bl, right) {
    const s = G.s;
    const size = s.nombreSize * K.PT;
    let top;
    if (s.nombre === 'top-outer') top = Math.max(2, G.top / 2 - size / 2);
    else top = G.top + G.blockH + G.margins.bottom / 2 - size / 2;
    const st = `top:${mm(top)};font-size:${mm(size)}`;
    if (s.nombre === 'bottom-center') return `<div class="nb" style="left:0;right:0;text-align:center;${st}">${p.no}</div>`;
    return p.side === 'L'
      ? `<div class="nb" style="left:${mm(bl)};${st}">${p.no}</div>`
      : `<div class="nb" style="right:${mm(s.pageW - right)};text-align:right;${st}">${p.no}</div>`;
  }

  function colophonHtml(G) {
    const s = G.s;
    const rows = [];
    const add = (k, v) => v && rows.push(`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`);
    add('発行日', s.coDate);
    add('著者', s.author);
    add('発行', s.coPublisher);
    add('連絡先', s.coContact);
    add('印刷', s.coPrinter);
    const w = Math.min(s.pageW - 20, Math.max(G.blockW, 60));
    const left = (s.pageW - w) / 2;
    return (
      `<div class="colo" style="left:${mm(left)};width:${mm(w)};bottom:${mm(Math.max(G.margins.bottom, 12))};font-size:${mm(G.fs * 0.85)}">` +
      `<div class="colo-t">${esc(s.title || '')}</div><table>${rows.join('')}</table>` +
      (s.coNote ? `<p>${esc(s.coNote)}</p>` : '') +
      '</div>'
    );
  }

  /** 印刷・プレビュー用の CSS（フォントとページの大きさ） */
  function pageCss(G, scope) {
    const s = G.s;
    const sc = scope || '';
    return (
      `${sc} .hk-page{position:relative;overflow:hidden;background:#fff;color:#000;font-family:${fontCss(s.font)};}` +
      `@page{size:${mm(G.pageW)} ${mm(G.pageH)};margin:0}`
    );
  }

  /** フォントの読み込み（Google Fonts）。ネットにつながっていないときは何もしない */
  function fontLink(key) {
    const f = FONTS[key];
    if (!f || !f.web) return '';
    return 'https://fonts.googleapis.com/css2?family=' + f.web + '&display=block';
  }

  HK.render = { FONTS, fontCss, fontLink, pageHtml, pageCss, lineHtml };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- app.js ---- */
/* ひとり組版 — 画面（Web版・Pro版・体験版で共通。違いは HK.edition） */
(function (g) {
  'use strict';
  const HK = (g.HK = g.HK || {});
  const K = HK.kumi;
  const R = HK.render;
  const doc = g.document;
  const FREE_LIMIT = 32;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ed = () => HK.edition || 'web';
  const isPro = () => ed() !== 'web';

  // ---------------- 保存（localStorage） ----------------
  const store = {
    key: (k) => 'hk1:' + (ed() === 'web' ? 'web' : 'pro') + ':' + k,
    get(k, def) {
      try {
        const v = g.localStorage.getItem(this.key(k));
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(k, v) {
      try {
        g.localStorage.setItem(this.key(k), JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
    del(k) {
      try {
        g.localStorage.removeItem(this.key(k));
      } catch (e) {
        /* noop */
      }
    }
  };

  // ---------------- 設定の項目 ----------------
  const SIZE_OPTS = Object.entries(K.SIZES).map(([k, v]) => [k, v.name + (k === 'custom' ? '' : `（${v.w}×${v.h}mm）`)]);
  const FONT_OPTS = Object.entries(R.FONTS).map(([k, v]) => [k, v.name]);
  const FIELDS = [
    ['sec', '本の情報', true],
    ['text', 'title', '書名'],
    ['text', 'author', '著者名'],
    ['sec', '判型と文字', true],
    ['select', 'size', '判型', SIZE_OPTS],
    ['num', 'pageW', '幅（mm）', { min: 50, max: 300, step: 1, show: (s) => s.size === 'custom' }],
    ['num', 'pageH', '高さ（mm）', { min: 70, max: 400, step: 1, show: (s) => s.size === 'custom' }],
    ['select', 'font', 'フォント', FONT_OPTS],
    ['num', 'fontSize', '文字の大きさ（pt）', { min: 6, max: 16, step: 0.5 }],
    ['num', 'chars', '1行の字数', { min: 10, max: 60, step: 1 }],
    ['num', 'lines', '1ページの行数', { min: 4, max: 40, step: 1 }],
    ['num', 'lineGap', '行間（字）', { min: 0.3, max: 1.5, step: 0.05 }],
    ['select', 'cols', '段組', [[1, '1段'], [2, '2段']]],
    ['num', 'colGap', '段と段のあいだ（字）', { min: 1, max: 5, step: 0.5, show: (s) => s.cols === 2 }],
    ['geom'],
    ['sec', '余白と塗り足し'],
    ['num', 'gutterDiff', 'のどを小口より広く（mm）', { min: 0, max: 20, step: 0.5 }],
    ['num', 'vShift', '版面を下へずらす（mm）', { min: -15, max: 15, step: 0.5 }],
    ['select', 'bleed', '塗り足し', [[0, 'なし（仕上がりの大きさ）'], [3, '3mm つける']]],
    ['sec', 'ページ'],
    ['select', 'nombre', 'ノンブル（ページ番号）', [['bottom-outer', '下の外側'], ['bottom-center', '下の中央'], ['top-outer', '上の外側'], ['none', '入れない']]],
    ['num', 'nombreSize', 'ノンブルの大きさ（pt）', { min: 5, max: 12, step: 0.5 }],
    ['check', 'hiddenNombre', '扉・白ページ・奥付に「隠しノンブル」を入れる'],
    ['num', 'nombreStart', 'ノンブルの開始番号', { min: 1, max: 999, step: 1, pro: true }],
    ['check', 'runningHead', '柱（上の余白に書名と章の見出し）'],
    ['check', 'titlePage', '扉（1ページ目に書名と著者名）'],
    ['check', 'toc', '目次（見出しから自動で作る）'],
    ['check', 'bodyStartOdd', '本文を左ページ（奇数）から始める'],
    ['select', 'chapterBreak', '章（# 見出し）の始まり', [['page', '改ページ'], ['odd', '左ページ（奇数）から'], ['none', '続けて組む']]],
    ['select', 'pad', '総ページ数', [[4, '4の倍数にそろえる（白ページを足す）'], [2, '2の倍数にそろえる'], [0, 'そろえない']]],
    ['sec', '奥付'],
    ['check', 'colophon', '最後のページに奥付を入れる'],
    ['text', 'coDate', '発行日', { ph: '2026年12月30日　初版発行' }],
    ['text', 'coPublisher', '発行（サークル名など）'],
    ['text', 'coContact', '連絡先', { ph: 'https://… または メールアドレス' }],
    ['text', 'coPrinter', '印刷所'],
    ['text', 'coNote', 'ひとこと'],
    ['sec', '自動で直す'],
    ['select', 'indent', '段落の字下げ', [['auto', '自動で1字下げる'], ['keep', '原稿のまま']]],
    ['check', 'dialogNoIndent', '「」で始まる行は下げない'],
    ['check', 'fixBang', '! ? を全角に（!? !! は縦中横）'],
    ['check', 'fixBangSpace', '！？のあとに全角スペースを入れる'],
    ['check', 'fixEllipsis', '三点リーダーを2つずつに（… → ……）'],
    ['check', 'fixDash', 'ダッシュを2つずつに（— → ――）'],
    ['select', 'tcyDigits', '半角の数字', [[2, '2けたまで縦中横'], [3, '3けたまで縦中横'], [0, '縦中横にしない（1字ずつ）']]],
    ['check', 'fixKana', '半角カタカナを全角に'],
    ['check', 'fixQuotes', '“ ” を 〝 〟 に'],
    ['select', 'latin', '英字', [['sideways', '横に寝かせる'], ['upright', '1字ずつ立てる']]],
    ['select', 'blankLines', '空行', [['keep', 'そのまま'], ['collapse', '続く空行は1つにまとめる'], ['remove', '1つだけの空行は消す（2つ以上は1つに）']]],
    ['select', 'kinsoku', '禁則', [['strict', '標準（小さい「っ」や「ー」も行頭に置かない）'], ['loose', 'ゆるめ（小さい「っ」と「ー」は行頭でもよい）']]],
    ['check', 'hang', '句読点のぶら下げ（、。を行末の外に出す）']
  ];
  const NUM_KEYS = new Set(['cols', 'bleed', 'pad', 'tcyDigits']);

  // ---------------- 状態 ----------------
  const st = {
    el: null,
    text: '',
    s: K.settings(),
    result: null,
    G: null,
    spread: 0,
    docId: null,
    timer: 0,
    measureCache: new Map()
  };

  function measure(word) {
    const key = st.s.font + '|' + word;
    if (st.measureCache.has(key)) return st.measureCache.get(key);
    if (!measure.ctx) measure.ctx = doc.createElement('canvas').getContext('2d');
    measure.ctx.font = '100px ' + R.fontCss(st.s.font);
    const w = measure.ctx.measureText(word).width / 100;
    st.measureCache.set(key, w);
    return w;
  }

  const fontLoaded = new Set();
  function loadFont(key) {
    const url = R.fontLink(key);
    if (url && !fontLoaded.has(key)) {
      fontLoaded.add(key);
      const l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = url;
      l.onload = () => {
        const fam = R.fontCss(key).split(',')[0].replace(/"/g, '');
        doc.fonts
          .load('16px "' + fam + '"', 'あAg')
          .then(() => {
            st.measureCache.clear();
            relayout(true);
          })
          .catch(() => {});
      };
      doc.head.appendChild(l);
    }
  }

  // ---------------- 原稿の保存・読み込み ----------------
  function loadDoc() {
    if (!isPro()) {
      const d = store.get('doc', null);
      if (d) return d;
      return { text: HK.SAMPLE, settings: { title: '豆帳場の冬', author: 'まめ帳場' } };
    }
    const list = store.get('docs', []);
    let id = store.get('cur', null);
    if (!list.length) {
      id = newId();
      list.push({ id, name: '見本', updated: Date.now() });
      store.set('docs', list);
      store.set('doc:' + id, { text: HK.SAMPLE, settings: { title: '豆帳場の冬', author: 'まめ帳場' } });
    }
    if (!list.some((d) => d.id === id)) id = list[0].id;
    st.docId = id;
    store.set('cur', id);
    return store.get('doc:' + id, { text: '', settings: {} });
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = { text: st.text, settings: st.s };
      let ok;
      if (!isPro()) ok = store.set('doc', data);
      else {
        ok = store.set('doc:' + st.docId, data);
        const list = store.get('docs', []);
        const d = list.find((x) => x.id === st.docId);
        if (d) {
          d.name = st.s.title || d.name || '無題';
          d.updated = Date.now();
          store.set('docs', list);
          renderDocList();
        }
      }
      const msg = st.el && st.el.querySelector('[data-saved]');
      if (msg) msg.textContent = ok ? 'このブラウザに保存しました' : '保存できませんでした（原稿が大きすぎるか、保存が許可されていません）';
    }, 600);
  }

  // ---------------- 画面 ----------------
  function mount(el) {
    st.el = el;
    const d = loadDoc();
    st.text = d.text || '';
    st.s = K.settings(Object.assign({}, d.settings || {}));
    if (!isPro()) st.s.nombreStart = 1;
    el.innerHTML = shellHtml();
    el.querySelector('.kh-text').value = st.text;
    renderForm();
    renderDocList();
    bind();
    loadFont(st.s.font);
    relayout(true);
    if (!doc.getElementById('hk-print')) {
      const p = doc.createElement('div');
      p.id = 'hk-print';
      doc.body.appendChild(p);
    }
    g.addEventListener('resize', () => renderPreview());
  }

  function shellHtml() {
    const pro = isPro();
    return `
<div class="kh">
  <div class="kh-bar">
    <div class="kh-tabs" role="tablist" aria-label="表示の切り替え">
      <button type="button" role="tab" data-tab="edit" aria-selected="true">原稿</button>
      <button type="button" role="tab" data-tab="set" aria-selected="false">設定</button>
      <button type="button" role="tab" data-tab="prev" aria-selected="false">プレビュー</button>
    </div>
    ${pro ? '<div class="kh-docs"><label class="sr-only" for="kh-doc">原稿</label><select class="in" id="kh-doc"></select><button type="button" class="btn btn-sm" data-act="new">新しい原稿</button><button type="button" class="btn btn-sm" data-act="dup">複製</button><button type="button" class="btn btn-sm btn-ghost" data-act="del">削除</button></div>' : ''}
    <div class="kh-stat" aria-live="polite"></div>
    <button type="button" class="btn btn-primary" data-act="pdf">PDFを作る</button>
  </div>
  <div class="kh-cols">
    <section class="kh-pane kh-set" data-pane="set" aria-label="設定"><form class="kh-form" autocomplete="off" onsubmit="return false"></form>
      ${pro ? '<div class="kh-backup"><h3>バックアップ</h3><p>原稿と設定をファイルに保存します。ブラウザのデータを消すと原稿も消えるので、ときどき保存してください。</p><button type="button" class="btn btn-sm" data-act="backup">バックアップを保存</button> <label class="btn btn-sm">バックアップから復元<input type="file" accept=".json,application/json" data-act="restore" hidden></label></div>' : ''}
    </section>
    <section class="kh-pane kh-edit is-on" data-pane="edit" aria-label="原稿">
      <div class="kh-tools">
        <label class="btn btn-sm">テキストファイルを開く<input type="file" accept=".txt,text/plain" data-act="open" hidden></label>
        <button type="button" class="btn btn-sm btn-ghost" data-act="sample">見本を入れる</button>
        <details class="kh-help"><summary class="btn btn-sm btn-ghost">書き方</summary><div class="kh-help-body">${helpHtml()}</div></details>
        <span class="kh-count"></span>
      </div>
      <textarea class="kh-text" spellcheck="false" aria-label="原稿" placeholder="ここに小説の原稿を貼りつけてください。1行が1段落です。"></textarea>
      <p class="kh-saved" data-saved></p>
    </section>
    <section class="kh-pane kh-prev" data-pane="prev" aria-label="プレビュー">
      <div class="kh-nav">
        <button type="button" class="btn btn-sm" data-act="next" aria-label="次の見開き">◀ 次へ</button>
        <span class="kh-pos"></span>
        <button type="button" class="btn btn-sm" data-act="prev" aria-label="前の見開き">前へ ▶</button>
        <input type="range" class="kh-slider" min="0" max="0" value="0" aria-label="見開きの位置" dir="rtl">
      </div>
      <div class="kh-spread"></div>
      <ul class="kh-warn"></ul>
    </section>
  </div>
  <div class="kh-modal" hidden role="dialog" aria-modal="true" aria-labelledby="kh-m-h"><div class="kh-modal-box"></div></div>
</div>`;
  }

  function helpHtml() {
    return `<table class="kh-help-t">
<tr><th>段落</th><td>1行が1段落。空行はそのまま1行あきます</td></tr>
<tr><th>ルビ</th><td><code>｜漢字《かんじ》</code> <code>漢字《かんじ》</code> <code>[[rb:漢字 &gt; かんじ]]</code></td></tr>
<tr><th>傍点</th><td><code>《《ここ》》</code> または <code>｜ここ《・・》</code></td></tr>
<tr><th>章の見出し</th><td><code># 第一章</code>（小見出しは <code>## </code>）、<code>[chapter:第一章]</code></td></tr>
<tr><th>改ページ</th><td><code>[newpage]</code> または <code>［＃改ページ］</code></td></tr>
<tr><th>縦中横</th><td>半角の2けたの数字と <code>!?</code> は自動。<code>［＃縦中横］123［＃縦中横終わり］</code></td></tr>
<tr><th>そのほか</th><td>青空文庫の <code>［＃２字下げ］</code> <code>［＃地付き］</code> <code>［＃「…」に傍点］</code> も読めます</td></tr>
</table>`;
  }

  // ---- 設定フォーム ----
  function renderForm() {
    const s = st.s;
    let html = '';
    let open = false;
    for (const f of FIELDS) {
      const [type, key, label, opt] = f;
      if (type === 'sec') {
        if (open) html += '</div></details>';
        html += `<details class="kh-sec"${label === true ? ' open' : ''}><summary>${esc(key)}</summary><div class="kh-sec-b">`;
        open = true;
        continue;
      }
      if (type === 'geom') {
        html += '<div class="kh-geom" data-geom></div>';
        continue;
      }
      const o = (Array.isArray(opt) ? null : opt) || {};
      const hidden = o.show && !o.show(s) ? ' hidden' : '';
      const lock = o.pro && !isPro();
      const id = 'kf-' + key;
      if (type === 'check') {
        html += `<label class="kh-f kh-chk" data-f="${key}"${hidden}><input type="checkbox" id="${id}" name="${key}"${s[key] ? ' checked' : ''}> <span>${esc(label)}</span></label>`;
      } else if (type === 'select') {
        html += `<div class="kh-f" data-f="${key}"${hidden}><label for="${id}">${esc(label)}</label><select class="in" id="${id}" name="${key}">${opt
          .map(([v, t]) => `<option value="${esc(v)}"${String(s[key]) === String(v) ? ' selected' : ''}>${esc(t)}</option>`)
          .join('')}</select></div>`;
      } else if (type === 'num') {
        html += `<div class="kh-f kh-num" data-f="${key}"${hidden}><label for="${id}">${esc(label)}${lock ? ' <small class="kh-pro">Pro版</small>' : ''}</label><input class="in" type="number" inputmode="decimal" id="${id}" name="${key}" value="${esc(s[key])}" min="${o.min}" max="${o.max}" step="${o.step}"${lock ? ' disabled' : ''}></div>`;
      } else if (type === 'text') {
        html += `<div class="kh-f" data-f="${key}"><label for="${id}">${esc(label)}</label><input class="in" type="text" id="${id}" name="${key}" value="${esc(s[key])}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}></div>`;
      }
    }
    if (open) html += '</div></details>';
    st.el.querySelector('.kh-form').innerHTML = html;
    renderGeom();
  }

  function syncFormVisibility() {
    for (const f of FIELDS) {
      const o = !Array.isArray(f[3]) && f[3];
      if (!o || !o.show) continue;
      const box = st.el.querySelector(`[data-f="${f[1]}"]`);
      if (box) box.hidden = !o.show(st.s);
    }
  }

  function setField(key, value) {
    const el = st.el.querySelector(`[name="${key}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
  }

  function onFormChange(e) {
    const el = e.target;
    const key = el.name;
    if (!key) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') {
      v = Number(el.value);
      if (!isFinite(v) || el.value === '') return;
    } else if (NUM_KEYS.has(key)) v = Number(el.value);
    else v = el.value;
    const next = Object.assign({}, st.s, { [key]: v });
    if (key === 'size') {
      const p = K.SIZES[v];
      if (p && v !== 'custom') {
        Object.assign(next, { pageW: p.w, pageH: p.h, fontSize: p.fontSize, chars: p.chars, lines: p.lines, cols: p.cols, lineGap: p.lineGap || 0.75 });
        for (const k of ['pageW', 'pageH', 'fontSize', 'chars', 'lines', 'cols', 'lineGap']) setField(k, next[k]);
      }
    }
    if (['pageW', 'pageH', 'fontSize', 'chars', 'lines', 'cols', 'lineGap'].includes(key) && st.s.size !== 'custom' && key !== 'size') {
      // 判型の初期値から変えたら、判型は大きさだけ残す（自由に決めたことにはしない）
    }
    if (!isPro()) next.nombreStart = 1;
    st.s = K.settings(next);
    if (key === 'font') {
      st.measureCache.clear();
      loadFont(st.s.font);
    }
    syncFormVisibility();
    save();
    relayout(el.type !== 'text');
  }

  function renderGeom() {
    const box = st.el.querySelector('[data-geom]');
    if (!box) return;
    const G = K.geom(st.s);
    const m = G.margins;
    const f = (n) => (Math.round(n * 10) / 10).toFixed(1);
    box.innerHTML =
      `<div class="kh-geom-t">版面 ${f(G.blockW)}×${f(G.blockH)}mm ／ 1ページ ${st.s.chars * st.s.cols}字×${st.s.lines}行（約${(st.s.chars * st.s.cols * st.s.lines).toLocaleString()}字）</div>` +
      `<div class="kh-geom-m">天 ${f(m.top)}・地 ${f(m.bottom)}・のど ${f(m.nodo)}・小口 ${f(m.koguchi)} mm</div>` +
      (G.warnings.length ? `<div class="kh-geom-w">${G.warnings.map(esc).join('<br>')}</div>` : '');
  }

  // ---- 組み直し ----
  function relayout(now) {
    clearTimeout(st.timer);
    const run = () => {
      st.result = K.layout(st.text, st.s, measure);
      st.G = K.geom(st.s);
      const max = Math.floor(st.result.pages.length / 2);
      if (st.spread > max) st.spread = max;
      renderGeom();
      renderStat();
      renderPreview();
    };
    if (now) run();
    else st.timer = setTimeout(run, st.text.length > 60000 ? 700 : 250);
  }

  function renderStat() {
    const r = st.result;
    const blank = r.pages.filter((p) => p.kind === 'blank').length;
    const el = st.el.querySelector('.kh-stat');
    el.innerHTML = `全<b>${r.pages.length}</b>ページ <small>（本文 ${r.bodyPages}${blank ? `・白ページ ${blank}` : ''}）</small>`;
    const cnt = st.el.querySelector('.kh-count');
    if (cnt) cnt.textContent = Array.from(st.text.replace(/\n/g, '')).length.toLocaleString() + '字';
  }

  // ---- プレビュー（見開き） ----
  function spreadPages(k) {
    const pages = st.result.pages;
    if (k === 0) return [pages[0] || null, null];
    return [pages[2 * k] || null, pages[2 * k - 1] || null]; // [左（奇数）, 右（偶数）]
  }

  function renderPreview() {
    if (!st.result || !st.el) return;
    const G = st.G;
    const box = st.el.querySelector('.kh-spread');
    const pane = st.el.querySelector('.kh-prev');
    const max = Math.floor(st.result.pages.length / 2);
    const [L, Rp] = spreadPages(st.spread);
    const pxPerMm = 96 / 25.4;
    const avail = Math.max(240, (box.clientWidth || pane.clientWidth || 600) - 8);
    const scale = Math.min(2.2, avail / (G.pageW * 2 * pxPerMm + 6));
    const w = G.pageW * pxPerMm * scale;
    const h = G.pageH * pxPerMm * scale;
    const one = (p) =>
      p
        ? `<div class="kh-pg" style="width:${w}px;height:${h}px"><div class="kh-pg-in" style="transform:scale(${scale})">${R.pageHtml(p, G, { trial: ed() === 'trial' })}</div><span class="kh-pg-no">${p.index}</span></div>`
        : `<div class="kh-pg kh-pg-none" style="width:${w}px;height:${h}px"><span>${st.spread === 0 ? '表紙の裏' : ''}</span></div>`;
    box.innerHTML = `<style>${R.pageCss(G, '.kh-spread')}</style><div class="kh-pair">${one(L)}${one(Rp)}</div>`;
    st.el.querySelector('.kh-pos').textContent = st.spread === 0 ? `1 ／ ${st.result.pages.length}ページ` : `${2 * st.spread}–${Math.min(2 * st.spread + 1, st.result.pages.length)} ／ ${st.result.pages.length}ページ`;
    const sl = st.el.querySelector('.kh-slider');
    sl.max = String(max);
    sl.value = String(st.spread);
    const warn = [...G.warnings];
    if (!isPro() && st.result.pages.length > FREE_LIMIT) warn.push(`無料版で作れるPDFは${FREE_LIMIT}ページまでです（いまは${st.result.pages.length}ページ）。プレビューはすべて見られます。`);
    st.el.querySelector('.kh-warn').innerHTML = warn.map((w) => `<li>${esc(w)}</li>`).join('');
  }

  // ---------------- PDF ----------------
  function modal(html) {
    const m = st.el.querySelector('.kh-modal');
    m.querySelector('.kh-modal-box').innerHTML = html;
    m.hidden = false;
    const btn = m.querySelector('button, a');
    if (btn) btn.focus();
    return m;
  }
  function closeModal() {
    st.el.querySelector('.kh-modal').hidden = true;
  }

  function pdfDialog() {
    const r = st.result;
    if (!isPro() && r.pages.length > FREE_LIMIT) {
      const url = (g.HK_CONFIG && g.HK_CONFIG.proUrl) || 'pro/';
      modal(
        `<h2 id="kh-m-h">無料版のPDFは${FREE_LIMIT}ページまでです</h2><p>いまの原稿は <b>${r.pages.length}ページ</b> です。ページ数の上限がない「ひとり組版 Pro」（買い切り・オフラインで動く）をご利用ください。プレビューはこのまま、すべてのページを確かめられます。</p>` +
          `<p class="kh-m-act"><a class="btn btn-accent" href="${esc(url)}" target="_blank" rel="noopener">Pro版を見る</a> <button type="button" class="btn" data-act="close">閉じる</button></p>`
      );
      return;
    }
    const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(g.navigator.userAgent);
    modal(
      `<h2 id="kh-m-h">PDFを作ります（${r.pages.length}ページ）</h2>
<ol class="kh-steps">
<li>このあと開く印刷の画面で、<b>送信先（プリンター）</b>を「<b>PDFに保存</b>」にします。</li>
<li>「詳細設定」を開き、<b>余白は「なし」</b>か「デフォルト」、<b>倍率は 100</b>、<b>ヘッダーとフッターはオフ</b>にします。</li>
<li>用紙サイズは自動で ${esc(st.s.pageW)}×${esc(st.s.pageH)}mm${st.s.bleed ? '（塗り足しを入れて ' + (st.s.pageW + 6) + '×' + (st.s.pageH + 6) + 'mm）' : ''} になります。「保存」を押します。</li>
</ol>
<p class="kh-note">ページ数が多いと、印刷の画面が開くまで少し時間がかかります。${safari ? '<br><b>Safari は用紙の大きさを守らないため、Chrome か Edge をお使いください。</b>' : ''}${ed() === 'trial' ? '<br>体験版のPDFには「体験版」の文字が入ります。' : ''}</p>
<p class="kh-m-act"><button type="button" class="btn btn-primary" data-act="print">印刷の画面を開く</button> <button type="button" class="btn" data-act="close">やめる</button></p>`
    );
  }

  async function printNow() {
    closeModal();
    const r = st.result;
    const G = st.G;
    const root = doc.getElementById('hk-print');
    const trial = ed() === 'trial';
    root.innerHTML = `<style>${R.pageCss(G, '#hk-print')}</style>` + r.pages.map((p) => R.pageHtml(p, G, { trial })).join('');
    void root.offsetHeight;
    try {
      await doc.fonts.ready;
    } catch (e) {
      /* noop */
    }
    await new Promise((res) => setTimeout(res, 150));
    g.print();
  }

  // ---------------- 原稿の操作 ----------------
  async function openFile(file) {
    const buf = await file.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      text = new TextDecoder('shift_jis').decode(buf);
    }
    text = text.replace(/^﻿/, '');
    const a = K.aozora(text);
    if (a) {
      // 青空文庫のテキスト：記号の説明と底本の情報を外し、書名・著者名を入れる
      st.s = K.settings(Object.assign({}, st.s, { title: a.title, author: a.author }));
      renderForm();
      text = a.body;
    }
    setText(text);
  }
  function setText(t) {
    st.text = t;
    st.el.querySelector('.kh-text').value = t;
    save();
    relayout(true);
  }

  function renderDocList() {
    const sel = st.el && st.el.querySelector('#kh-doc');
    if (!sel) return;
    const list = store.get('docs', []);
    sel.innerHTML = list
      .sort((a, b) => b.updated - a.updated)
      .map((d) => `<option value="${esc(d.id)}"${d.id === st.docId ? ' selected' : ''}>${esc(d.name || '無題')}</option>`)
      .join('');
  }
  function switchDoc(id) {
    store.set('cur', id);
    const d = loadDoc();
    st.text = d.text || '';
    st.s = K.settings(d.settings || {});
    st.el.querySelector('.kh-text').value = st.text;
    st.spread = 0;
    renderForm();
    renderDocList();
    loadFont(st.s.font);
    relayout(true);
  }
  function newDoc(copy) {
    const list = store.get('docs', []);
    const id = newId();
    const data = copy ? { text: st.text, settings: Object.assign({}, st.s, { title: (st.s.title || '無題') + ' のコピー' }) } : { text: '', settings: Object.assign({}, st.s, { title: '' }) };
    list.push({ id, name: data.settings.title || '無題', updated: Date.now() });
    store.set('docs', list);
    store.set('doc:' + id, data);
    switchDoc(id);
  }
  function delDoc() {
    const list = store.get('docs', []);
    const d = list.find((x) => x.id === st.docId);
    if (!d || !g.confirm(`「${d.name || '無題'}」を削除します。元に戻せません。よろしいですか？`)) return;
    store.del('doc:' + d.id);
    const rest = list.filter((x) => x.id !== d.id);
    store.set('docs', rest);
    if (!rest.length) store.del('cur');
    switchDoc(rest.length ? rest[0].id : null);
  }
  function backup() {
    const list = store.get('docs', []);
    const data = { app: 'hitori-kumihan', v: 1, saved: new Date().toISOString(), docs: list.map((d) => Object.assign({}, d, { data: store.get('doc:' + d.id, null) })) };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ひとり組版_バックアップ_' + new Date().toISOString().slice(0, 10) + '.json';
    doc.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }
  async function restore(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'hitori-kumihan' || !Array.isArray(data.docs)) throw new Error('形式が違います');
      if (!g.confirm(`バックアップの原稿 ${data.docs.length} 件を読み込みます。同じ原稿は上書きされます。よろしいですか？`)) return;
      const list = store.get('docs', []);
      for (const d of data.docs) {
        if (!d.id || !d.data) continue;
        store.set('doc:' + d.id, d.data);
        const i = list.findIndex((x) => x.id === d.id);
        const meta = { id: d.id, name: d.name, updated: d.updated || Date.now() };
        if (i >= 0) list[i] = meta;
        else list.push(meta);
      }
      store.set('docs', list);
      switchDoc(data.docs[0].id);
    } catch (e) {
      g.alert('バックアップを読み込めませんでした：' + e.message);
    }
  }

  // ---------------- イベント ----------------
  function bind() {
    const el = st.el;
    const ta = el.querySelector('.kh-text');
    ta.addEventListener('input', () => {
      st.text = ta.value;
      save();
      relayout(false);
    });
    const form = el.querySelector('.kh-form');
    form.addEventListener('change', onFormChange);
    form.addEventListener('input', (e) => {
      if (e.target.type === 'text') onFormChange(e);
    });
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act], [data-tab]');
      if (!t) return;
      if (t.dataset.tab) {
        el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b === t ? 'true' : 'false'));
        el.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('is-on', p.dataset.pane === t.dataset.tab));
        if (t.dataset.tab === 'prev') renderPreview();
        return;
      }
      const max = Math.floor(st.result.pages.length / 2);
      switch (t.dataset.act) {
        case 'next':
          st.spread = Math.min(max, st.spread + 1);
          renderPreview();
          break;
        case 'prev':
          st.spread = Math.max(0, st.spread - 1);
          renderPreview();
          break;
        case 'pdf':
          pdfDialog();
          break;
        case 'print':
          printNow();
          break;
        case 'close':
          closeModal();
          break;
        case 'sample':
          if (!st.text.trim() || g.confirm('いまの原稿を、見本の文章に置きかえます。よろしいですか？')) setText(HK.SAMPLE);
          break;
        case 'new':
          newDoc(false);
          break;
        case 'dup':
          newDoc(true);
          break;
        case 'del':
          delDoc();
          break;
        case 'backup':
          backup();
          break;
        default:
          break;
      }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.act === 'open' && t.files[0]) openFile(t.files[0]).finally(() => (t.value = ''));
      if (t.dataset.act === 'restore' && t.files[0]) restore(t.files[0]).finally(() => (t.value = ''));
      if (t.id === 'kh-doc') switchDoc(t.value);
    });
    el.querySelector('.kh-slider').addEventListener('input', (e) => {
      st.spread = Number(e.target.value);
      renderPreview();
    });
    el.querySelector('.kh-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('kh-modal')) closeModal();
    });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
    g.addEventListener('afterprint', () => {
      const root = doc.getElementById('hk-print');
      if (root) root.innerHTML = '';
    });
  }

  /** 自動テスト・撮影用：原稿と設定をまとめて入れる */
  function set(text, over) {
    if (text != null) {
      st.text = text;
      st.el.querySelector('.kh-text').value = text;
    }
    if (over) st.s = K.settings(Object.assign({}, st.s, over));
    st.spread = 0;
    renderForm();
    loadFont(st.s.font);
    relayout(true);
  }
  function go(spread) {
    st.spread = spread;
    renderPreview();
  }

  HK.app = { mount, set, go, state: st };

  // ---------------- 見本の原稿（まめ帳場のオリジナル） ----------------
  HK.SAMPLE = `# 第一話　小さな帳場

駅前の商店街のはずれに、小さな文房具屋がある。看板には｜豆帳場《まめちょうば》と書いてあるが、町の人はみんな「豆屋」と呼んでいた。
「いらっしゃい」
店の奥から声がした。……誰もいないように見えたのは、店主の背が低いせいだ。
「ノートを一冊ください。方眼のやつ」
「方眼ね。――それなら、こっちの棚」
十二月の夕方は、四時を過ぎるともう暗い。ガラス戸の向こうを、自転車が二台、続けて通りすぎていった。
「本を作るんです。冬のイベントで、はじめて」
「へえ!　小説?」
「はい。ZINEっていうのかな、薄い本です。でも、組み方がぜんぜんわからなくて」
店主は眼鏡を《《くい》》と押し上げた。
「縦書きはね、決まりごとが多いんだ。句読点は行の頭に来ちゃいけないし、かぎかっこの閉じも同じ。三点リーダーは二つ続けて……こう」
レジ横のメモに、店主はさらさらと書いてみせた。12月30日、と日付を入れて。
「締め切りは?」
「印刷所の入稿が、来週の金曜です」
「なら間に合う!?　まずは本文だ。字の大きさと、一行の字数と、一ページの行数。この三つを決めれば、あとは機械がやってくれる」

## 二

その夜、彼女は原稿を最初から読み直した。
一行に三十七字、一ページに十五行。数えてみると、物語はちょうど四十八ページに収まりそうだった。
窓の外では、雪が降りはじめていた。

# 第二話　入稿の日

金曜の朝、彼女はもう一度、豆屋の戸をたたいた。
「できました」
差し出したのは、刷り出したばかりの試し刷りだった。店主はそれを一枚ずつめくり、ノンブルと奥付を指でなぞった。
「うん。いい本になる」
`;
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- site.js ---- */
/* ひとり組版 — Web版サイトの起動処理（道具のマウント・Pro導線・背幅の計算） */
(function (g) {
  'use strict';
  const HK = (g.HK = g.HK || {});
  const CFG = g.HK_CONFIG || {};
  const doc = g.document;

  // ---- Pro 導線（BOOTHのURLが決まるまでは「まもなく販売開始」） ----
  function renderPro() {
    doc.querySelectorAll('[data-pro-link]').forEach((a) => {
      if (CFG.proUrl) {
        a.href = CFG.proUrl;
        a.target = '_blank';
        a.rel = 'noopener';
      }
    });
    doc.querySelectorAll('[data-pro-only]').forEach((el) => (el.hidden = !CFG.proUrl));
    doc.querySelectorAll('[data-pro-soon]').forEach((el) => (el.hidden = !!CFG.proUrl));
    doc.querySelectorAll('[data-trial-link]').forEach((a) => {
      if (CFG.trialUrl) a.href = CFG.trialUrl;
      else a.hidden = true;
    });
  }

  function nav() {
    const btn = doc.querySelector('.nav-toggle');
    const menu = doc.getElementById('site-nav');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('is-open', open);
    });
  }

  // ---- 背幅の計算 ----
  function mountSehaba(el) {
    const f = el.querySelector('form');
    const out = el.querySelector('[data-out]');
    const calc = () => {
      const pages = Number(f.pages.value) || 0;
      const t = Number(f.paper.value === 'other' ? f.thick.value : f.paper.value) || 0;
      f.thick.closest('.f').hidden = f.paper.value !== 'other';
      const cover = Number(f.cover.value) || 0;
      if (!pages || !t) {
        out.innerHTML = '';
        return;
      }
      const sheets = Math.ceil(pages / 2);
      const spine = sheets * t + cover * 2;
      out.innerHTML =
        `<p class="sh-res">背幅の目安 <b>${spine.toFixed(1)}mm</b></p>` +
        `<p class="hint">本文 ${pages}ページ ＝ 紙 ${sheets}枚 × ${t}mm${cover ? ` ＋ 表紙の厚み ${cover}mm × 2` : ''}。` +
        (pages % 4 ? `<br><b>ページ数が4の倍数ではありません</b>（多くの印刷所は4の倍数で受け付けます）。` : '') +
        '</p>';
    };
    f.addEventListener('input', calc);
    calc();
  }

  function sw() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    const base = doc.documentElement.dataset.base || './';
    g.addEventListener('load', () => navigator.serviceWorker.register(base + 'sw.js').catch(() => {}));
  }

  function boot() {
    nav();
    renderPro();
    doc.querySelectorAll('[data-app="kumihan"]').forEach((el) => HK.app.mount(el));
    doc.querySelectorAll('[data-app="sehaba"]').forEach(mountSehaba);
    sw();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
