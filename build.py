from pathlib import Path
import base64
import gzip
import re

source = Path('payload1.js').read_text(encoding='utf-8')
parts = re.findall(r'\+\"([A-Za-z0-9+/=]+)\"', source)
if not parts:
    raise SystemExit('Payload Lion Dynasty introuvable dans payload1.js')

payload = ''.join(parts)
html = gzip.decompress(base64.b64decode(payload)).decode('utf-8')

out = Path('dist')
out.mkdir(exist_ok=True)
(out / 'index.html').write_text(html, encoding='utf-8')
print(f'Lion Dynasty: index.html généré ({len(html)} caractères)')
