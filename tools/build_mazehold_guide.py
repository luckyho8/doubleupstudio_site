"""MAZEHOLD game-guide builder for doubleupstudio.com.

Reads the game repository (read-only) and regenerates the data-driven parts of
/games/mazehold/ (ko) and /games/mazehold/en/ (en):

  * stage cards     -> <!-- BEGIN guide:stages -->  ... <!-- END guide:stages -->
  * 41 tower cards  -> <!-- BEGIN guide:towers -->  ... <!-- END guide:towers -->
  * 16 gate cards   -> <!-- BEGIN guide:gates -->   ... <!-- END guide:gates -->
  * store screenshots -> <!-- BEGIN guide:shots --> ... <!-- END guide:shots -->

Only the text between those markers is replaced; hand-written copy elsewhere
on the page is left alone. Images are written to assets/img/games/mazehold/.

Sources (game repo, all under MazeholdUnity/Assets/_Game unless noted):
  Data/Json/towers.json, gates.json, gate_visuals.json, stages.json, waves.json
  Localization/ko.json, en.json        (names, roles, specials, passives)
  Art/TowerCards/card_<key>.png        (tower art)
  Art/Gates/gate_{fill,detail,border,mark}_<key>.png  (gate art, tinted like GateArt.cs)
  Art/Illust/stage_card_0N.png         (stage art)
  docs/store_listing/screen_*.png, docs/store_listing/en/screen_*.png  (screenshots)

Usage (from the site repo root):
  python -I -X utf8 tools/build_mazehold_guide.py "E:/_Vibe_Coding/_TowerDefense_01"
  add --no-images to rewrite only the HTML.

When the game data changes, run it again and review the diff. Never edit the
numbers or names inside the markers by hand.
"""
import argparse
import glob
import html
import json
import os
import re
import sys

from PIL import Image

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = {'ko': 'games/mazehold/index.html', 'en': 'games/mazehold/en/index.html'}
IMG_DIR = 'assets/img/games/mazehold'
IMG_URL = '/assets/img/games/mazehold'

TOWER_GRADES = ['basic', 'rare', 'superRare', 'hero', 'god']
GATE_GRADES = ['basic', 'rare', 'superRare']
GATE_GRADE_KEY = {'basic': 'grade.basic', 'rare': 'grade.rare', 'superRare': 'grade.superrare'}

# Fixed UI words for the site (not game text). Kept here so the fragments stay
# fully generated; everything else comes from the game's localisation files.
WORDS = {
    'ko': {
        'noSpecial': '특수 능력 없음',
        'noPassive': '특수 기능 없음',
        'gachaExcluded': '뽑기에서 나오지 않음 · 스테이지 1 클리어 보상',
        'hp': '체력', 'starter': '기본 지급', 'ruby': '{0}루비',
        'stage': 'STAGE {0}', 'waves': '{0} 웨이브',
        'count': '{0}종',
        'shotAlt': ['타이틀 화면', '스테이지 3 교차 회로 — 두 갈래로 오는 몬스터와 타워 미로', '스테이지 1 외곽 회로 — 타워로 지은 미로',
                    '타워뽑기 — 1회 · 10회 뽑기와 등급 확률', '타워 강화 — 루비로 타워를 키운다', '로비 — 스테이지 선택 · 레이드 · 게임입장'],
    },
    'en': {
        'noSpecial': 'No special ability',
        'noPassive': 'No special ability',
        'gachaExcluded': 'Not in the Gacha · Stage 1 clear reward',
        'hp': 'HP', 'starter': 'Starter gate', 'ruby': '{0} rubies',
        'stage': 'STAGE {0}', 'waves': '{0} waves',
        'count': '{0}',
        'shotAlt': ['Title screen', 'Stage 3 Cross Circuit — monsters from two sides and a tower maze', 'Stage 1 Outer Circuit — a maze built from towers',
                    'Gacha — single and ten draws with grade odds', 'Boost — power up towers with rubies', 'Lobby — stage select, Raid and Start'],
    },
}


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def esc(s):
    return html.escape(s or '', quote=True)


def replace_block(text, name, body):
    pat = re.compile(r'(<!-- BEGIN guide:%s[^>]*-->).*?(\n[ \t]*<!-- END guide:%s -->)' % (name, name), re.S)
    if not pat.search(text):
        raise SystemExit(f'marker guide:{name} not found')
    return pat.sub(lambda m: m.group(1) + '\n' + body + m.group(2), text, count=1)


