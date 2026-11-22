/* 공개용 묶음 내보내기 (편집 모드 전용).
 *
 * 지금 이 브라우저에서 만든 기록(달성 날짜·메모·사진)을 공개 페이지에 올릴 수 있는 한 묶음으로 만든다.
 *
 *   bucket-publish-YYYYMMDD.zip
 *     published.json        → 저장소의 data/published.json 으로
 *     img/memories/*.jpg    → 저장소의 img/memories/ 로
 *     README.txt            → 무엇을 어디에 넣는지
 *
 * zip 은 압축 없이(store) 담는다. 사진은 이미 JPEG 로 줄여 두었고, 브라우저에서 압축 라이브러리 없이
 * 만들 수 있는 가장 단순하고 안전한 방법이기 때문이다.
 */
var PUBLISH = (function () {
  "use strict";

  /* ---------- zip 만들기 (압축 없이) ---------- */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (window.TextEncoder) return new TextEncoder().encode(s);
    /* 아주 오래된 브라우저용 (편집 모드는 최신 브라우저를 전제로 하지만, 실패보다는 낫다). */
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function dosStamp(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
      date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF
    };
  }

  function makeZip(files) {
    var now = dosStamp(new Date());
    var chunks = [], central = [], offset = 0;

    files.forEach(function (f) {
      var name = utf8(f.name);
      var data = f.data;
      var crc = crc32(data);

      var head = new Uint8Array(30 + name.length);
      var hv = new DataView(head.buffer);
      hv.setUint32(0, 0x04034b50, true);   // local file header
      hv.setUint16(4, 20, true);           // version needed
      hv.setUint16(6, 0x0800, true);       // 파일 이름은 UTF-8
      hv.setUint16(8, 0, true);            // store (압축 없음)
      hv.setUint16(10, now.time, true);
      hv.setUint16(12, now.date, true);
      hv.setUint32(14, crc, true);
      hv.setUint32(18, data.length, true);
      hv.setUint32(22, data.length, true);
      hv.setUint16(26, name.length, true);
      hv.setUint16(28, 0, true);
      head.set(name, 30);
      chunks.push(head, data);

      var cd = new Uint8Array(46 + name.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central directory header
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, now.time, true);
      cv.setUint16(14, now.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);

      offset += head.length + data.length;
    });

    var cdSize = central.reduce(function (n, c) { return n + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);     // end of central directory
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [end]), { type: "application/zip" });
  }

  /* ---------- 내용 만들기 ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function today() {
    var d = new Date();
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate());
  }

  function stamp() {
    var d = new Date();
    return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function safeName(id) { return String(id).replace(/[^A-Za-z0-9_-]/g, "_"); }

  function fileOf(id) { return "img/memories/" + safeName(id) + ".jpg"; }

  /* 공개로 나갈 사진: 이 브라우저에 있으면 그것, 없으면 이미 공개된 사진. */
  function photoPlan(ctx) {
    var plan = {};
    (ctx.photoIds || []).forEach(function (id) { plan[id] = "local"; });
    var pub = (ctx.published && ctx.published.data()) ? ctx.published.data() : { items: {} };
    Object.keys(pub.items || {}).forEach(function (id) {
      if (plan[id]) return;
      if ((ctx.photoDel || []).indexOf(id) !== -1) return;
      if (pub.items[id].photo) plan[id] = pub.items[id].photo;
    });
    return plan;
  }

  function buildJSON(ctx, plan) {
    var state = ctx.state;
    var data = ctx.data;
    var out = {
      format: "bucket-published-v1",
      updated: today(),
      owner: {
        name: (data.owner && data.owner.name) || "규연",
        handle: (data.owner && data.owner.handle) || "AESWDQ"
      },
      items: {},
      fail: (state.fail || []).slice(),
      hidden: (state.deleted || []).slice(),
      added: []
    };

    function slot(id) {
      if (!out.items[id]) out.items[id] = {};
      return out.items[id];
    }

    Object.keys(state.done || {}).forEach(function (id) {
      if (state.done[id]) slot(id).done = String(state.done[id]);
    });
    Object.keys(state.memo || {}).forEach(function (id) {
      if (state.memo[id] && String(state.memo[id]).replace(/\s/g, "")) slot(id).memo = String(state.memo[id]);
    });
    Object.keys(plan).forEach(function (id) {
      slot(id).photo = fileOf(id);
    });

    out.added = (state.added || []).map(function (it) {
      return {
        id: it.id,
        cat: it.cat,
        t: it.t,
        d: it.d || "",
        a: it.a || "",
        b: it.b || ""
      };
    });

    return out;
  }

  function readPublishedPhoto(path) {
    return fetch(path, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .catch(function () { return null; });
  }

  function gather(ctx, plan) {
    var ids = Object.keys(plan);
    return Promise.all(ids.map(function (id) {
      if (plan[id] === "local") {
        return Promise.resolve(ctx.getPhoto(id)).then(function (blob) {
          if (!blob) return null;
          return blob.arrayBuffer().then(function (buf) { return { id: id, data: new Uint8Array(buf) }; });
        });
      }
      return readPublishedPhoto(plan[id]).then(function (buf) {
        return buf ? { id: id, data: new Uint8Array(buf) } : null;
      });
    })).then(function (list) {
      return list.filter(Boolean);
    });
  }

  var HOWTO = [
    "버킷리스트 공개용 묶음",
    "",
    "이 zip 을 성원에게 보내면 공개 페이지에 반영됩니다.",
    "  - published.json    → 저장소의 data/published.json 을 이 파일로 바꿉니다.",
    "  - img/memories/*.jpg → 저장소의 img/memories/ 에 그대로 넣습니다.",
    "",
    "반영되면 https://aeswdq.github.io/Bucket/ 에서 누구나 볼 수 있습니다.",
    "이 브라우저의 기록은 그대로 남습니다.",
    ""
  ].join("\n");

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------- 공개 ---------- */

  return {
    /* ctx: { state, data, photoIds: [id], photoDel: [id], published, getPhoto(id) -> Promise<Blob|null> } */
    exportAll: function (ctx) {
      var plan = photoPlan(ctx);
      var json = buildJSON(ctx, plan);
      return gather(ctx, plan).then(function (photos) {
        var files = [{
          name: "published.json",
          data: utf8(JSON.stringify(json, null, 2) + "\n")
        }];
        photos.forEach(function (p) {
          files.push({ name: fileOf(p.id), data: p.data });
        });
        files.push({ name: "README.txt", data: utf8(HOWTO) });
        download(makeZip(files), "bucket-publish-" + stamp() + ".zip");
        return { photos: photos.length, items: Object.keys(json.items).length };
      });
    }
  };
})();
