/* 버킷리스트 앱: 카드 그리기, 업적 칭호, 전체 칭호(레벨), 달성/삭제 관리.
 *
 * 화면은 두 가지 모드로 뜹니다.
 *   공개(기본, https://aeswdq.github.io/Bucket/)
 *     data/published.json 에 커밋된 기록만 읽기 전용으로 보여 줍니다. 저장소에 쓰지 않습니다.
 *   편집(?edit=1)
 *     지금까지처럼 localStorage("bucket.state.v1") · IndexedDB("bucket.photos.v1") 에 저장하고,
 *     달성·포기·삭제·추가·메모·사진·내보내기가 모두 열립니다.
 *
 * 내용은 data/bucket.js, 이 파일은 동작만 담당합니다.
 */
var BUCKET = (function () {
  "use strict";

  var KEY = "bucket.state.v1";
  var DATA = window.BUCKET_DATA;
  var EDIT = mode();
  var state = blank();        // init() 에서 load() 로 채운다 (공개 기록을 먼저 읽어야 해서)
  var inited = false;
  var bound = false;
  var pubPhoto = {};          // id -> 공개된 사진 경로 (img/memories/...)

  /* ---------- 작은 도구들 ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function today() {
    var d = new Date();
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate());
  }

  /* 달성 날짜는 "2026.11.21" 모양으로 맞춘다 (예전 기록의 끝점은 뗀다). */
  function cleanDate(v) { return String(v == null ? "" : v).replace(/\.\s*$/, ""); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function inList(list, v) { return list.indexOf(v) !== -1; }

  function memoOf(id) { return state.memo[id] || ""; }

  function blank() { return { done: {}, fail: [], deleted: [], added: [], memo: {}, photoDel: [] }; }

  /* 공개 화면(기본)과 편집 모드(?edit=1)를 가른다.
   * index.html 의 <head> 에서도 같은 클래스를 붙이므로, 여기서는 한 번 더 맞추기만 한다. */
  function mode() {
    var edit = /(^|[?&])edit=1(&|$)/.test(location.search);
    var cls = String(document.documentElement.className || "")
      .replace(/\bmode_(edit|public)\b/g, "").replace(/\s+/g, " ").trim();
    document.documentElement.className = (cls ? cls + " " : "") + (edit ? "mode_edit" : "mode_public");
    return edit;
  }

  /* data/bucket.js 에 날짜가 적힌 항목 — 공개 기록을 못 읽었을 때의 바탕. */
  function baseDone(s) {
    DATA.categories.forEach(function (c) {
      c.sections.forEach(function (sec) {
        sec.items.forEach(function (it) { if (it.done) s.done[it.id] = cleanDate(it.done); });
      });
    });
    return s;
  }

  /* 공개된 기록(달성 날짜·메모·포기)을 state 에 얹는다. */
  function applyPublished(s) {
    var p = window.PUBLISHED ? PUBLISHED.data() : null;
    if (!p) return s;
    Object.keys(p.items || {}).forEach(function (id) {
      var it = p.items[id];
      if (it.done) s.done[id] = cleanDate(it.done);
      if (it.memo) s.memo[id] = it.memo;
    });
    s.fail = (p.fail || []).slice();
    return s;
  }

  /* 편집 모드: 이 브라우저에 저장된 기록. 처음이면 공개된 기록에서 이어서 시작한다. */
  function loadEdit() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { raw = null; }
    var s = blank();
    if (raw) {
      s.done = raw.done || {};
      Object.keys(s.done).forEach(function (id) { s.done[id] = cleanDate(s.done[id]); });
      s.fail = raw.fail || [];
      s.deleted = raw.deleted || [];
      s.added = raw.added || [];
      s.memo = raw.memo || {};
      s.photoDel = raw.photoDel || [];
    } else {
      baseDone(s);
      if (window.PUBLISHED && PUBLISHED.loaded()) {
        /* 공개된 기록에서 이어서 시작한다. 감춘 항목과 직접 추가한 항목도 그대로 들고 와야
         * 다음 공개용 내보내기에서 빠지지 않는다. */
        applyPublished(s);
        var p = PUBLISHED.data();
        s.deleted = (p.hidden || []).slice();
        s.added = (p.added || []).map(function (it) {
          return { id: it.id, cat: it.cat, t: it.t, d: it.d || "", a: it.a || "", b: it.b || "" };
        });
      }
    }
    return s;
  }

  /* 공개 화면: 저장소를 건드리지 않고 data/published.json 만 쓴다. */
  function loadPublic() {
    var s = blank();
    if (window.PUBLISHED && PUBLISHED.loaded()) applyPublished(s);
    else baseDone(s);   /* 공개 기록을 못 읽으면 리스트에 적힌 기본 달성만 */
    return s;
  }

  function load() { return EDIT ? loadEdit() : loadPublic(); }

  function save() {
    if (!EDIT) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function catById(id) {
    for (var i = 0; i < DATA.categories.length; i++) if (DATA.categories[i].id === id) return DATA.categories[i];
    return null;
  }

  function itemById(id) {
    var found = null;
    DATA.categories.forEach(function (c) {
      c.sections.forEach(function (sec) {
        sec.items.forEach(function (it) { if (it.id === id) found = it; });
      });
    });
    state.added.forEach(function (it) { if (it.id === id) found = it; });
    return found;
  }

  /* ---------- 그리기 ---------- */

  function hasPhoto(id) {
    return !!photoIds[id] || (!inList(state.photoDel, id) && !!pubPhoto[id]);
  }

  function cardHTML(it, catId) {
    var id = it.id;
    var memo = memoOf(id);
    var photo = hasPhoto(id);
    var tick = state.done[id] ? "check_box" : (inList(state.fail, id) ? "flag" : "check_box_outline_blank");

    /* 사진 자리: 편집 모드에는 넣기·바꾸기·지우기가 붙고, 공개 화면에는 공개된 사진만 조용히 보인다. */
    var shot = "";
    if (EDIT) {
      shot = '<div class="shot">' +
              '<div class="shot_empty">' +
                '<i class="material-icons">add_a_photo</i>' +
                '<span>사진 넣기</span>' +
                '<small>사진은 이 브라우저에 저장됩니다</small>' +
              '</div>' +
              '<img class="shot_img" alt="">' +
              '<button type="button" class="shot_del" title="사진 지우기"><i class="material-icons">delete</i></button>' +
              '<button type="button" class="shot_edit">바꾸기</button>' +
              '<div class="shot_busy">사진 넣는 중…</div>' +
            '</div>' +
            '<input class="file_in" type="file" accept="image/*">';
    } else if (photo) {
      shot = '<div class="shot ro has" data-for="pub:' + esc(id) + '">' +
              '<img class="shot_img" src="' + esc(pubPhoto[id] || "") + '" alt="' + esc(it.t) + ' 사진">' +
            '</div>';
    }

    var memoHTML = "";
    if (EDIT) {
      memoHTML = '<label class="memo_wrap">' +
          '<span class="memo_label"><i class="material-icons">notes</i>메모<span class="memo_state">저장됨</span></span>' +
          '<textarea class="memo" rows="3" placeholder="이 항목에 대한 기록 · 느낀 점 · 다음에 할 일">' + esc(memo) + '</textarea>' +
        '</label>';
    } else if (memo.replace(/\s/g, "")) {
      memoHTML = '<div class="memo_ro">' +
          '<span class="memo_label"><i class="material-icons">notes</i>메모</span>' +
          '<p class="memo_text">' + esc(memo) + '</p>' +
        '</div>';
    }

    var acts = EDIT
      ? '<div class="acts">' +
          '<button class="act" data-act="done"><i class="material-icons">check_box</i><span>달성</span></button>' +
          '<button class="act" data-act="fail"><i class="material-icons">flag</i><span>포기</span></button>' +
          '<button class="act" data-act="del"><i class="material-icons">delete_outline</i><span>삭제</span></button>' +
        '</div>'
      : '';

    return '' +
      '<div class="card bitem" data-id="' + esc(id) + '" data-cat="' + esc(catId) + '">' +
        '<dl class="front" id="c_' + esc(id) + '">' +
          '<div class="ach" title="' + (EDIT ? "업적 칭호: 달성하면 새겨집니다" : "업적 칭호") + '">' +
            '<i class="material-icons">military_tech</i>' +
            '<span class="ach_tag">업적</span>' +
            '<span class="ach_name">' + esc(it.a || "이름 없는 업적") + '</span>' +
          '</div>' +
          '<dt>' +
            '<i class="tick material-icons" title="' + (EDIT ? "달성 표시" : "달성한 항목") + '">' + tick + '</i>' +
            '<span class="tt">' + esc(it.t) + '</span>' +
            '<span class="marks" aria-hidden="true">' +
              '<i class="material-icons m_photo" title="사진이 있습니다">image</i>' +
              '<i class="material-icons m_memo" title="메모가 있습니다">notes</i>' +
            '</span>' +
          '</dt>' +
          '<dd>' + esc(it.d) + '<span class="date"></span></dd>' +
        '</dl>' +
        '<div class="back">' +
          '<div class="bin">' +
            '<div class="b_head">' +
              '<p class="back_title">' + esc(it.t) + '</p>' +
              '<span class="b_flip" title="앞면으로 돌리기"><i class="material-icons">close</i></span>' +
            '</div>' +
            '<p class="ach_back"><i class="material-icons">military_tech</i>업적 · ' + esc(it.a || "-") + '</p>' +
            '<p class="b_done"><i class="material-icons">check_circle</i>달성<span class="b_done_date"></span></p>' +
            (it.b ? '<p class="b_desc">' + esc(it.b) + '</p>' : '') +
            shot +
            memoHTML +
            acts +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function render() {
    var h = "";
    DATA.categories.forEach(function (cat) {
      h += '<h2 id="' + esc(cat.id) + '">' +
             '<span class="h2t">' + esc(cat.name) + '</span>' +
             '<span class="cat_title" data-cat="' + esc(cat.id) + '">' +
               '<i class="material-icons">military_tech</i>' + esc(cat.title) +
             '</span>' +
           '</h2>';
      h += '<section class="sup" data-cat="' + esc(cat.id) + '">';
      cat.sections.forEach(function (sec) {
        h += '<h3 id="' + esc(sec.id) + '"><i class="material-icons">' + esc(sec.icon) + '</i><span>' + esc(sec.name) + '</span></h3>';
        h += '<section class="sub">';
        sec.items.forEach(function (it) {
          if (inList(state.deleted, it.id) || hiddenInPublic(it.id)) return;
          h += cardHTML(it, cat.id);
        });
        h += '</section>';
      });
      var added = addedOf(cat.id);
      if (added.length) {
        h += '<h3 id="added_' + esc(cat.id) + '"><i class="material-icons">add_circle_outline</i><span>' + (EDIT ? "내가 추가한 항목" : "직접 추가한 항목") + '</span></h3>';
        h += '<section class="sub">';
        added.forEach(function (it) { h += cardHTML(it, cat.id); });
        h += '</section>';
      }
      h += '</section>';
    });
    $("#contents").html(h);
    applyAll();
  }

  /* 이 카테고리에 보일 '내가 추가한 항목' — 편집 모드는 이 브라우저의 것, 공개 화면은 공개된 것. */
  function addedOf(catId) {
    var list = EDIT ? state.added : (window.PUBLISHED ? (PUBLISHED.data().added || []) : []);
    return list.filter(function (a) {
      return a.cat === catId && !inList(state.deleted, a.id) && !hiddenInPublic(a.id);
    });
  }

  /* 공개 화면에서 감춘 항목 (편집 모드에서 삭제한 것). */
  function hiddenInPublic(id) {
    if (EDIT) return false;
    var p = window.PUBLISHED ? PUBLISHED.data() : null;
    return !!(p && inList(p.hidden || [], id));
  }

  function applyCard($card) {
    var id = $card.attr("data-id");
    var done = !!state.done[id];
    var fail = inList(state.fail, id);
    $card.toggleClass("is_done", done).toggleClass("is_fail", fail);
    var $dt = $card.find("dt");
    if (done) $dt.attr("checked", "checked"); else $dt.removeAttr("checked");
    if (fail) $dt.attr("failed", "failed"); else $dt.removeAttr("failed");
    $card.find("dt .tick").text(done ? "check_box" : (fail ? "flag" : "check_box_outline_blank"));
    $card.find("dd .date").text(done ? (state.done[id] || "") : "");
    $card.find(".b_done_date").text(done ? " · " + (state.done[id] || "") : "");
    $card.find(".ach").toggleClass("on", done);
    $card.find(".act[data-act=done] span").text(done ? "달성 해제" : "달성");
    applyMarks($card);
  }

  function applyAll() { $(".bitem").each(function () { applyCard($(this)); }); }

  /* ---------- 숫자 ---------- */

  function stats() {
    var $cards = $(".bitem");
    var total = $cards.length;
    var done = $cards.filter(".is_done").length;
    var fail = $cards.filter(".is_fail").length;
    return {
      total: total,
      done: done,
      fail: fail,
      pct: total ? Math.round(done / total * 100) : 0,
      left: total - done - fail
    };
  }

  function refresh() {
    var s = stats();
    header(s);
    headings();
    dashboard(s);
    catTitles();
    rank(s);
    navPct();
  }

  function header(s) {
    $("h1 .percentage").remove();
    $("h1").append("<span class='percentage'>" + s.pct + "% (" + s.done + "/" + s.total + ")</span>");
  }

  function headings() {
    $("h2:not(nav h2) .percentage, h3:not(nav h3) .percentage").remove();
    $("h2:not(nav h2)").each(function () {
      var $sec = $(this).next("section.sup");
      if (!$sec.length) return;
      var all = $sec.find("dt").length;
      var ok = $sec.find("dt[checked]").length;
      $(this).append("<span class='percentage'>" + (all ? Math.round(ok / all * 100) : 0) + "%</span>");
    });
    $("h3:not(nav h3)").each(function () {
      var $sec = $(this).next("section.sub");
      if (!$sec.length) return;
      var all = $sec.find("dt").length;
      var ok = $sec.find("dt[checked]").length;
      $(this).append("<span class='percentage'>" + (all ? Math.round(ok / all * 100) : 0) + "%</span>");
    });
  }

  function navPct() {
    $("nav a[href^='#']").each(function () {
      var id = decodeURIComponent(String($(this).attr("href")).slice(1));
      var el = document.getElementById(id);
      if (!el) return;
      var $sec = $(el).next("section.sup, section.sub");
      var all = $sec.find("dt").length;
      var ok = $sec.find("dt[checked]").length;
      var pct = all ? Math.round(ok / all * 100) : 0;
      var $p = $(this).find(".percentage");
      if ($p.length) $p.text(pct + "%");
    });
  }

  function dashboard(s) {
    if (!$("#acheieved_count").length) return;
    $("#acheieved_count").text(s.done);
    $("#acheieved_count_subtitle").html(s.pct + "%<br/>현재까지의 달성율<span class='not_important'>을 나타냅니다.</span>");
    $("#unacheieved_count").text(s.total - s.done);
    $("#list_count").text(s.total + s.fail);
    $("#failed_count").text(s.fail);
    $("#failed_count_subtitle").html(
      (s.total + s.fail ? Math.round(s.fail / (s.total + s.fail) * 100) : 0) +
      "%<br/>영원히 달성 불가능한 과제입니다."
    );
  }

  function catTitles() {
    $(".cat_title").each(function () {
      var id = $(this).attr("data-cat");
      var cat = catById(id);
      if (!cat) return;
      var ok = $(".bitem[data-cat='" + id + "']").filter(".is_done").length;
      var unlocked = ok >= cat.need;
      $(this).toggleClass("on", unlocked);
      $(this).attr("title", unlocked
        ? "칭호 획득: " + cat.title + " (" + ok + "/" + cat.need + ")"
        : cat.title + " — " + cat.need + "개 달성하면 얻습니다 (" + ok + "/" + cat.need + ")");
    });
  }

  /* ---------- 전체 칭호 ---------- */

  function rankOf(done) {
    var cur = DATA.ranks[0], next = null;
    DATA.ranks.forEach(function (r, i) {
      if (done >= r.need) cur = r;
      if (!next && done < r.need) next = r;
    });
    return { cur: cur, next: next };
  }

  function rank(s) {
    var r = rankOf(s.done);
    var width = 100, until = 0;
    if (r.next) {
      until = r.next.need - s.done;
      var span = r.next.need - r.cur.need;
      width = Math.max(0, Math.min(100, Math.round((s.done - r.cur.need) / (span || 1) * 100)));
    }
    var pips = DATA.ranks.map(function (x) {
      var cls = "pip";
      if (x.lv < r.cur.lv) cls += " done";
      if (x.lv === r.cur.lv) cls += " now";
      return '<span class="' + cls + '" data-lv="' + x.lv + '" title="Lv.' + x.lv + " " + esc(x.name) +
        (x.need ? " · " + x.need + "개" : "") + '">' + x.lv + '</span>';
    }).join("");

    var html = '' +
      '<div class="rk_card card front">' +
        '<div class="rk_head">' +
          '<div class="rk_lv"><span>LV</span><b>' + r.cur.lv + '</b></div>' +
          '<div class="rk_name">' +
            '<div class="rk_title">' + esc(r.cur.name) + '</div>' +
            '<div class="rk_note">' + esc(r.cur.note || "") + '</div>' +
          '</div>' +
          '<div class="rk_count"><b>' + s.done + '</b><span>/' + s.total + ' 달성</span></div>' +
        '</div>' +
        '<div class="rk_next">' +
          (r.next
            ? '다음 칭호 <b>' + esc(r.next.name) + '</b>까지 <b class="n">' + until + '</b>개'
            : '최고 칭호입니다. 이제 남은 건 하나씩 지우는 일뿐.') +
        '</div>' +
        '<div class="rk_bar"><i style="width:' + width + '%"></i></div>' +
        '<div class="rk_ladder">' + pips +
          '<span class="rk_ladder_label">칭호</span>' +
        '</div>' +
      '</div>';

    $("#rank").html(html);
    $("#rank_chip_text").html("Lv." + r.cur.lv + " <span class='rk_chip_name'>" + esc(r.cur.name) + "</span>");
    $("#rank_chip").attr("title", r.next ? "다음 칭호 " + r.next.name + "까지 " + until + "개" : "최고 칭호");
  }

  /* ---------- 필터 (설정의 필터 버튼과 같은 결과를, 핸들러 중복 없이) ---------- */

  function softFilter() {
    var f = localStorage.filter || "filter_11";
    $(".bitem").removeClass("hide");
    $(".bitem dt, .bitem dd").removeClass("hide");
    var strict = localStorage.strict_filtering == "true";
    if (f === "filter_11") return;
    if (f === "filter_10") {
      $(".bitem").not(".is_done").addClass("hide");
      if (strict) $(".bitem.is_done dt:not([checked]), .bitem.is_done dt:not([checked])+dd").addClass("hide");
    } else if (f === "filter_01") {
      $(".bitem.is_done, .bitem.is_fail").addClass("hide");
    } else if (f === "filter_00") {
      $(".bitem").not(".is_fail").addClass("hide");
    }
    if (typeof trim_contents_headline === "function") trim_contents_headline();
  }

  function afterChange() {
    save();
    refresh();
    softFilter();
    if (typeof columns === "function") columns();
    if (typeof trim_contents_headline === "function") trim_contents_headline();
  }

  /* ---------- 동작 ---------- */

  function toastUndo(msg, label, cb) {
    $("#toast").remove();
    $("body").append('<div id="toast" class="shadow"><i class="material-icons">delete_outline</i>' +
      msg + '<a class="undo">' + label + '</a></div>');
    var w = $("nav").width() || 0;
    $("#toast").css("left", "calc(1em + " + w + "px)").addClass("on");
    $("#toast .undo").on("click", function () { cb(); $("#toast").remove(); });
    setTimeout(function () {
      $("#toast").addClass("off").removeClass("on");
      setTimeout(function () { $("#toast").remove(); }, 600);
    }, 6000);
  }

  function toggleDone(id) {
    if (state.done[id]) {
      delete state.done[id];
      toast("달성을 해제했습니다.", "check_box_outline_blank");
    } else {
      state.done[id] = today();
      state.fail = state.fail.filter(function (x) { return x !== id; });
      var it = itemById(id);
      toast("달성! 업적 「" + (it ? it.a : "") + "」 획득", "military_tech");
    }
    var $c = $('.bitem[data-id="' + id + '"]');
    applyCard($c);
    afterChange();
  }

  function toggleFail(id) {
    if (inList(state.fail, id)) {
      state.fail = state.fail.filter(function (x) { return x !== id; });
      toast("포기를 취소했습니다.", "flag");
    } else {
      state.fail.push(id);
      delete state.done[id];
      toast("포기로 표시했습니다. 되돌릴 수 있습니다.", "flag");
    }
    applyCard($('.bitem[data-id="' + id + '"]'));
    afterChange();
  }

  function removeItem(id) {
    if (!inList(state.deleted, id)) state.deleted.push(id);
    delete state.done[id];
    state.fail = state.fail.filter(function (x) { return x !== id; });
    var $c = $('.bitem[data-id="' + id + '"]');
    var title = $c.find(".tt").text();
    $c.remove();
    afterChange();
    toastUndo("「" + title + "」 삭제", "되돌리기", function () { restoreItem(id); });
  }

  function restoreItem(id) {
    state.deleted = state.deleted.filter(function (x) { return x !== id; });
    save();
    render();
    afterChange();
    toast("되살렸습니다.", "restore");
  }

  function addItem(catId, t, d, a) {
    var id = "add_" + Date.now().toString(36);
    state.added.push({ id: id, cat: catId, t: t, d: d, a: a, b: "" });
    save();
    render();
    afterChange();
    toast("항목을 추가했습니다.", "add_circle_outline");
    return id;
  }

  /* 공개용 묶음(zip) 내보내기 — 편집 모드 전용. */
  function exportPublish() {
    if (typeof PUBLISH === "undefined") {
      toast("공개용 내보내기를 쓸 수 없습니다.", "priority_high");
      return;
    }
    var $b = $("#m_publish");
    var label = "공개용 내보내기 (JSON + 사진)";
    if ($b.hasClass("busy")) return;
    $b.addClass("busy").text("묶는 중…");
    PUBLISH.exportAll({
      state: state,
      data: DATA,
      photoIds: Object.keys(photoIds),
      photoDel: state.photoDel,
      published: window.PUBLISHED ? PUBLISHED : null,
      getPhoto: function (id) {
        if (!photoIds[id]) return Promise.resolve(null);
        return PHOTO.get(id).then(function (blob) { return blob || null; });
      }
    }).then(function (res) {
      $b.removeClass("busy").text(label);
      toast("공개용 묶음을 내려받았습니다 (사진 " + res.photos + "장). 성원에게 보내면 공개 페이지에 반영됩니다.", "publish");
    }).catch(function () {
      $b.removeClass("busy").text(label);
      toast("묶음을 만들지 못했습니다. 다시 한 번 눌러 주세요.", "priority_high");
    });
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "bucket-progress.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast("진행 상황을 파일로 내려받았습니다.", "download");
  }

  function resetProgress() {
    state.done = {};
    state.fail = [];
    save();
    applyAll();
    afterChange();
    toast("달성·포기 기록을 지웠습니다.", "restart_alt");
  }

  function resetDeleted() {
    state.deleted = [];
    save();
    render();
    afterChange();
    toast("삭제한 항목을 모두 되살렸습니다.", "restore");
  }

  /* ---------- 카드 뒤집기 · 사진 · 메모 ----------
   *
   * 카드를 누르면 뒤집혀서 뒷면이 보입니다. 뒷면에는 사진(IndexedDB)과 메모(localStorage)가
   * 있습니다. 카드 높이는 뒤집힌 동안에만 뒷면 높이에 맞춰 키우고, 그만큼 그리드를 다시
   * 배치해 아래 카드를 밀어냅니다. (앞면·뒷면은 같은 자리에서 3D 로 돌아갑니다.)
   */

  var photoIds = {};      // 사진이 있는 카드 id
  var photoURLs = {};     // id -> objectURL (한 번 만든 것은 다시 쓴다)
  var memoTimer = null;

  function applyMarks($card) {
    var id = $card.attr("data-id");
    if (!id) return;
    $card.toggleClass("has_photo", hasPhoto(id));
    $card.toggleClass("has_memo", !!(state.memo[id] && state.memo[id].replace(/\s/g, "")));
  }

  function saveMemoSoon() {
    clearTimeout(memoTimer);
    memoTimer = setTimeout(function () {
      memoTimer = null;
      save();
      notifySaved();
    }, 350);
  }

  function flushMemo() {
    if (memoTimer) { clearTimeout(memoTimer); memoTimer = null; }
    save();
    notifySaved();
  }

  function notifySaved() {
    $(".memo_state.on").each(function () {
      var $s = $(this);
      $s.text("저장됨");
      clearTimeout($s.data("t"));
      $s.data("t", setTimeout(function () { $s.removeClass("on"); }, 1300));
    });
  }

  function fitCard($card) {
    if (!$card.hasClass("flipped")) {
      if ($card.attr("style") && $card.css("height") !== "auto") $card.css("height", "");
      return;
    }
    var $front = $card.children(".front");
    var $back = $card.children(".back");
    var h = Math.max(
      $front.length ? $front[0].offsetHeight : 0,
      $back.length ? $back[0].offsetHeight : 0
    );
    if (h > 0 && Math.abs(($card[0].offsetHeight || 0) - h) > 1) $card.css("height", h + "px");
  }

  function relayout($card) {
    var $sec = $card.closest("section.sub");
    if ($sec.length && $sec.data("masonry")) {
      try { $sec.masonry("layout"); } catch (e) {}
    }
    if (typeof trim_contents_headline === "function") trim_contents_headline();
  }

  function refit($card) { fitCard($card); relayout($card); }

  function openCard($card) {
    if ($card.hasClass("flipped")) return;
    $card.addClass("flipped");
    refit($card);
    fillPhoto($card).then(function () {
      refit($card);
      revealCard($card);
    });
  }

  /* 펼친 카드가 화면 밖으로 넘치면 보이는 자리까지 부드럽게 내려 준다. */
  function revealCard($card) {
    var el = $card[0];
    if (!el || !el.getBoundingClientRect) return;
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var topPad = ($("header").outerHeight() || 0) + ($("#sub_header").outerHeight() || 0) + 14;
    if (rect.bottom <= vh - 16 && rect.top >= topPad) return;
    var y = window.pageYOffset + rect.top - topPad;
    try { window.scrollTo({ top: Math.max(0, y), behavior: "smooth" }); }
    catch (e) { window.scrollTo(0, Math.max(0, y)); }
  }

  function closeCard($card) {
    if (!$card.hasClass("flipped")) return;
    var active = document.activeElement;
    if (active && $card[0].contains(active) && active.blur) active.blur();
    $card.removeClass("flipped").css("height", "");
    relayout($card);
  }

  function toggleCard($card) {
    if ($card.hasClass("flipped")) closeCard($card); else openCard($card);
  }

  function setShot($card, url) {
    var $shot = $card.find(".shot");
    var img = $shot.find(".shot_img")[0];
    if (!img) return;
    img.onload = function () { if ($card.hasClass("flipped")) refit($card); };
    img.src = url;
    $shot.addClass("has");
  }

  function imageReady(img) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalHeight) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve();
      }
      img.addEventListener("load", finish, { once: true });
      img.addEventListener("error", finish, { once: true });
      setTimeout(finish, 4000);
    });
  }

  function fillPhoto($card) {
    var id = $card.attr("data-id");
    var $shot = $card.find(".shot");
    if (!id || !$shot.length) return Promise.resolve();
    var img = $shot.find(".shot_img")[0];

    /* 이 브라우저에 사진이 없으면 공개된 사진을 쓴다. */
    if (!photoIds[id]) {
      var path = inList(state.photoDel, id) ? "" : (pubPhoto[id] || "");
      if (!path) return Promise.resolve();
      var pubKey = "pub:" + id;
      if ($shot.attr("data-for") === pubKey) return imageReady(img);
      $shot.attr("data-for", pubKey);
      setShot($card, path);
      return imageReady(img);
    }

    if ($shot.attr("data-for") === "local:" + id) return imageReady(img);
    return PHOTO.get(id).then(function (blob) {
      if (!blob) { delete photoIds[id]; $card.removeClass("has_photo"); return; }
      var url = photoURLs[id];
      if (!url) { url = URL.createObjectURL(blob); photoURLs[id] = url; }
      $shot.attr("data-for", "local:" + id);
      setShot($card, url);
      return imageReady(img);
    }).catch(function () {});
  }

  function pickPhoto($card) {
    var $in = $card.find(".file_in");
    if (!$in.length) return;
    $in.val("");
    $in[0].click();
  }

  function onPhotoChosen($card, input) {
    var file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    var id = $card.attr("data-id");
    var $shot = $card.find(".shot");
    if (!id || !$shot.length) return;
    if (file.size > 30 * 1024 * 1024) {
      toast("사진이 너무 큽니다. 30MB 이하로 넣어 주세요.", "priority_high");
      return;
    }
    $shot.addClass("busy");
    PHOTO.compress(file).then(function (out) {
      return PHOTO.put(id, out.blob).then(function (res) {
        photoIds[id] = true;
        state.photoDel = state.photoDel.filter(function (x) { return x !== id; });
        save();
        if (photoURLs[id]) URL.revokeObjectURL(photoURLs[id]);
        photoURLs[id] = URL.createObjectURL(out.blob);
        $shot.attr("data-for", "local:" + id).removeClass("busy");
        setShot($card, photoURLs[id]);
        $card.addClass("has_photo");
        refit($card);
        if (res && res.stored === false) toast("사진을 이번 화면에만 넣었습니다. 새로고침하면 사라집니다.", "priority_high");
        else toast("사진을 넣었습니다.", "image");
      });
    }).catch(function (err) {
      $shot.removeClass("busy");
      toast((err && err.message) ? err.message : "사진을 넣지 못했습니다.", "priority_high");
    });
  }

  function removePhoto($card) {
    var id = $card.attr("data-id");
    var $shot = $card.find(".shot");
    $shot.removeClass("has busy").removeAttr("data-for");
    $shot.find(".shot_img").removeAttr("src");
    delete photoIds[id];
    if (photoURLs[id]) { URL.revokeObjectURL(photoURLs[id]); delete photoURLs[id]; }
    /* 공개된 사진이면 '공개 목록에서 뺀다'는 표시를 남긴다 (다음 공개용 내보내기에 반영). */
    if (!inList(state.photoDel, id)) state.photoDel.push(id);
    $card.removeClass("has_photo");
    PHOTO.del(id);
    save();
    refit($card);
    toast("사진을 지웠습니다.", "delete_outline");
  }

  function zoomPhoto($card) {
    var id = $card.attr("data-id");
    var url = photoURLs[id] || (inList(state.photoDel, id) ? "" : (pubPhoto[id] || ""));
    if (!url) return;
    $(".shot_zoom").remove();
    var $z = $('<div class="shot_zoom" title="누르면 닫힙니다"><img alt=""></div>');
    $z.find("img").attr("src", url);
    $z.on("click", function () { $(this).remove(); });
    $("body").append($z);
  }

  function autoGrow(el) {
    var max = Math.round(window.innerHeight * 0.4);
    var before = el.offsetHeight;
    el.style.height = "auto";
    var h = Math.min(el.scrollHeight, max);
    el.style.height = h + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    return el.offsetHeight !== before;
  }

  function initPhotos() {
    /* 공개 화면은 이 브라우저의 사진 저장소(IndexedDB)를 열지 않는다. */
    if (!EDIT) {
      $(".bitem").each(function () { applyMarks($(this)); });
      return;
    }

    PHOTO.warm();
    PHOTO.keys().then(function (ids) {
      ids.forEach(function (id) { photoIds[id] = true; });
      $(".bitem").each(function () { applyMarks($(this)); });
    }).catch(function () {});
  }

  /* data/published.json 이 가리키는 사진 경로 — 카드를 그리기 전에 알아야 한다. */
  function readPublishedPhotos() {
    pubPhoto = {};
    var p = window.PUBLISHED ? PUBLISHED.data() : null;
    if (p && p.items) {
      Object.keys(p.items).forEach(function (id) {
        if (p.items[id].photo) pubPhoto[id] = p.items[id].photo;
      });
    }
  }

  /* ---------- 관리 패널 ---------- */

  function openManage() {
    $("#manage, #manage_bg").addClass("on");
    var sel = $("#m_cat");
    sel.html(DATA.categories.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join(""));
    fillManage();
  }

  function closeManage() { $("#manage, #manage_bg").removeClass("on"); }

  function fillManage() {
    var s = stats();
    var r = rankOf(s.done);
    var pubCount = Object.keys(pubPhoto).filter(function (id) { return !inList(state.photoDel, id); }).length;
    $("#m_summary").html(
      '<span class="m_big">' + s.done + "/" + s.total + '</span> 달성 · ' +
      '업적 <b>' + s.done + '</b>개 · ' + esc(r.cur.name) + ' (Lv.' + r.cur.lv + ')' +
      '<div class="m_sub">사진 <b>' + Object.keys(photoIds).length + '</b>장' +
      (pubCount ? ' (공개 ' + pubCount + '장)' : '') +
      ' · 메모 <b>' + Object.keys(state.memo).length + '</b>개</div>'
    );

    var dels = state.deleted.map(function (id) {
      var it = itemById(id);
      return '<li data-id="' + esc(id) + '"><span>' + esc(it ? it.t : id) + '</span>' +
        '<button class="m_restore">되살리기</button></li>';
    }).join("");
    $("#m_deleted").html(dels || '<li class="m_empty">삭제한 항목이 없습니다.</li>');

    $("#m_added").html(state.added.map(function (it) {
      return '<li data-id="' + esc(it.id) + '"><span>' + esc(it.t) + '</span>' +
        '<button class="m_del_added">지우기</button></li>';
    }).join("") || '<li class="m_empty">직접 추가한 항목이 없습니다.</li>');
  }

  function bind() {
    if (bound) return;
    bound = true;

    /* 카드 뒤집기: 카드의 빈 자리를 누를 때만. 버튼·입력칸 등은 각자 stopPropagation 하거나
     * 아래 목록에서 빼 둔다. */
    var NO_FLIP = "input, textarea, button, select, label, a, .act, .tick, .ach, .shot, .memo, .memo_wrap, .memo_ro, .b_flip";

    $(document).on("click", ".card.bitem, .card.guide", function (e) {
      if ($(e.target).closest(NO_FLIP).length) return;
      toggleCard($(this));
    });

    $(document).on("click", ".b_flip", function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeCard($(this).closest(".card"));
    });

    $(document).on("click", ".shot_img", function (e) {
      e.stopPropagation();
      zoomPhoto($(this).closest(".card"));
    });

    $(document).on("click", ".shot_zoom", function () { $(this).remove(); });

    $(document).on("keydown", function (e) {
      if (e.key === "Escape" && $(".shot_zoom").length) $(".shot_zoom").remove();
    });

    $(document).on("click", "#rank_chip", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    var resizeTimer = null;
    $(window).on("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        $(".card.flipped").each(function () { fitCard($(this)); });
      }, 120);
    });

    /* ---------- 여기서부터는 기록을 바꾸는 것들. 편집 모드에서만 붙인다. ---------- */
    if (!EDIT) return;

    $(document).on("click", ".bitem .tick, .bitem .ach", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleDone($(this).closest(".bitem").attr("data-id"));
    });

    $(document).on("click", ".bitem .act", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var act = $(this).attr("data-act");
      var id = $(this).closest(".bitem").attr("data-id");
      if (act === "done") toggleDone(id);
      else if (act === "fail") toggleFail(id);
      else if (act === "del") removeItem(id);
    });

    $(document).on("click", ".shot_empty, .shot_edit", function (e) {
      e.preventDefault();
      e.stopPropagation();
      pickPhoto($(this).closest(".card"));
    });

    $(document).on("click", ".shot_del", function (e) {
      e.preventDefault();
      e.stopPropagation();
      removePhoto($(this).closest(".card"));
    });

    $(document).on("change", ".file_in", function () {
      onPhotoChosen($(this).closest(".card"), this);
    });

    $(document).on("input", ".bitem .memo", function () {
      var $card = $(this).closest(".bitem");
      var id = $card.attr("data-id");
      var v = this.value;
      if (v.replace(/\s/g, "")) state.memo[id] = v; else delete state.memo[id];
      applyMarks($card);
      $card.find(".memo_state").text("저장 중").addClass("on");
      saveMemoSoon();
      if (autoGrow(this) && $card.hasClass("flipped")) refit($card);
    });

    $(document).on("blur", ".bitem .memo", function () {
      if (memoTimer) flushMemo();
    });

    /* 메모를 치다가 바로 창을 닫아도 마지막 글자가 남게. */
    $(window).on("pagehide beforeunload", function () {
      if (memoTimer) flushMemo();
    });

    $("#manage_bt").on("click", openManage);

    $("#m_restore_all_bt").on("click", resetDeleted);
    $("#m_export").on("click", exportJSON);
    $("#m_publish").on("click", exportPublish);
    $("#m_reset_prog").on("click", function () {
      var $b = $(this);
      if (!$b.hasClass("armed")) {
        $b.addClass("armed").text("한 번 더 누르면 초기화");
        setTimeout(function () { $b.removeClass("armed").text("진행 초기화"); }, 4000);
        return;
      }
      $b.removeClass("armed").text("진행 초기화");
      resetProgress();
      fillManage();
    });

    $("#m_add_bt").on("click", function () {
      var t = $("#m_t").val().trim();
      var d = $("#m_d").val().trim();
      var a = $("#m_a").val().trim();
      var cat = $("#m_cat").val();
      if (!t) { toast("제목을 적어 주세요.", "edit"); $("#m_t").focus(); return; }
      addItem(cat, t, d || t, a || "이름 없는 업적");
      $("#m_t").val(""); $("#m_d").val(""); $("#m_a").val("");
      fillManage();
    });

    $(document).on("click", "#m_deleted .m_restore", function () {
      var id = $(this).closest("li").attr("data-id");
      restoreItem(id);
      fillManage();
    });

    $(document).on("click", "#m_added .m_del_added", function () {
      var id = $(this).closest("li").attr("data-id");
      state.added = state.added.filter(function (x) { return x.id !== id; });
      state.deleted = state.deleted.filter(function (x) { return x !== id; });
      save();
      render();
      afterChange();
      fillManage();
    });

    $(document).on("keydown", function (e) {
      if (e.key === "Escape") closeManage();
    });
  }

  /* ---------- 공개 ---------- */

  return {
    init: function () {
      if (!inited) {
        readPublishedPhotos();
        state = load();
        inited = true;
      }
      render();
      bind();
      initPhotos();
      return this;
    },
    render: render,
    refresh: refresh,
    bind: bind,
    stats: stats,
    state: function () { return state; },
    editMode: function () { return EDIT; },
    resetProgress: resetProgress,
    exportJSON: exportJSON,
    exportPublish: exportPublish
  };
})();
