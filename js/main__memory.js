/* 카드 사진 저장소와 사진 줄이기.
 *
 * 사진은 카드(항목) id 하나에 Blob 하나로, IndexedDB "bucket.photos.v1" 에 넣습니다.
 * localStorage(bucket.state.v1)는 5MB 라서 사진을 여러 장 넣으면 금방 차기 때문입니다.
 * 메모는 크기가 작으니 localStorage(bucket.state.v1)에 같이 넣습니다 (js/main__app.js).
 *
 * IndexedDB 를 쓸 수 없는 브라우저(일부 사생활 보호 모드 등)에서는 이번 화면에만
 * 사진을 들고 있다가, 저장되지 않는다고 알려 줍니다 (persistent() 가 false).
 */
var PHOTO = (function () {
  "use strict";

  var DB_NAME = "bucket.photos.v1";
  var STORE = "photos";
  var VERSION = 1;

  var openPromise = null;
  var memory = {};        // IndexedDB 를 못 쓰면 여기에만 담는다 (id -> Blob)
  var usable = true;      // IndexedDB 를 쓸 수 있는지
  var opened = false;

  function open() {
    if (openPromise) return openPromise;
    openPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("이 브라우저에는 IndexedDB 가 없습니다")); return; }
      var req;
      try {
        req = window.indexedDB.open(DB_NAME, VERSION);
      } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        opened = true;
        var db = req.result;
        db.onversionchange = function () { try { db.close(); } catch (e) {} };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error("IndexedDB 를 열지 못했습니다")); };
      req.onblocked = function () { reject(new Error("IndexedDB 가 다른 창에 막혀 있습니다")); };
    });
    openPromise.catch(function () { usable = false; });
    return openPromise;
  }

  function withStore(mode, run) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, store;
        try {
          tx = db.transaction(STORE, mode);
          store = tx.objectStore(STORE);
        } catch (e) { reject(e); return; }
        var req;
        try { req = run(store); } catch (e) { reject(e); return; }
        var result;
        if (req) {
          req.onsuccess = function () { result = req.result; };
          req.onerror = function () { reject(req.error || new Error("사진을 읽고 쓰지 못했습니다")); };
        }
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error || new Error("사진 저장 실패")); };
        tx.onabort = function () { reject(tx.error || new Error("사진 저장 취소")); };
      });
    });
  }

  /* ---------- 사진 줄이기 ---------- */

  function compress(file, maxSide, quality) {
    maxSide = maxSide || 900;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error("사진이 없습니다")); return; }
      if (!/^image\//i.test(file.type || "")) { reject(new Error("이미지 파일이 아닙니다")); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      var done = false;
      function fail(msg) {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        reject(new Error(msg));
      }
      img.onload = function () {
        if (done) return;
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) { fail("사진 크기를 읽지 못했습니다"); return; }
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          canvas.toBlob(function (blob) {
            if (done) return;
            done = true;
            URL.revokeObjectURL(url);
            if (!blob) { reject(new Error("사진을 줄이지 못했습니다")); return; }
            resolve({ blob: blob, w: cw, h: ch, bytes: blob.size });
          }, "image/jpeg", quality);
        } catch (e) {
          fail(e && e.message ? e.message : "사진을 처리하지 못했습니다");
        }
      };
      img.onerror = function () { fail("이 형식의 사진은 브라우저가 읽지 못합니다"); };
      img.src = url;
    });
  }

  /* ---------- 공개 ---------- */

  return {
    compress: compress,

    /* 쓰지 않는 저장소를 미리 열어 둔다 (첫 사진에서 기다리지 않게). */
    warm: function () { open().catch(function () {}); },

    persistent: function () { return usable; },
    isOpen: function () { return opened; },

    keys: function () {
      return withStore("readonly", function (store) { return store.getAllKeys(); })
        .then(function (keys) { return (keys || []).map(String); })
        .catch(function () { return Object.keys(memory); });
    },

    get: function (id) {
      if (memory[id]) return Promise.resolve(memory[id]);
      return withStore("readonly", function (store) { return store.get(String(id)); })
        .then(function (blob) { return blob || null; })
        .catch(function () { return memory[id] || null; });
    },

    put: function (id, blob) {
      if (!usable) { memory[id] = blob; return Promise.resolve({ stored: false }); }
      return withStore("readwrite", function (store) { return store.put(blob, String(id)); })
        .then(function () { memory[id] = blob; return { stored: true }; })
        .catch(function (err) {
          memory[id] = blob;
          throw err;
        });
    },

    del: function (id) {
      delete memory[id];
      if (!usable) return Promise.resolve();
      return withStore("readwrite", function (store) { return store.delete(String(id)); })
        .catch(function () {});
    }
  };
})();