def hex_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tint(im, rgb):
    """Unity Image.color multiply."""
    r, g, b, a = im.split()
    r = r.point(lambda v: v * rgb[0] // 255)
    g = g.point(lambda v: v * rgb[1] // 255)
    b = b.point(lambda v: v * rgb[2] // 255)
    return Image.merge('RGBA', (r, g, b, a))


def build_images(game, towers, gates, visuals):
    art = os.path.join(game, 'MazeholdUnity/Assets/_Game/Art')
    out = os.path.join(SITE, IMG_DIR)
    for sub in ('towers', 'gates', 'stages'):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    for key in towers:
        im = Image.open(os.path.join(art, 'TowerCards', f'card_{key}.png')).convert('RGBA')
        im.resize((160, 160), Image.LANCZOS).save(os.path.join(out, 'towers', f'{key}.webp'), quality=88, method=6)
    for key in gates:
        v = visuals.get(key, {})
        comp = Image.new('RGBA', (64, 64))
        for layer, color in (('fill', v.get('fill')), ('detail', None), ('border', v.get('border')), ('mark', v.get('accent'))):
            p = os.path.join(art, 'Gates', f'gate_{layer}_{key}.png')
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGBA')
            if color:
                im = tint(im, hex_rgb(color))
            comp = Image.alpha_composite(comp, im)
        comp.resize((128, 128), Image.NEAREST).save(os.path.join(out, 'gates', f'{key}.webp'), lossless=True, method=6)
    for n in range(1, 10):
        p = os.path.join(art, 'Illust', f'stage_card_{n:02d}.png')
        if not os.path.exists(p):
            break
        im = Image.open(p).convert('RGB')
        w, h = im.size
        im.resize((960, round(h * 960 / w)), Image.LANCZOS).save(os.path.join(out, 'stages', f'stage-{n}.webp'), quality=86, method=6)
    # store screenshots (1920x1080 -> 960x540 JPG), per language
    store = os.path.join(game, 'docs/store_listing')
    for lang, src in (('ko', store), ('en', os.path.join(store, 'en'))):
        files = sorted(glob.glob(os.path.join(src, 'screen_*.png')))
        dst = os.path.join(out, lang)
        os.makedirs(dst, exist_ok=True)
        for old in glob.glob(os.path.join(dst, 'shot-*.jpg')):
            os.remove(old)
        for i, f in enumerate(files, 1):
            Image.open(f).convert('RGB').resize((960, 540), Image.LANCZOS).save(
                os.path.join(dst, f'shot-{i}.jpg'), quality=84, optimize=True, progressive=True)
    print('images written to', IMG_DIR)


def stages_html(lang, loc, stages, waves_per_stage, W):
    names = stages.get('stageNames', {})
    items = []
    for n in sorted(names, key=int):
        name = loc.get(f'stage.{n}.name') or names[n]
        items.append(
            f'''          <li class="stage-card">
            <img src="{IMG_URL}/stages/stage-{n}.webp" alt="{esc(name)}" width="960" height="400" loading="lazy" />
            <div class="stage-card__body">
              <span class="stage-card__no">{W['stage'].format(n)}</span>
              <b class="stage-card__name">{esc(name)}</b>
              <span class="stage-card__waves">{W['waves'].format(waves_per_stage)}</span>
            </div>
          </li>''')
    return '        <ul class="stage-list">\n' + '\n'.join(items) + '\n        </ul>'


def towers_html(lang, loc, towers, W):
    out = []
    for grade in TOWER_GRADES:
        keys = [k for k, v in towers.items() if v.get('grade') == grade]
        if not keys:
            continue
        label = loc.get(f'grade.tower.{grade}', grade)
        out.append(f'        <h3 class="unit-group unit-group--{grade}">{esc(label)} <span>{W["count"].format(len(keys))}</span></h3>')
        out.append(f'        <ul class="unit-grid">')
        for k in keys:
            name = loc.get(f'tower.{k}.name') or towers[k].get('name', k)
            role = loc.get(f'tower.{k}.role', '')
            special = loc.get(f'tower.{k}.special', '')
            if not special or special.strip() in ('없음', 'None', 'none', '-'):
                special = W['noSpecial']
            note = ''
            if towers[k].get('gachaExcluded'):
                note = f'\n              <p class="unit-card__note">{esc(W["gachaExcluded"])}</p>'
            out.append(f'''          <li class="unit-card unit-card--{grade}">
            <img src="{IMG_URL}/towers/{k}.webp" alt="" width="80" height="80" loading="lazy" />
            <div class="unit-card__body">
              <b class="unit-card__name">{esc(name)}</b>
              <span class="unit-card__role">{esc(role)}</span>
              <p class="unit-card__desc">{esc(special)}</p>{note}
            </div>
          </li>''')
        out.append('        </ul>')
    return '\n'.join(out)


def gates_html(lang, loc, gates, W):
    out = []
    for grade in GATE_GRADES:
        keys = [k for k, v in gates.items() if v.get('grade') == grade]
        if not keys:
            continue
        label = loc.get(GATE_GRADE_KEY[grade], grade)
        out.append(f'        <h3 class="unit-group unit-group--{grade}">{esc(label)} <span>{W["count"].format(len(keys))}</span></h3>')
        out.append('        <ul class="unit-grid unit-grid--gates">')
        for k in keys:
            g = gates[k]
            name = loc.get(f'gate.{k}.name') or g.get('name', k)
            passive = loc.get(f'gate.{k}.passive') or W['noPassive']
            price = W['starter'] if not g.get('rubyPrice') else W['ruby'].format(f"{g['rubyPrice']:,}")
            out.append(f'''          <li class="unit-card unit-card--gate unit-card--{grade}">
            <img class="pixel" src="{IMG_URL}/gates/{k}.webp" alt="" width="64" height="64" loading="lazy" />
            <div class="unit-card__body">
              <b class="unit-card__name">{esc(name)}</b>
              <span class="unit-card__role">{W['hp']} {g.get('hp', '')} · {esc(price)}</span>
              <p class="unit-card__desc">{esc(passive)}</p>
            </div>
          </li>''')
        out.append('        </ul>')
    return '\n'.join(out)


def shots_html(lang, game, W):
    files = sorted(glob.glob(os.path.join(game, 'docs/store_listing', *([] if lang == 'ko' else ['en']), 'screen_*.png')))
    alts = W['shotAlt']
    rows = []
    for i, _ in enumerate(files, 1):
        alt = alts[i - 1] if i - 1 < len(alts) else f'MAZEHOLD {i}'
        rows.append(f'          <img src="{IMG_URL}/{lang}/shot-{i}.jpg" alt="{esc(alt)}" width="960" height="540" loading="lazy" />')
    return '        <div class="shots shots--landscape">\n' + '\n'.join(rows) + '\n        </div>'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('game', help='path to the game repository (E:/_Vibe_Coding/_TowerDefense_01)')
    ap.add_argument('--no-images', action='store_true')
    a = ap.parse_args()
    data = os.path.join(a.game, 'MazeholdUnity/Assets/_Game')
    towers = load(os.path.join(data, 'Data/Json/towers.json'))
    gates = load(os.path.join(data, 'Data/Json/gates.json'))
    visuals = load(os.path.join(data, 'Data/Json/gate_visuals.json'))
    stages = load(os.path.join(data, 'Data/Json/stages.json'))
    waves_per_stage = load(os.path.join(data, 'Data/Json/waves.json')).get('wavesPerStage', 100)
    if not a.no_images:
        build_images(a.game, towers, gates, visuals)
    for lang, page in PAGES.items():
        loc = load(os.path.join(data, f'Localization/{lang}.json'))
        W = WORDS[lang]
        path = os.path.join(SITE, page)
        with open(path, encoding='utf-8') as f:
            text = f.read()
        text = replace_block(text, 'stages', stages_html(lang, loc, stages, waves_per_stage, W))
        text = replace_block(text, 'towers', towers_html(lang, loc, towers, W))
        text = replace_block(text, 'gates', gates_html(lang, loc, gates, W))
        text = replace_block(text, 'shots', shots_html(lang, a.game, W))
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print(f'{page}: stages {len(stages.get("stageNames", {}))}, towers {len(towers)}, gates {len(gates)}')


if __name__ == '__main__':
    sys.exit(main())
