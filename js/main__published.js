/* 공개 기록(data/published.json) 읽기.
 *
 * 공개 페이지(https://aeswdq.github.io/Bucket/)는 이 파일 하나만 보고 기록을 그립니다.
 * 편집 모드(?edit=1)는 localStorage(bucket.state.v1) · IndexedDB(bucket.photos.v1) 를 씁니다.
 *
 * data/published.json 모양
 *   {
 *     "format": "bucket-published-v1",
 *     "updated": "2026.11.22",
 *     "owner": { "name": "규연", "handle": "AESWDQ" },
 *     "items": {
 *       "mt01": { "done": "2026.11.21", "memo": "카드 뒷면에 나올 글", "photo": "img/memories/mt01.jpg" }
 *     },
 *     "fail": ["tr05"],
 *     "hidden": ["lf12"],
 *     "added": [ { "id": "add_x1", "cat": "life", "t": "제목", "d": "설명", "a": "업적 칭호", "b": "" } ]
 *   }
 *   items 의 id 는 data/bucket.js 의 항목 id 입니다. done/memo/photo 중 있는 것만 카드에 나옵니다.
 *   hidden 은 공개 화면에서 감출 항목(편집 모드에서 삭제한 것)입니다.
 *
 * preview.html 은 build_preview.py 가 window.BUCKET_PUBLISHED_PRELOAD 에 같은 내용을 넣어 두므로
 * 서버 없이도 공개 화면을 볼 수 있습니다.
 */
var PUBLISHED = (function () {
  "use strict";

  var URL = "data/published.json";
  var preload = window.BUCKET_PUBLISHED_PRELOAD || null;
  var done = false;      // 실제로 파일을 읽었는지 (못 읽으면 bucket.js 의 기본 달성을 쓴다)

  function empty() { return { updated: "", items: {}, fail: [], hidden: [], added: [] }; }

  function normalize(raw) {
    var d = empty();
    if (!raw || typeof raw !== "object") return d;
    d.updated = raw.updated ? String(raw.updated) : "";
    if (raw.hidden && raw.hidden.length) {
      d.hidden = Array.prototype.map.call(raw.hidden, String);
    }

    var items = raw.items && typeof raw.items === "object" ? raw.items : {};
    Object.keys(items).forEach(function (id) {
      var it = items[id];
      if (!it || typeof it !== "object") return;
      var rec = {};
      if (it.done) rec.done = String(it.done);
      if (it.memo && String(it.memo).replace(/\s/g, "")) rec.memo = String(it.memo);
      if (it.photo) rec.photo = String(it.photo);
      if (rec.done || rec.memo || rec.photo) d.items[id] = rec;
    });

    if (raw.fail && raw.fail.length) {
      d.fail = Array.prototype.map.call(raw.fail, String);
    }

    if (raw.added && raw.added.length) {
      d.added = Array.prototype.filter.call(raw.added, function (it) {
        return it && it.id && it.cat && it.t;
      }).map(function (it) {
        return {
          id: String(it.id),
          cat: String(it.cat),
          t: String(it.t),
          d: it.d ? String(it.d) : "",
          a: it.a ? String(it.a) : "",
          b: it.b ? String(it.b) : ""
        };
      });
    }

    return d;
  }

  var data = normalize(preload);
  if (preload) done = true;

  /* 한 번만 읽는다. 실패해도 페이지는 그대로 뜨고, 리스트의 기본 달성만 보인다. */
  var promise = null;

  function load() {
    if (promise) return promise;
    if (done) { promise = Promise.resolve(data); return promise; }
    promise = new Promise(function (resolve) {
      $.ajax({ url: URL, dataType: "json", cache: false })
        .done(function (raw) {
          data = normalize(raw);
          done = true;
          resolve(data);
        })
        .fail(function () {
          resolve(data);
        });
    });
    return promise;
  }

  return {
    load: load,
    loaded: function () { return done; },
    data: function () { return data; },
    item: function (id) { return data.items[id] || null; },
    photo: function (id) { var it = data.items[id]; return it && it.photo ? it.photo : ""; },
    memo: function (id) { var it = data.items[id]; return it && it.memo ? it.memo : ""; },
    doneOn: function (id) { var it = data.items[id]; return it && it.done ? it.done : ""; }
  };
})();
