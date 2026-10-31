/** Actual RunStore + actual bundled engine. Only the desktop IPC boundary is adapted to Node child pipes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const engine=process.env.GOBLIN_IDE_ENGINE!
const listeners:{out:((e:any)=>void)[],exit:((e:any)=>void)[]}={out:[],exit:[]}
const children=new Map<string,ReturnType<typeof spawn>>()
const launches:{id:string,args:string[],env:any}[]=[]
const writes:string[]=[]
const pending=new Set<Promise<unknown>>()
const bridge:any={
 editor:{tabs:[],activePath:null,save:async()=>{},saveAs:async()=>null,setFrozen:()=>{},setVerifyFailed:()=>{}},
 language:{engine:{path:engine,source:'test-bundled',version:'0.1.0-alpha.43'},analysisByPath:{}},
 project:{root:'',refresh:async()=>{}},
 settings:{autoSaveBeforeRun:true,inlineRustHashes:{},runsRoot:'runs',autoVerify:true},
 fs:{
  readText:(p:string)=>fs.readFile(p,'utf8'),exists:async(p:string)=>{try{await fs.access(p);return true}catch{return false}},
  stat:async(p:string)=>{try{const s=await fs.stat(p);return{exists:true,is_dir:s.isDirectory(),size:s.size,modified_ms:s.mtimeMs}}catch{return{exists:false,is_dir:false,size:0,modified_ms:0}}},
  listDir:async(p:string)=>Promise.all((await fs.readdir(p,{withFileTypes:true})).map(async e=>({name:e.name,path:path.join(p,e.name),is_dir:e.isDirectory(),size:0,modified_ms:0}))),
 },
 proc:{
  onOutput:async(fn:any)=>{listeners.out.push(fn);return()=>{}},onExit:async(fn:any)=>{listeners.exit.push(fn);return()=>{}},
  spawn:async(id:string,program:string,args:string[],cwd:string,env:any)=>{
   launches.push({id,args,env});const child=spawn(program,args,{cwd,env:{...process.env,...env},stdio:'pipe'});children.set(id,child)
   for(const stream of ['stdout','stderr']as const){child[stream]!.setEncoding('utf8');child[stream]!.on('data',(data:string)=>{ // Force arbitrary control-frame chunk boundaries.
    const parts=stream==='stderr'?[data.slice(0,3),data.slice(3,11),data.slice(11)]:[data]
    for(const part of parts)if(part)for(const fn of listeners.out)fn({id,stream,data:part})
   })}
   child.on('close',(code,signal)=>{children.delete(id);for(const fn of listeners.exit)fn({id,code,signal:null})});return child.pid
  },
  write:async(id:string,text:string)=>{writes.push(text);const c=children.get(id);if(!c)throw new Error('closed');c.stdin!.write(text)},
  closeStdin:async(id:string)=>{children.get(id)?.stdin?.end()},kill:async(id:string)=>{children.get(id)?.stdin?.end();children.get(id)?.kill()},
  run:async(program:string,args:string[],cwd:string)=>{
   const start=Date.now();return await new Promise((resolve,reject)=>{const c=spawn(program,args,{cwd,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';c.stdout.setEncoding('utf8');c.stderr.setEncoding('utf8');c.stdout.on('data',s=>stdout+=s);c.stderr.on('data',s=>stderr+=s);c.on('error',reject);c.on('close',code=>resolve({code,stdout,stderr,duration_ms:Date.now()-start}))})
  },
 },
}
;(globalThis as any).__IDE_TEST_BRIDGE__=bridge
const {useRunStore}=await import('../src/stores/runStore')
const {useDialogStore}=await import('../src/stores/dialogStore')
const key='public IDE integration passphrase'
function fixture(content:string){return fs.mkdtemp(path.join(os.tmpdir(),'goblin-ide-public-test-')).then(async dir=>{
 const file=path.join(dir,'test.gbl');await fs.writeFile(file,content);bridge.project.root=dir;bridge.editor.tabs=[{path:file,name:'test.gbl',content,savedContent:content}];bridge.editor.activePath=file
 useRunStore.setState({running:false,currentProcId:null,awaitingSecret:false,history:[],freezeLog:[],output:[],lastRun:null});return{dir,file}
})}
async function answerDialogs(answers:(string|null)[],run:()=>Promise<any>){
 const stop=useDialogStore.subscribe(s=>{const d=s.queue[0];if(!d)return;assert(d.secret,'Secret requests must use a masked dialog');const answer=answers.shift();assert.notEqual(answer,undefined);queueMicrotask(()=>useDialogStore.getState().close(d.id,answer===null?{button:'cancel'}:{button:'ok',value:answer!}))})
 try{const result=await run();assert.equal(answers.length,0);return result}finally{stop()}
}

test('real alpha.43 RunStore encryption/decryption masks responses and creates no scientific evidence', {timeout:120000},async()=>{
 const {dir,file}=await fixture('GO_PRIVATE\nkey=input_secret("Passphrase: ")\nencrypt_text("public IDE message",key,"message.age")\ndecrypt_file("message.age",key,"restored.txt")\nprint(read_text("restored.txt"))\n')
 try{
  const before=writes.length
  const record=await answerDialogs([key],()=>useRunStore.getState().run('run',{file,silent:true}));assert.equal(record?.status,'PASS');assert.equal(record?.profile,'GO_PRIVATE');assert.equal(record?.runDir,null);assert.equal(record?.receipt,null)
  const output=useRunStore.getState().output.map(l=>l.text).join('\n');assert(!output.includes(key));assert(output.includes('public IDE message'));assert(!output.includes('GOBLIN_SECRET_PROMPT_V1'))
  assert.deepEqual(writes.slice(before),[key+'\n']);assert(!launches.at(-1)!.args.includes('--runs-root'));assert.equal(launches.at(-1)!.env.GOBLIN_SECRET_PROMPT_PROTOCOL,'hex-v1')
  assert.equal(await fs.readFile(path.join(dir,'restored.txt'),'utf8'),'public IDE message');assert.deepEqual((await fs.readdir(dir)).sort(),['message.age','restored.txt','test.gbl'])
  assert.equal(useRunStore.getState().freezeLog.length,0);assert.equal(useDialogStore.getState().queue.length,0)
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
test('real compiled private script uses the same masked IDE protocol', {timeout:600000},async()=>{
 const {dir,file}=await fixture('GO_PRIVATE\nkey=input_secret("Passphrase: ")\nencrypt_text("public IDE message",key,"message.age")\ndecrypt_file("message.age",key,"restored.txt")\nprint(read_text("restored.txt"))\n')
 try{
  const before=writes.length
  const record=await answerDialogs([key],()=>useRunStore.getState().run('compile',{file,silent:true}));assert.equal(record?.status,'PASS');assert.equal(record?.profile,'GO_PRIVATE');assert.equal(record?.runDir,null);assert.equal(record?.receipt,null)
  const output=useRunStore.getState().output.map(l=>l.text).join('\n');assert(!output.includes(key));assert(output.includes('public IDE message'));assert(!output.includes('GOBLIN_SECRET_PROMPT_V1'))
  assert.deepEqual(writes.slice(before),[key+'\n']);assert(!launches.at(-1)!.args.includes('--runs-root'));assert.equal(launches.at(-1)!.env.GOBLIN_SECRET_PROMPT_PROTOCOL,'hex-v1')
  assert.equal(await fs.readFile(path.join(dir,'restored.txt'),'utf8'),'public IDE message');assert.deepEqual((await fs.readdir(dir)).sort(),['message.age','restored.txt','test.gbl'])
  assert.equal(useRunStore.getState().freezeLog.length,0);assert.equal(useDialogStore.getState().queue.length,0)
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
test('cancelled masked input closes stdin without echoing or creating an output',async()=>{
 const {dir,file}=await fixture('GO_PRIVATE\nkey=input_secret("Passphrase: ")\nencrypt_text("public",key,"must-not-exist.age")\n')
 try{const r=await answerDialogs([null],()=>useRunStore.getState().run('run',{file,silent:true}));assert.notEqual(r?.status,'PASS');assert(!await bridge.fs.exists(path.join(dir,'must-not-exist.age')));assert.equal(useDialogStore.getState().queue.length,0)}finally{await fs.rm(dir,{recursive:true,force:true})}
})
test('ordinary science runs still load and verify the real receipt',async()=>{
 bridge.settings.runsRoot='runs';const {dir,file}=await fixture('GO_PARANOID\nx=2\nprint("science = {x}")\nseal x\n')
 try{const r=await useRunStore.getState().run('run',{file,silent:true});assert.equal(r?.status,'PASS');assert(r?.runDir);assert.equal(r?.receipt?.sealed_artifacts?.length,1);await useRunStore.getState().verifyRun(r!.runDir!);assert.equal(useRunStore.getState().lastRun?.verify?.verified,true);await new Promise(r=>setTimeout(r,100))}finally{await fs.rm(dir,{recursive:true,force:true})}
})
test('an older configured engine is refused before a private source is launched',async()=>{
 const {dir,file}=await fixture('GO_PRIVATE\nkey=input_secret()\n');const original=bridge.proc.run;const count=launches.length
 bridge.proc.run=async()=>({code:0,stdout:'{}',stderr:'',duration_ms:0})
 try{assert.equal(await useRunStore.getState().run('run',{file,silent:true}),null);assert.equal(launches.length,count);assert.deepEqual(await fs.readdir(dir),['test.gbl'])}finally{bridge.proc.run=original;await fs.rm(dir,{recursive:true,force:true})}
})
test('ordinary stdin cannot echo a response while a secret dialog is active',async()=>{
 const before=writes.length;useRunStore.setState({currentProcId:'public-fake',awaitingSecret:true})
 await useRunStore.getState().sendInput('public should not be echoed');assert.equal(writes.length,before);assert(!useRunStore.getState().output.some(l=>l.text==='public should not be echoed'));useRunStore.setState({currentProcId:null,awaitingSecret:false})
})

test('printed receipt-looking text in a private run never opens an unrelated receipt',async()=>{
 const {dir,file}=await fixture('GO_PRIVATE\nprint("public fixture")\n');const original=bridge.proc.spawn;const read=bridge.fs.readText;const reads:string[]=[]
 bridge.fs.readText=async(p:string)=>{reads.push(p);return read(p)}
 bridge.proc.spawn=async(id:string)=>{queueMicrotask(()=>{for(const fn of listeners.out)fn({id,stream:'stdout',data:'RUN_DIR=/unrelated\nRECEIPT_CORE_SHA256=not-evidence\nRUN_STATUS=PASS\n'});for(const fn of listeners.exit)fn({id,code:0,signal:null})});return 0}
 try{const r=await useRunStore.getState().run('run',{file,silent:true});assert.equal(r?.runDir,null);assert.equal(r?.receipt,null);assert.equal(r?.summary.RECEIPT_CORE_SHA256,undefined);assert(!reads.some(p=>p.includes('/unrelated')))}finally{bridge.proc.spawn=original;bridge.fs.readText=read;await fs.rm(dir,{recursive:true,force:true})}
})
