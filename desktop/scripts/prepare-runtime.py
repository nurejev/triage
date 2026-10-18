#!/usr/bin/env python3
"""Build isolated portable runtimes from pinned official distributions."""
import hashlib,json,pathlib,urllib.request,zipfile,tarfile,sys,shutil,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
LOCK=ROOT/'runtime-lock.json'
lock=json.loads(LOCK.read_text())
cache=ROOT/'.cache';cache.mkdir(exist_ok=True)
def download(item):
    target=cache/item['file']
    if not target.exists():
        print('Downloading '+item['file'],flush=True)
        with urllib.request.urlopen(urllib.request.Request(item['url'],headers={'User-Agent':'Limon-Triage-Builder'}),timeout=90) as r,open(str(target)+'.tmp','wb') as f: shutil.copyfileobj(r,f)
        os.replace(str(target)+'.tmp',target)
    digest=hashlib.sha256(target.read_bytes()).hexdigest()
    if item.get('sha256')!=digest: raise RuntimeError('SHA-256 mismatch: '+item['file'])
    return target

def expand(file,dest):
    dest.mkdir(parents=True,exist_ok=True)
    if str(file).endswith('.tar.gz'):
        with tarfile.open(file) as z:
            for entry in z.getmembers():
                target=(dest/entry.name).resolve()
                if not target.is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive path')
                if entry.issym() and not (target.parent/entry.linkname).resolve().is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive symlink')
                if entry.islnk() and not (dest/entry.linkname).resolve().is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive hardlink')
                if entry.isdev():raise RuntimeError('Archive device not allowed')
            z.extractall(dest)
    else:
        with zipfile.ZipFile(file) as z:
            for name in z.namelist():
                if not (dest/name).resolve().is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive path')
            z.extractall(dest)
def prune(output,platform):
    """Drop files pwsh 7 never loads for this platform (WP-04). Keep the list explicit and conservative."""
    mods=output/'modules';ps=output/'powershell'
    exo=mods/'ExchangeOnlineManagement'/lock['modules']['ExchangeOnlineManagement']['version']
    graph=mods/'Microsoft.Graph.Authentication'/lock['modules']['Microsoft.Graph.Authentication']['version']
    keep_rid={'darwin-arm64':{'osx-arm64'},'win32-x64':{'win-x64'}}[platform]
    victims=[exo/'netFramework',exo/'netCore'/'ref',ps/'Modules'/'PSReadLine',ps/'Modules'/'Microsoft.PowerShell.PSResourceGet']
    for rid_dir in [exo/'netCore'/'runtimes',graph/'Dependencies'/'runtimes']:
        if rid_dir.exists():victims+=[d for d in rid_dir.iterdir() if d.name not in keep_rid]
    if platform.startswith('darwin'):
        victims+=[graph/'Dependencies'/n for n in ('msalruntime.dll','msalruntime_x86.dll','msalruntime_arm64.dll')]
        victims+=[d for d in (exo/'netCore').glob('*.dll') if d.name in ('msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll')]
    victims+=list(output.rglob('*-Help.xml'))+list(output.rglob('*.dll-Help.xml'))+[d for d in output.rglob('en-US') if d.is_dir()]
    freed=0
    for v in victims:
        if not v.exists():continue
        freed+=sum(f.stat().st_size for f in v.rglob('*') if f.is_file()) if v.is_dir() else v.stat().st_size
        shutil.rmtree(v) if v.is_dir() else v.unlink()
    print('Pruned %.0f MB from %s'%(freed/1048576,output),flush=True)

platforms=[a for a in sys.argv[1:] if not a.startswith('--')] or ['darwin-arm64','win32-x64']
for platform in platforms:
    output=ROOT/'runtime'/platform
    if output.exists():shutil.rmtree(output)
    expand(download(lock['powershell'][platform]),output/'powershell')
    if platform.startswith('darwin'):(output/'powershell'/'pwsh').chmod(0o755)
    for name,item in lock['modules'].items():expand(download(item),output/'modules'/name/item['version'])
    if '--no-prune' not in sys.argv:prune(output,platform)
    (output/'runtime-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
    print('Ready: '+str(output),flush=True)
