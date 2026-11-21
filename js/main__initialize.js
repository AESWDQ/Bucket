const time = {};
time.start = localStorage.timer || Date.now();

time.log = function (msg) {
  console.log(msg + ' (' + (Date.now() - time.start) + ' ms)');
}

time.log("init");

// 페이지에 끼워 넣는 module 파일. 버킷리스트 항목은 data/bucket.js 에 있고
// js/main__app.js 가 #contents 안에 카드를 그립니다.
const contents = [{
  from: "setting", // 설정 패널
  to: "body",
  type: "prepend"
}, {
  from: "dashboard", // 통계 대시보드
  to: "section#dashboard"
}];

$(document).ready(function () {
  let pending = contents.length;

  $.each(contents, function (id, val) {
    $.get("module/" + val.from + ".html", function (data) {
      switch (val.type) {
        case "prepend":
          $(val.to).prepend(data);
          break;
        default:
          $(val.to).append(data);
      }
    }).fail(function () {
      console.warn("module/" + val.from + ".html 을 불러오지 못했습니다.");
    }).always(function () {
      if (--pending == 0) {
        time.log("initialize: all modules were loaded.");
        // 카드 그리기 (data/bucket.js + js/main__app.js)
        if (window.BUCKET) {
          BUCKET.init();
          time.log("initialize: bucket cards were rendered.");
        }
        boot();
      }
    });
  });
  time.log("initialize: DOM is ready.");
});


// boot
function boot() {
  $.when(
    $.getScript("js/main__setting.js"),
    $.getScript("js/main__columns.js"),
    $.getScript("js/main__image.js"),
    $.getScript("js/main__info.js"),
    $.getScript("js/main.js"),
    $.Deferred(function(deferred) {
      $(deferred.resolve);
    })
  ).done(function() {
    $("div#splash").addClass("off"); // splash
    $(window).resize(function() {
      columns();
    });

    bucket.initialize();

    // 통계·칭호·업적 수치를 한 번 더 맞춘다 (info.js가 먼저 계산한 뒤)
    if (window.BUCKET) BUCKET.refresh();

    $(window).on('load', function() { //not document, but window
      columns();
      trim_contents_headline();
      scroll_at_open();
    });

  });
}
