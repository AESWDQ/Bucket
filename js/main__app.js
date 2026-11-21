/* 버킷리스트 앱: 카드 그리기, 업적 칭호, 전체 칭호(레벨), 달성/삭제 관리.
 *
 * 내용은 data/bucket.js, 이 파일은 동작만 담당합니다.
 * 달성·실패·삭제·추가 기록은 이 브라우저의 localStorage("bucket.state.v1")에만 저장됩니다.
 */
var BUCKET = (function () {
  "use strict";

  var KEY = "bucket.state.v1";
  var DATA = window.BUCKET_DATA;
  var state = load();
  var bound = false;

  /* ---------- 작은 도구들 ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function today() {
    var d = new Date();
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()) + ".";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function inList(list, v) { return list.indexOf(v) !== -1; }

  function blank() { return { done: {}, fail: [], deleted: [], added: [] }; }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { raw = null; }
    var s = blank();
    if (raw) {
      s.done = raw.done || {};
      s.fail = raw.fail || [];
      s.deleted = raw.deleted || [];
      s.added = raw.added || [];
    } else {
      /* 처음 방문: 데이터에 날짜가 적힌 항목만 달성으로 시작한다. */
      DATA.categories.forEach(function (c) {
        c.sections.forEach(function (sec) {
          sec.items.forEach(function (it) { if (it.done) s.done[it.id] = it.done; });
        });
      });
    }
    return s;
  }

  function save() {
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

  function cardHTML(it, catId) {
    return '' +
      '<div class="card bitem" data-id="' + esc(it.id) + '" data-cat="' + esc(catId) + '">' +
        '<dl class="front" id="c_' + esc(it.id) + '">' +
          '<div class="ach" title="업적 칭호: 달성하면 새겨집니다">' +
            '<i class="material-icons">military_tech</i>' +
            '<span class="ach_tag">업적</span>' +
            '<span class="ach_name">' + esc(it.a || "이름 없는 업적") + '</span>' +
          '</div>' +
          '<dt>' +
            '<i class="tick material-icons" title="달성 표시">check_box_outline_blank</i>' +
            '<span class="tt">' + esc(it.t) + '</span>' +
          '</dt>' +
          '<dd>' + esc(it.d) + '<span class="date"></span></dd>' +
        '</dl>' +
        '<div class="back">' +
          '<p class="back_title">' + esc(it.t) + '</p>' +
          '<p class="ach_back"><i class="material-icons">military_tech</i>업적 · ' + esc(it.a || "-") + '</p>' +
          (it.b ? '<p>' + esc(it.b) + '</p>' : '') +
          '<div class="acts">' +
            '<button class="act" data-act="done"><i class="material-icons">check_box</i><span>달성</span></button>' +
            '<button class="act" data-act="fail"><i class="material-icons">flag</i><span>포기</span></button>' +
            '<button class="act" data-act="del"><i class="material-icons">delete_outline</i><span>삭제</span></button>' +
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
        sec.items.forEach(function (it) { if (!inList(state.deleted, it.id)) h += cardHTML(it, cat.id); });
        h += '</section>';
      });
      var added = state.added.filter(function (a) { return a.cat === cat.id && !inList(state.deleted, a.id); });
      if (added.length) {
        h += '<h3 id="added_' + esc(cat.id) + '"><i class="material-icons">add_circle_outline</i><span>내가 추가한 항목</span></h3>';
        h += '<section class="sub">';
        added.forEach(function (it) { h += cardHTML(it, cat.id); });
        h += '</section>';
      }
      h += '</section>';
    });
    $("#contents").html(h);
    applyAll();
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
    $card.find(".ach").toggleClass("on", done);
    $card.find(".act[data-act=done] span").text(done ? "달성 해제" : "달성");
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
    $("#m_summary").html(
      '<span class="m_big">' + s.done + "/" + s.total + '</span> 달성 · ' +
      '업적 <b>' + s.done + '</b>개 · ' + esc(r.cur.name) + ' (Lv.' + r.cur.lv + ")"
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

    $("#manage_bt").on("click", openManage);
    $("#rank_chip").on("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

    $("#m_restore_all_bt").on("click", resetDeleted);
    $("#m_export").on("click", exportJSON);
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
      render();
      bind();
      return this;
    },
    render: render,
    refresh: refresh,
    bind: bind,
    stats: stats,
    state: function () { return state; },
    resetProgress: resetProgress,
    exportJSON: exportJSON
  };
})();
