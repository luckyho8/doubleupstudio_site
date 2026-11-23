"""Switch the MAZEHOLD pages from "in development" to "released" on launch day.

Do NOT run --apply before the game is actually published on Google Play:
the store URL returns 404 until then, so the badge would be a broken link.

  python -I -X utf8 tools/mazehold_release.py --check             # confirm every spot exists (changes nothing)
  python -I -X utf8 tools/mazehold_release.py --apply 2026-12-01  # launch day (the publish date)

What it changes (KO + EN unless noted):
  * tag "개발 중 · 비공개 테스트" -> "서비스 중" (lime)
  * both "Google Play · 출시 준비 중" chips -> official Google Play badge link
  * release line -> "v1.0.0 · RELEASED YYYY.MM.DD"
  * meta / og descriptions: drop "in development"
  * JSON-LD: softwareVersion 1.0.0, datePublished, downloadUrl
  * "개발 소식" section -> "업데이트" with the 1.0.0 launch note
    (game repo docs/RELEASE_NOTES.md, build 53 "프로덕션" block; internal test builds are not listed)
  * "곧 만나요" panel -> download panel
  * home + Games cards (KO): tag and release date
  * sitemap lastmod for the two MAZEHOLD pages
"""
import argparse
import os
import re
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAY = 'https://play.google.com/store/apps/details?id=com.doubleupstudio.mazehold'
VERSION = '1.0.0'


def badge(lang):
    if lang == 'ko':
        return (f'<a class="store-badge" href="{PLAY}"\n               target="_blank" rel="noopener">\n'
                '              <img src="/assets/img/badges/google-play-ko.png" alt="Google Play에서 다운로드" width="145" height="56" />\n'
                '            </a>')
    return (f'<a class="store-badge" href="{PLAY}"\n               target="_blank" rel="noopener">\n'
            '              <img src="/assets/img/badges/google-play-en.png" alt="Get it on Google Play" width="145" height="56" />\n'
            '            </a>')


