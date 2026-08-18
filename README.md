# doubleupstudio.com

DoubleUp Studio 공식 사이트. 빌드 도구 없는 순수 정적 HTML/CSS/JS이며,
GitHub Pages가 `main` 브랜치 루트를 그대로 서빙합니다.

## 배포

| 항목 | 값 |
| --- | --- |
| 호스팅 | GitHub Pages (`main` 브랜치 / 루트) |
| 커스텀 도메인 | `doubleupstudio.com` (`CNAME` 파일) |
| 빌드 단계 | 없음 — `main`에 push하면 1~2분 내 반영 |
| Jekyll | `.nojekyll`로 비활성화 |

## 구조

```
.
├── index.html              홈 (플레이어블 히어로 — 아래 참고)
├── games/index.html        게임 목록
├── about/index.html        스튜디오 소개
├── contact/index.html      문의
├── privacy/index.html      개인정보처리방침 (한국어)
├── privacy/en/index.html   Privacy Policy (English)
├── 404.html                404 페이지
├── assets/
│   ├── css/style.css       전체 페이지가 공유하는 유일한 스타일시트
│   ├── js/site.js          모바일 메뉴 토글, 푸터 연도
│   ├── js/hero-game.js     홈 전용 캔버스 슈터 (아래 참고)
│   └── img/                로고 파생 이미지 (워드마크 / 마크 / 파비콘)
├── doubleupstudio_logo_01.png   원본 로고 (OG 이미지용으로 유지)
├── doubleupstudio_logo_02.png   원본 로고 (OG 이미지용으로 유지)
├── CNAME
├── robots.txt
└── sitemap.xml
```

헤더와 푸터는 빌드 도구가 없으므로 각 HTML 파일에 그대로 복사되어 있습니다.
메뉴를 바꿀 때는 6개 페이지(`index`, `games`, `about`, `contact`, `privacy`,
`privacy/en`)와 `404.html`을 함께 수정하세요.

## 로컬에서 보기

절대 경로(`/assets/...`)를 쓰기 때문에 파일을 직접 열지 말고 로컬 서버로 띄워야 합니다.

```bash
python -m http.server 8000
```

`http://localhost:8000` 접속.

## 자주 하는 작업

### 게임 추가

`games/index.html`에서 `<article class="game-card">` 블록을 복사해 내용을 바꾸고,
비어 있는 `game-card--empty` 슬롯을 하나 지웁니다. 홈의 미리보기 카드도 같이 갱신하세요.

### 게임 출시 반영

`games/index.html`의 `game:sortini` 주석 블록에 순서가 적혀 있습니다.
스크린샷 교체 → 상태 태그 변경 → 스토어 링크 주석 해제.

### AdMob 도입

`privacy/index.html` 상단의 유지보수 주석에 수정할 섹션(S4·S5·S6·S7)과
교체용 문안이 들어 있습니다. `privacy/en/index.html`도 동일하게 수정하고,
Play Console 데이터 보안 양식과 App Store Connect 개인정보 라벨도 함께 갱신해야 합니다.

## 플레이어블 히어로 (홈)

홈 첫 화면은 로켓(로고) 슈터 미니게임입니다. 바닐라 JS 단일 파일
`assets/js/hero-game.js`, 의존성·백엔드 없음. 핵심 설계:

- **스크롤은 절대 가로채지 않음.** 게임→홈 전환은 scrollY를 읽어 sticky 스테이지에
  transform을 입히는 스크롤 연동 방식(중간 40~60% 구간에서 멈춤 plateau).
  `.game-track`(250vh 활주로) + `.page-body`(margin-top:-100svh)가 커튼 효과를 만듭니다.
- **진입은 옵트인.** 데스크탑 PRESS START(또는 Enter), 모바일 TAP TO PLAY.
  시작 전엔 어트랙트 모드(자동 비행·발사)이고 터치·스크롤이 100% 네이티브입니다.
- **모바일 조작**: 한 손가락 상대 드래그 + 상시 오토파이어. 플레이 중에만
  스테이지에 `touch-action:none` + pull-to-refresh 차단이 걸리고, 손을 떼면
  일시정지 오버레이(RESUME / 홈 보기)가 뜹니다.
- **이탈 경로 3중화**: HP 0 게임오버(+부드러운 자동 스크롤 1회), HUD의 EXIT ▼,
  ESC. SKIP ▼ 링크는 상시 표시.
- **파괴 요소**: h1 글자(span.glyph)와 픽셀 별을 총알로 부술 수 있고 8초 후 재생성.
- **폴백**: JS 미로드 / `prefers-reduced-motion` → 정적 히어로 그대로.
  콘텐츠는 전부 첫 바이트부터 실제 HTML(SEO/LCP는 h1 텍스트 담당).
- 베스트 스코어는 localStorage(`dus-best`), 음소거는 `dus-mute`.
- 디버그: 콘솔에서 `__dusGame` (state/score/tick(n)/start()/exit()).

## 폰트

- **Galmuri11** (SIL OFL) — 한글 픽셀 폰트, jsDelivr CDN
- **Press Start 2P** (SIL OFL) — 라틴 전용 액센트, Google Fonts

본문은 시스템 폰트 스택을 쓰고, 픽셀 폰트는 제목·버튼·라벨에만 적용해
가독성과 로딩 무게를 맞췄습니다.
