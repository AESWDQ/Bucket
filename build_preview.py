#!/usr/bin/env python3
"""preview.html 만들기.

index.html은 module/*.html 을 서버에서 받아 끼워 넣습니다($.get). 그래서 파일을
그냥 더블클릭해서 열면 카드가 보이지 않습니다. 이 스크립트는 module 파일 내용을
index.html 안에 미리 넣은 preview.html 을 만들어, 서버 없이도 화면을 볼 수 있게 합니다.

    python3 build_preview.py

원본(index.html, module/*.html)은 건드리지 않습니다. 항목을 고친 뒤 다시 실행하세요.
"""
import json
import os
import re

root = os.path.dirname(os.path.abspath(__file__))
index_path = os.path.join(root, "index.html")
out_path = os.path.join(root, "preview.html")

index = open(index_path, encoding="utf-8").read()

init = open(os.path.join(root, "js/main__initialize.js"), encoding="utf-8").read()
names = re.findall(r'from:\s*"([^"]+)"', init)

pages = {}
for name in names:
    with open(os.path.join(root, "module", name + ".html"), encoding="utf-8") as f:
        pages[name] = f.read()

shim = """
  <script>
    /* 미리보기 전용: module/*.html 을 읽지 않고 미리 넣어 둔 내용을 돌려줍니다. */
    const PAGES = %s;
    const jq_get = $.get;
    $.get = function (url) {
      const key = String(url).replace(/^module\\//, "").replace(/\\.html$/, "");
      if (Object.prototype.hasOwnProperty.call(PAGES, key)) {
        const d = $.Deferred();
        if (typeof arguments[1] === "function") d.done(arguments[1]);
        d.resolve(PAGES[key]);
        return d.promise();
      }
      return jq_get.apply(this, arguments);
    };
  </script>
""" % json.dumps(pages, ensure_ascii=False, indent=0)

target = '  <script defer src="js/main__initialize.js"></script>'
if target not in index:
    raise SystemExit("index.html 에서 main__initialize.js 태그를 찾지 못했습니다.")

out = index.replace(target, shim + target)
out = out.replace("<title>규연의 버킷리스트</title>",
                  "<title>규연의 버킷리스트 (미리보기)</title>")

with open(out_path, "w", encoding="utf-8") as f:
    f.write(out)

print("preview.html 생성 완료:", out_path)
print("넣은 모듈 %d개: %s" % (len(pages), ", ".join(names)))