def edits(date):
    dot = date.replace('-', '.')
    ko_notes = f'''    <!-- ============================== updates ============================== -->
    <section class="section" id="news">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Updates</p>
          <h2>업데이트</h2>
        </div>
        <ul class="changelog">
          <li>
            <div class="changelog__head">
              <span class="changelog__ver">{VERSION} 정식 출시</span>
              <span class="changelog__date">{dot}</span>
            </div>
            <p style="margin:0 0 .5rem">MAZEHOLD 정식 출시! 타워로 미로를 짓고 대문을 지키세요.</p>
            <ul>
              <li>스테이지 3개, 각 100웨이브</li>
              <li>타워 모으기와 강화</li>
              <li>매주 바뀌는 레이드 보스와 랭킹</li>
              <li>스테이지를 깨면 무한모드</li>
            </ul>
          </li>
        </ul>
      </div>
    </section>
'''
    en_notes = f'''    <!-- ============================== updates ============================== -->
    <section class="section" id="news">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Updates</p>
          <h2>Updates</h2>
        </div>
        <ul class="changelog">
          <li>
            <div class="changelog__head">
              <span class="changelog__ver">{VERSION} Launch</span>
              <span class="changelog__date">{dot}</span>
            </div>
            <p style="margin:0 0 .5rem">MAZEHOLD is out! Build a maze with your towers and hold the gate.</p>
            <ul>
              <li>3 stages, 100 waves each</li>
              <li>Collect and upgrade towers</li>
              <li>Weekly raid boss and rankings</li>
              <li>Endless mode after you clear a stage</li>
            </ul>
          </li>
        </ul>
      </div>
    </section>
'''
    jsonld_extra = f'  "softwareVersion": "{VERSION}",\n  "datePublished": "{date}",\n  "downloadUrl": "{PLAY}",\n'
    return {
        'games/mazehold/index.html': [
            ('<span class="tag tag--amber">개발 중 · 비공개 테스트</span>', '<span class="tag tag--lime">서비스 중</span>', 1),
            ('<span class="store-soon" aria-label="Google Play 출시 준비 중">Google Play · 출시 준비 중</span>', badge('ko'), 2),
            ('<p class="release-date">IN DEVELOPMENT · CLOSED TESTING</p>', f'<p class="release-date">v{VERSION} · RELEASED {dot}</p>', 1),
            ('대문 16종, 매주 레이드. 게임 방법 · 타워 · 대문 가이드. 현재 개발 중(비공개 테스트).', '대문 16종, 매주 레이드. 게임 방법 · 타워 · 대문 가이드. Google Play에서 무료로 즐기세요.', 1),
            ('content="타워가 곧 미로가 되는 네온 픽셀 타워 디펜스. 현재 개발 중."', 'content="타워가 곧 미로가 되는 네온 픽셀 타워 디펜스. Google Play에서 무료."', 1),
            ('  "url": "https://doubleupstudio.com/games/mazehold/",\n', '  "url": "https://doubleupstudio.com/games/mazehold/",\n' + jsonld_extra, 1),
            ('          <a href="#news">개발 소식</a>', '          <a href="#news">업데이트</a>', 1),
            (re.compile(r'    <!-- =+ dev status =+ -->\n.*?</section>\n', re.S), ko_notes, 1),
            ('''          <p class="eyebrow">Coming Soon</p>
          <h2>곧 만나요</h2>''', '''          <p class="eyebrow">Download</p>
          <h2>지금 무료로 플레이하세요</h2>''', 1),
        ],
        'games/mazehold/en/index.html': [
            ('<span class="tag tag--amber">In development · Closed testing</span>', '<span class="tag tag--lime">Live</span>', 1),
            ('<span class="store-soon" aria-label="Google Play version coming soon">Google Play · Coming soon</span>', badge('en'), 2),
            ('<p class="release-date">IN DEVELOPMENT · CLOSED TESTING</p>', f'<p class="release-date">v{VERSION} · RELEASED {dot}</p>', 1),
            ('How to play, towers and gates. In development (closed testing).', 'How to play, towers and gates. Free on Google Play.', 1),
            ('content="A neon pixel tower defense where your towers are the maze. In development."', 'content="A neon pixel tower defense where your towers are the maze. Free on Google Play."', 1),
            ('  "url": "https://doubleupstudio.com/games/mazehold/en/",\n', '  "url": "https://doubleupstudio.com/games/mazehold/en/",\n' + jsonld_extra, 1),
            ('          <a href="#news">Dev status</a>', '          <a href="#news">Updates</a>', 1),
            (re.compile(r'    <!-- =+ dev status =+ -->\n.*?</section>\n', re.S), en_notes, 1),
            ('''          <p class="eyebrow">Coming Soon</p>
          <h2>See you soon</h2>''', '''          <p class="eyebrow">Download</p>
          <h2>Play free now</h2>''', 1),
        ],
        'index.html': [
            (re.compile(r'(<a class="game-card game-card--link" href="/games/mazehold/">.*?)<span class="tag tag--amber">개발 중</span>', re.S),
             r'\1<span class="tag tag--lime">서비스 중</span>', 1),
            (re.compile(r'(<a class="game-card game-card--link" href="/games/mazehold/">.*?)<li><b>출시</b><span>미정</span></li>', re.S),
             r'\1<li><b>출시</b><span>' + dot + ' Google Play</span></li>', 1),
        ],
        'games/index.html': [
            (re.compile(r'(<a class="game-card game-card--link" href="/games/mazehold/">.*?)<span class="tag tag--amber">개발 중</span>', re.S),
             r'\1<span class="tag tag--lime">서비스 중</span>', 1),
            (re.compile(r'(<a class="game-card game-card--link" href="/games/mazehold/">.*?)<li><b>출시</b><span>미정</span></li>', re.S),
             r'\1<li><b>출시</b><span>' + dot + ' Google Play</span></li>', 1),
        ],
        'sitemap.xml': [
            (re.compile(r'(<loc>https://doubleupstudio.com/games/mazehold/</loc>\s*<lastmod>)[^<]+'), r'\g<1>' + date, 1),
            (re.compile(r'(<loc>https://doubleupstudio.com/games/mazehold/en/</loc>\s*<lastmod>)[^<]+'), r'\g<1>' + date, 1),
        ],
    }


def run(date, apply):
    ok = True
    for rel, rules in edits(date).items():
        path = os.path.join(SITE, rel)
        text = open(path, encoding='utf-8').read()
        for old, new, want in rules:
            if isinstance(old, re.Pattern):
                n = len(old.findall(text))
                text = old.sub(new, text, count=want)
                label = old.pattern[:60]
            else:
                n = text.count(old)
                text = text.replace(old, new)
                label = old[:60]
            status = 'ok' if n == want else f'FOUND {n}, expected {want}'
            if n != want:
                ok = False
            print(f'  [{status}] {rel}: {label!r}')
        if apply and ok:
            open(path, 'w', encoding='utf-8', newline='\n').write(text)
    return ok


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', action='store_true', help='verify every spot exists; change nothing')
    g.add_argument('--apply', metavar='YYYY-MM-DD', help='publish date; rewrite the files')
    a = ap.parse_args()
    if a.apply and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', a.apply):
        sys.exit('date must be YYYY-MM-DD')
    date = a.apply or '2000-01-01'
    if not run(date, apply=False):
        sys.exit('some spots were not found — nothing written. Fix the page or this script first.')
    if a.apply:
        run(date, apply=True)
        print(f'MAZEHOLD switched to released ({date}). Review the diff, check the Play link opens, then commit.')
    else:
        print('check passed — every spot is in place. Nothing was changed.')


if __name__ == '__main__':
    main()
