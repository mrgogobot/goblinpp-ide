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
names.update(x['spelling'] for x in spec['functions'] if x['spelling'].startswith(('net_','e2e_')))
def load(name):return json.loads((public/name).read_text())
def save(name,data):(public/name).write_text(json.dumps(data,indent=1,ensure_ascii=False)+'\n')
f=load('functions/registry.json');f['runtime']=f'goblin++ {v}';f['functions']=[x for x in f['functions']if x['name']not in names]
for x in spec['functions']:
 if x['spelling']in names:f['functions'].append(dict(name=x['spelling'],domain='Secure Networking'if x['spelling'].startswith('net_')else'Recipient Encryption'if x['spelling'].startswith('e2e_')else'Confidential Files'if x['spelling']not in {'str_b64','str_to_b64','str_from_b64'}else'Strings',signature=re.sub(r'\$\{\d+:([^}]+)\}',r'\1',x['snippet']),description=x['detail'],snippet=x['snippet'],see='NETWORKING.md'if x['spelling'].startswith(('net_','e2e_'))else'PRIVATE_FUNCTIONS.md',arrayMath=False,legacy=False))
f['statements']=[x for x in f['statements']if x['name']!='GO_PRIVATE'];x=next(x for x in spec['statements']if x['spelling']=='GO_PRIVATE');f['statements'].append(dict(name='GO_PRIVATE',kind='directive',description=x['detail'],snippet='GO_PRIVATE'));save('functions/registry.json',f)
g=load('grammar/goblinpp.json');g['source']=f'vscode/syntaxes/goblinpp.tmLanguage.json ({v})'
for field,items in [('directives',['GO_PRIVATE']),('builtins',sorted(names))]:
 for name in items:
  if name not in g['tokenCategories'][field]:g['tokenCategories'][field].append(name)
save('grammar/goblinpp.json',g)
m=load('manifest.json');m['version']=v;m['minIDEVersion']='0.2.3'
if'GO_PRIVATE'not in m['profiles']:m['profiles'].append('GO_PRIVATE')
for name in ['PRIVATE_FUNCTIONS.md','ENCRYPTION.md','NETWORKING.md']:
 shutil.copy2(e/'docs'/name,public/'docs'/name)
 if name not in m['docsIndex']:m['docsIndex'].append(name)
save('manifest.json',m)
i=load('examples/index.json')
for name in ['private_encryption.gbl','base64_text.gbl','network_setup.gbl','network_client.gbl','network_server.gbl','network_relay.gbl']:
 shutil.copy2(e/'examples'/name,public/'examples'/name)
 if name not in i['files']:i['files'].append(name)
for name in ['setup.gbl','client.gbl','server.gbl','README.md']:
 (public/'examples/network').mkdir(parents=True,exist_ok=True)
 shutil.copy2(e/'examples/network'/name,public/'examples/network'/name)
 entry='network/'+name
 if name.endswith('.gbl') and entry not in i['files']:i['files'].append(entry)
for name in ['setup.gbl','network_server.gbl','network_client.gbl','README.md','QUICKSTART.md']:
 (public/'examples/network/lan').mkdir(parents=True,exist_ok=True)
 shutil.copy2(e/'examples/network/lan'/name,public/'examples/network/lan'/name)
 entry='network/lan/'+name
 if name.endswith('.gbl') and entry not in i['files']:i['files'].append(entry)
# Adapt runtime-bundle setup instructions to the IDE's writable example export.
local_readme=public/'examples/network/README.md'
s=local_readme.read_text().replace('**0.1.0-alpha.44**','**0.1.0-alpha.44 or newer**').replace('From the extracted alpha.44 bundle:', 'From this writable local example folder, with Goblin++ on PATH:').replace('cd examples/network\n','').replace('same `examples/network` folder','same local example folder').replace('bundled alpha.44 engine','bundled alpha.45 engine')
local_readme.write_text(s)
quickstart=public/'examples/network/lan/QUICKSTART.md'
s=quickstart.read_text().replace('From the extracted runtime bundle, install and create credentials:', 'Open this writable LAN example folder as an IDE project and select the bundled alpha.45 engine. Run `setup.gbl` with the IDE Play button, or use an installed alpha.45 command-line runtime:').replace('./install.sh --prefix "$HOME/.local"\nrehash\ncd examples/network/lan\n','').replace('Use an alpha.44-or-newer Goblin++ runtime. With this source bundle, install.sh\nbuilds the Linux executable from locked source when run on Linux; Rust 1.92.0\nmust already be available. The supplied Mac binary does not run on Linux.', 'Use an alpha.44-or-newer Goblin++ runtime on the client. This IDE ZIP contains a macOS arm64 app and source examples; it does not contain install.sh or a Linux executable. For Linux, obtain the separate full Goblin++ source/runtime bundle and follow its build instructions (Rust 1.92.0).')
quickstart.write_text(s)
lan_readme=public/'examples/network/lan/README.md'
s=lan_readme.read_text()
lan_readme.write_text('> This IDE package supplies source examples, not separate compiled network programs. Follow QUICKSTART.md; standalone-kit commands below describe an optional separate kit and are not needed here.\n\n'+s)
save('examples/index.json',i)
sn=load('snippets/goblinpp.json')
for x in spec['functions']:
 if x['spelling']in names:sn[x['spelling']]=dict(prefix=x['spelling'],body=[x['snippet']],description=x['detail'])
sn['GO_PRIVATE']=dict(prefix='GO_PRIVATE',body=['GO_PRIVATE'],description='Confidential script, no scientific receipt.');save('snippets/goblinpp.json',sn)
shutil.copy2(e/'README.md',public/'README.md');shutil.copy2(e/'RELEASE_NOTES.md',public/'CHANGELOG.md')
shutil.copy2(e/'THIRD_PARTY_NOTICES.md',public/'THIRD_PARTY_NOTICES.md');shutil.copytree(e/'third-party',public/'third-party',dirs_exist_ok=True)
dependencies=root/'engine-dependencies';dependencies.mkdir(exist_ok=True)
for name in ['Cargo.toml','Cargo.lock']:shutil.copy2(e/name,dependencies/name)
(dependencies/'SOURCE.json').write_text(json.dumps({'engine_version':v,'purpose':'Dependency cache preparation only; not an engine source distribution','files':{name:hashlib.sha256((dependencies/name).read_bytes()).hexdigest()for name in ['Cargo.toml','Cargo.lock']}},indent=2)+'\n')
proof={'engine':v,'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in(root/'src-tauri/binaries').iterdir()if p.is_file()}}
(root/'release/validation/ENGINE_SYNC.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2))
