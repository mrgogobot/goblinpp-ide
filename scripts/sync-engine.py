#!/usr/bin/env python3
"""Offline refresh from an explicitly chosen, reviewed Goblin++ checkout."""
from pathlib import Path
import argparse,json,shutil,subprocess,tomllib,hashlib,re
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--engine-root',type=Path,required=True);a=p.parse_args();e=a.engine_root.resolve()
v=tomllib.loads((e/'Cargo.toml').read_text())['package']['version']
assert subprocess.check_output([str(e/'target/release/goblinpp'),'--version'],text=True).strip()==f'goblin++ {v}'
b=root/'release/validation/original-sidecars';b.mkdir(parents=True,exist_ok=True)
for target,source in [('goblin++','goblinpp'),('goblin-orbit','goblin-orbit')]:
 dest=root/f'src-tauri/binaries/{target}-aarch64-apple-darwin'
 if not(b/dest.name).exists():shutil.copy2(dest,b/dest.name)
 shutil.copy2(e/f'target/release/{source}',dest);dest.chmod(0o755)
public=root/'public/goblin++';spec=json.loads((e/'vscode/spec/rust-alpha33-editor.json').read_text());names={'input_secret','encrypt_text','encrypt_file','decrypt_text','decrypt_file','read_text','display_file','str_b64','str_to_b64','str_from_b64'}
def load(name):return json.loads((public/name).read_text())
def save(name,data):(public/name).write_text(json.dumps(data,indent=1,ensure_ascii=False)+'\n')
f=load('functions/registry.json');f['runtime']=f'goblin++ {v}';f['functions']=[x for x in f['functions']if x['name']not in names]
for x in spec['functions']:
 if x['spelling']in names:f['functions'].append(dict(name=x['spelling'],domain='Confidential Files'if x['spelling']not in {'str_b64','str_to_b64','str_from_b64'}else'Strings',signature=re.sub(r'\$\{\d+:([^}]+)\}',r'\1',x['snippet']),description=x['detail'],snippet=x['snippet'],see='PRIVATE_FUNCTIONS.md',arrayMath=False,legacy=False))
f['statements']=[x for x in f['statements']if x['name']!='GO_PRIVATE'];x=next(x for x in spec['statements']if x['spelling']=='GO_PRIVATE');f['statements'].append(dict(name='GO_PRIVATE',kind='directive',description=x['detail'],snippet='GO_PRIVATE'));save('functions/registry.json',f)
g=load('grammar/goblinpp.json');g['source']='vscode/syntaxes/goblinpp.tmLanguage.json (alpha.43)'
for field,items in [('directives',['GO_PRIVATE']),('builtins',sorted(names))]:
 for name in items:
  if name not in g['tokenCategories'][field]:g['tokenCategories'][field].append(name)
save('grammar/goblinpp.json',g)
m=load('manifest.json');m['version']=v;m['minIDEVersion']='0.2.1'
if'GO_PRIVATE'not in m['profiles']:m['profiles'].append('GO_PRIVATE')
for name in ['PRIVATE_FUNCTIONS.md','ENCRYPTION.md']:
 shutil.copy2(e/'docs'/name,public/'docs'/name)
 if name not in m['docsIndex']:m['docsIndex'].append(name)
save('manifest.json',m)
i=load('examples/index.json')
for name in ['private_encryption.gbl','base64_text.gbl']:
 shutil.copy2(e/'examples'/name,public/'examples'/name)
 if name not in i['files']:i['files'].append(name)
save('examples/index.json',i)
sn=load('snippets/goblinpp.json')
for x in spec['functions']:
 if x['spelling']in names:sn[x['spelling']]=dict(prefix=x['spelling'],body=[x['snippet']],description=x['detail'])
sn['GO_PRIVATE']=dict(prefix='GO_PRIVATE',body=['GO_PRIVATE'],description='Confidential script, no scientific receipt.');save('snippets/goblinpp.json',sn)
shutil.copy2(e/'THIRD_PARTY_NOTICES.md',public/'THIRD_PARTY_NOTICES.md');shutil.copytree(e/'third-party',public/'third-party',dirs_exist_ok=True)
proof={'engine':v,'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in(root/'src-tauri/binaries').iterdir()if p.is_file()}}
(root/'release/validation/ENGINE_SYNC.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2))
