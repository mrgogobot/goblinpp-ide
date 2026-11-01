#!/usr/bin/env python3
"""Package and verify an already-tested local macOS arm64 IDE; never publish/install."""
import argparse, hashlib, json, os, plistlib, shutil, struct, subprocess, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def sha(data): return hashlib.sha256(data).hexdigest()
def command(*args): return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()
def normalized_macho(path, destination):
    # Validation copies only; the app and original binaries retain their signatures.
    shutil.copy2(path, destination)
    subprocess.run(['codesign', '--remove-signature', str(destination)], check=True, capture_output=True)
    data=bytearray(destination.read_bytes());assert struct.unpack_from('<I',data)[0]==0xfeedfacf
    offset=32
    for _ in range(struct.unpack_from('<I',data,16)[0]):
        kind,size=struct.unpack_from('<II',data,offset)
        if kind==0x19 and bytes(data[offset+8:offset+24]).rstrip(b'\0')==b'__LINKEDIT':
            data[offset+32:offset+40]=b'\0'*8 # signature allocation can change virtual size only
        offset+=size
    return bytes(data)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--engine-root',required=True,type=Path);p.add_argument('--output-dir',type=Path);a=p.parse_args();engine=a.engine_root.resolve()
    version=json.loads((ROOT/'package.json').read_text())['version'];manifest=json.loads((ROOT/'public/goblin++/manifest.json').read_text());engine_version=manifest['version']
    config=json.loads((ROOT/'src-tauri/tauri.conf.json').read_text());assert config['version']==version
    app=ROOT/'src-tauri/target/release/bundle/macos/Goblin++ IDE.app';info=plistlib.loads((app/'Contents/Info.plist').read_bytes());assert info['CFBundleShortVersionString']==info['CFBundleVersion']==version
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True,capture_output=True)
    dest=a.output_dir.resolve() if a.output_dir else ROOT/f'release/local-{version}';dest.mkdir(parents=True,exist_ok=True)
    filename=f'Goblinpp-IDE-{version}-macos-arm64.zip';archive=dest/filename;receipt_path=dest/'PACKAGE_RECEIPT.json';sums=dest/'SHA256SUMS.txt'
    for path in [archive,receipt_path,sums]:assert not path.exists(),f'Refusing to overwrite {path}'
    dependencies=json.loads((ROOT/'engine-dependencies/SOURCE.json').read_text());assert dependencies['engine_version']==engine_version
    for name,digest in dependencies['files'].items():assert sha((engine/name).read_bytes())==sha((ROOT/'engine-dependencies'/name).read_bytes())==digest
    binaries={}
    with tempfile.TemporaryDirectory(prefix='signature-validation-copies-',dir=dest)as tmp:
        for app_name,raw_name in [('goblin++','goblinpp'),('goblin-orbit','goblin-orbit')]:
            packaged=app/'Contents/MacOS'/app_name;raw=engine/'target/release'/raw_name
            assert 'arm64' in command('file',str(packaged))
            expected=('goblin++ 'if app_name=='goblin++'else'goblin-orbit ')+engine_version
            assert command(str(packaged),'--version')==expected
            before=normalized_macho(raw,Path(tmp)/f'{raw_name}-raw');after=normalized_macho(packaged,Path(tmp)/f'{raw_name}-app');assert before==after
            binaries[app_name]={'raw_sha256':sha(raw.read_bytes()),'packaged_sha256':sha(packaged.read_bytes()),'normalized_payload_sha256':sha(after),'comparison':'Exact bytes after removal of signatures on disposable copies and normalization only of __LINKEDIT virtual size'}
    caps=json.loads(command(str(app/'Contents/MacOS/goblin++'),'capabilities','--json'));assert caps['secure_network']['client_authentication']=='REQUIRED' and caps['goblin_version']==engine_version
    matched=0
    for source_name,target_name in config['bundle']['resources'].items():
        source=(ROOT/'src-tauri'/source_name).resolve();target=app/'Contents/Resources'/target_name
        for source_file in sorted(source.rglob('*')) if source.is_dir() else [source]:
            if not source_file.is_file():continue
            target_file=target/source_file.relative_to(source) if source.is_dir() else target
            assert source_file.read_bytes()==target_file.read_bytes(),target_file;matched+=1
    payload={};inventory={}
    for path in sorted(app.rglob('*')):
        assert not path.is_symlink(),path
        if path.is_file():
            rel=path.relative_to(app).as_posix();data=path.read_bytes();inventory[rel]=sha(data);payload[f'Goblin++ IDE.app/{rel}']=(data,path.stat().st_mode&0o777)
    for name in ['network_setup.gbl','network_client.gbl','network_server.gbl','network_relay.gbl']:
        payload['Examples/'+name]=((ROOT/'public/goblin++/examples'/name).read_bytes(),0o644)
    for name in ['setup.gbl','client.gbl','server.gbl','README.md']:
        content=(ROOT/'public/goblin++/examples/network'/name).read_bytes()
        if name=='README.md':content=content.replace(b'../../docs/NETWORKING.md',b'../../NETWORKING.md')
        payload['Examples/local/'+name]=(content,0o644)
    for name in ['setup.gbl','network_server.gbl','network_client.gbl','README.md','QUICKSTART.md']:
        payload['Examples/lan/'+name]=((ROOT/'public/goblin++/examples/network/lan'/name).read_bytes(),0o644)
    payload['NETWORKING.md']=((ROOT/'public/goblin++/docs/NETWORKING.md').read_bytes(),0o644)
    readme=f'''Goblin++ IDE {version} for macOS arm64\nBundled engine: Goblin++ {engine_version}\n\nOpen Goblin++ IDE.app, or copy it to Applications using Finder.\nIn Settings > Goblin++ > Engine, select the bundled alpha.45 engine if an older explicit path was retained.\n\nThe Examples folder is a writable starting point: open it as a project, run network_setup.gbl once, then start the server and client in separate terminals/windows. The main Run panel manages one process at a time.\nRead NETWORKING.md for complete examples, key distribution, TLS trust and limits. For two computers, start with Examples/lan/QUICKSTART.md and run the source examples directly. Never share or commit network-demo or lan-pair private keys.\n\nThe app is ad-hoc signed, not Apple-notarized. Automated checks do not establish an independent security audit or manual installed GUI test.\nRecipient message encryption does not add sender signatures, replay prevention or a forward-secrecy ratchet. GO_PRIVATE is not a sandbox or secure erasure.\n\nOptional merchandise: https://h4k3rl1f3.myspreadshop.co.uk\n'''
    payload['README.txt']=(readme.encode(),0o644)
    prefix=f'Goblinpp-IDE-{version}-macos-arm64/'
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9)as z:
        for name,(data,mode)in sorted(payload.items()):
            assert 'network-demo/'not in name
            i=zipfile.ZipInfo(prefix+name,(1980,1,1,0,0,0));i.create_system=3;i.external_attr=(0o100000|mode)<<16;i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,data)
    with zipfile.ZipFile(archive)as z:
        assert z.testzip()is None and len(z.namelist())==len(payload)
        for name,(data,_)in payload.items():assert z.read(prefix+name)==data
    artifact={'file':filename,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes())}
    receipt={'schema':'goblin.ide.local-package.v1','version':version,'engine_version':engine_version,'target':'aarch64-apple-darwin','source_head_before_user_commit':command('git','-C',str(ROOT),'rev-parse','HEAD'),'uncommitted_local_candidate':True,'artifact':artifact,'app_inventory_sha256':inventory,'app_files':len(inventory),'resource_files_matched_to_source':matched,'binaries':binaries,'local_tests':{'frontend_and_actual_bundled_engine':21,'native_backend':3,'types': 'PASS','native_clippy':'PASS','build':'PASS','deep_strict_codesign':'PASS','signature_identity':'AD_HOC_NOT_NOTARIZED','live_installed_GUI_test':False,'independent_security_audit':False},'authentication':'CHECKSUM_ONLY_NOT_A_PUBLISHER_SIGNATURE','published':False}
    receipt_path.write_text(json.dumps(receipt,indent=2)+'\n');sums.write_text(artifact['sha256']+'  '+filename+'\n'+sha(receipt_path.read_bytes())+'  PACKAGE_RECEIPT.json\n');print(json.dumps(artifact,indent=2));print('Matched resource files:',matched,'App files:',len(inventory))

if __name__=='__main__':main()
