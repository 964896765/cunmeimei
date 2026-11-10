"""Check WXML element nesting (not a replacement for the WeChat compiler)."""
from html.parser import HTMLParser
from pathlib import Path
import sys, re

class WxmlNesting(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack=[]
        self.errors=[]
    def handle_starttag(self, tag, attrs):
        self.stack.append((tag,self.getpos()[0]))
    def handle_startendtag(self, tag, attrs):
        pass
    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1][0]!=tag:
            self.errors.append(f'line {self.getpos()[0]}: unexpected </{tag}>')
        else:
            self.stack.pop()

root=Path(__file__).resolve().parents[1]
files=sorted((root/'miniprogram').rglob('*.wxml'))
errors=[]
for file in files:
    parser=WxmlNesting()
    source=file.read_text(encoding='utf-8')
    for expr in re.findall(r'{{[\s\S]*?}}',source):
        if re.search(r'&(?:amp|lt|gt|quot|apos);',expr):
            errors.append(f'{file.relative_to(root)}: HTML entity in WXML expression: {expr}')
    parser.feed(source)
    parser.close()
    errors += [f'{file.relative_to(root)}: {e}' for e in parser.errors]
    errors += [f'{file.relative_to(root)}: unclosed <{tag}> from line {line}' for tag,line in parser.stack]
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'PASS: {len(files)} WXML files have balanced element nesting; WeChat compilation still requires devtools')
