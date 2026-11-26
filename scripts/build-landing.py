# Builds src/landing/LandingPaper.tsx and LandingArcade.tsx from the design system cards (HTML preview files):
# static HTML -> Solid JSX, then the wiring (links, copy, menu, star box, decorative mock-ups hidden from screen readers).
# Usage: python scripts/build-landing.py <folder with LandingPaperFull/ and LandingArcadeFull/> src/landing
import re, sys
cards, out_dir = sys.argv[1], sys.argv[2]

def lp_root(html):
    s = html[html.index('<body>') + 6: html.index('</body>')]
    i = s.index('<div class="lp ')
    # find the matching </div> for the .lp root
    depth, j = 0, i
    for m in re.finditer(r'<(/?)div\b[^>]*>', s[i:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            j = i + m.end(); break
    return s[i:j]

def to_jsx(s):
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    # A tag with two style attributes (in the card markup): JSX allows one, so merge them.
    s = re.sub(r'style="([^"]*)" style="([^"]*)"', lambda m: 'style="%s;%s"' % (m.group(1).rstrip(';'), m.group(2)), s)
    assert '{' not in s and '}' not in s, 'braces in text'
    s = re.sub(r'<(input|br|hr|img)\b([^>]*?)\s*/?>', lambda m: '<%s%s />' % (m.group(1), m.group(2).rstrip()), s)
    return s.replace(' tabindex=', ' tabIndex=').replace(' readonly', ' readOnly').replace(' for="f"', '')

DECOR = ' aria-hidden="true" inert'
MENU = '<LandingMenu links={[{ label: "Build", section: "build" }, { label: "Themes", section: "look" }, { label: "Share", section: "share" }, { label: "Responses", section: "read" }, { label: "GitHub", href: REPO }]} />'
NAV_RIGHT = '<span class="fb-top-sp"></span><a class="fb-btn fb-btn--secondary fb-btn--sm" href={REPO}>GitHub</a><StarBox /><a class="fb-btn fb-btn--primary fb-btn--sm" href="/admin">Sign in</a>' + MENU + '</nav>'

def wire(s):
    brand = re.compile(r'<a class="fb-brand" href="#"( style="[^"]*")?>\s*<span class="fb-mark">\s*<svg.*?</svg>\s*</span>Feedbacker</a>', re.S)
    n = [0]
    def b(m):
        n[0] += 1
        return '<Brand intro={props.intro} />' if n[0] == 1 else '<Brand />'
    s = brand.sub(b, s); assert n[0] == 2
    # Nav: section links stay; Docs goes; right side = GitHub (outlined), star box, Sign in (orange), phone menu.
    s = s.replace('<a class="lp-l" href="#">Docs</a>', '', 1)
    i = s.index('<span class="fb-top-sp"></span>'); k = s.index('</nav>', i) + 6
    s = s[:i] + NAV_RIGHT + s[k:]
    s = re.sub(r'href="#([a-z]+)"', r'href="#\1" onClick={jump("\1")}', s)
    s = s.replace('aria-label="Copy command">', 'aria-label="Copy command" onClick={copyCmd}>')
    s = re.sub(r'<a ([^>]*?)href="#">Self-host it', r'<a \1href={DOCS}>Self-host it', s)
    # Hosted mode (MODE=hosted): "Create a free account" comes first, and "Self-host it" becomes the second button.
    primary = '<a class="fb-btn fb-btn--primary fb-btn--lg" href={DOCS}>Self-host it'
    assert primary in s
    s = s.replace(primary, '{props.hosted && <a class="fb-btn fb-btn--primary fb-btn--lg" href="/admin/signup">Create a free account</a>}'
                  '<a class={props.hosted ? "fb-btn fb-btn--secondary fb-btn--lg" : "fb-btn fb-btn--primary fb-btn--lg"} href={DOCS}>Self-host it')
    s = re.sub(r'<a ([^>]*?)href="#">Live demo', r'<a \1href="/admin">Sign in', s)  # no public demo: open dev mode
    s = s.replace('<a href="#">Docs</a><a href="#">GitHub</a><a href="#">License</a>',
                  '<a href={REPO}>GitHub</a><a href={REPO} target="_blank" rel="noopener">Star on GitHub</a>')
    s = s.replace('<a class="fb-foot" href="#">', '<a class="fb-foot" href="/">')
    assert 'href="#"' not in s, re.findall(r'.{80}href="#".{40}', s)
    # Decorative mock-ups: hidden from screen readers and not focusable.
    s = s.replace('<div style="position:relative">', '<div style="position:relative"' + DECOR + '>', 1)
    for cls in ['lp-win', 'lp-frame', 'lp-themes']:
        s = re.sub(r'<div class="%s([" ])' % cls, lambda m: '<div' + DECOR + ' class="' + cls + m.group(1), s)
    s = s.replace('<div style="display:flex;flex-direction:column;gap:12px">', '<div style="display:flex;flex-direction:column;gap:12px"' + DECOR + '>')
    return s

HEAD = '''// Generated from the design system card "{card}" by scripts/build-landing.py: the mock-up markup is kept
// as it is; only the wiring changes (links, copy, phone menu, star box, decorative parts hidden from screen readers).
import {{ Brand }} from '../ui/kit';
import {{ copyCmd, DOCS, jump, LandingMenu, REPO, StarBox }} from './shared';

export default function {fn}(props: {{ intro: boolean; hosted: boolean }}) {{
  return (
'''
for fn, card in [('LandingPaper', 'LandingPaperFull'), ('LandingArcade', 'LandingArcadeFull')]:
    html = open(f'{cards}/{card}/preview.html', encoding='utf-8').read()
    body = wire(to_jsx(lp_root(html)))
    open(f'{out_dir}/{fn}.tsx', 'w', encoding='utf-8').write(HEAD.format(fn=fn, card=card) + body + '\n  );\n}\n')
    print(fn, len(body), 'inert:', body.count('inert'), 'jump:', body.count('jump('), 'copy:', body.count('copyCmd}'))
