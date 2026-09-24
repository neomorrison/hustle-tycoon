"""Regenerate the API reference section of blender/README.md from the lib's signatures + docstrings.

    python blender/lib/gen_api.py        (plain Python 3, no Blender needed)

Replaces everything between the `<!-- api:start -->` and `<!-- api:end -->` markers.
"""
import ast
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
README = os.path.join(os.path.dirname(HERE), 'README.md')
FILES = [
    ('palette.py', 'palette.py (`from palette import get_mat`)'),
    ('build.py', 'build.py (`import build as B`)'),
    ('room.py', 'room.py (`import room as R`)'),
    ('furniture.py', 'furniture.py (`import furniture as F`)'),
    ('furniture2.py', 'furniture.py, continued (defined in furniture2.py; call as `F.<name>`)'),
]


def api_md():
    out = io.StringIO()
    for fn, title in FILES:
        src = open(os.path.join(HERE, fn), encoding='utf-8').read()
        tree = ast.parse(src)
        out.write(f'\n### {title}\n\n')
        for n in tree.body:
            if isinstance(n, ast.FunctionDef) and not n.name.startswith('_'):
                seg = ast.get_source_segment(src, n)
                head = seg[:seg.index('):') + 1] if '):' in seg else seg.split('\n')[0]
                sig = ' '.join(head.replace('def ', '', 1).split())
                doc = ' '.join((ast.get_docstring(n) or '').split())
                out.write(f'- `{sig}`<br>{doc}\n')
    return out.getvalue()


def main():
    txt = open(README, encoding='utf-8').read()
    a, b = '<!-- api:start -->', '<!-- api:end -->'
    i, j = txt.index(a) + len(a), txt.index(b)
    txt = txt[:i] + '\n' + api_md() + '\n' + txt[j:]
    with open(README, 'w', encoding='utf-8', newline='\n') as f:
        f.write(txt)
    print('README API section regenerated')


if __name__ == '__main__':
    main()
