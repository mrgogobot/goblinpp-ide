import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SecretFrames, decodeSecretPrompt, isPrivateSource, secretValidation, SECRET_PREFIX } from '../src/run/secretInput'
import { profileOf, parseSummary, statusFromSummary, parseGoblinError } from '../src/run/cli'
import { parseDocument, buildRegistry } from '../src/language/parser'
import { assembleContext } from '../src/ai/context'
import { Dialog } from '../src/components/ModalDialogs'

const frame=SECRET_PREFIX+Buffer.from('Passphrase: π').toString('hex')+'\n'
test('secret frames survive every split and never become ordinary console text',()=>{
 for(let split=1;split<frame.length;split++){
  const p=new SecretFrames();const events=[...p.push(frame.slice(0,split)),...p.push(frame.slice(split))];
  assert.deepEqual(events,[{kind:'secret',prompt:'Passphrase: π'}]);
 }
})
test('secret parser preserves ordinary input, rejects malformed/oversized/invalid UTF8/control frames',()=>{
 const p=new SecretFrames();assert.deepEqual(p.push('Name: '),[{kind:'text',text:'Name: '}]);
 for(const hex of ['ff','0a','00','xyz','61'.repeat(4097)])assert.equal(decodeSecretPrompt(SECRET_PREFIX+hex),null)
 assert.deepEqual(new SecretFrames().push(SECRET_PREFIX+'ff\n'),[{kind:'invalid'}])
 assert.deepEqual(new SecretFrames().push(SECRET_PREFIX+'6',true),[{kind:'invalid'}])
 assert.notEqual(secretValidation(''),null)
 assert.equal(secretValidation('  public password  '),null)
})
test('GO_PRIVATE is identified without turning historical assignments into a directive',()=>{
 assert(isPrivateSource('# comment\nGO_PRIVATE # explicit\n'))
 assert(!isPrivateSource('GO_PRIVATE = 2\n'))
 assert(!isPrivateSource('print("GO_PRIVATE")'))
 assert.equal(profileOf(null,'GO_PRIVATE\n'),'GO_PRIVATE')
 const r=parseDocument('GO_PRIVATE\nkey=input_secret()\n',buildRegistry([]));assert.equal(r.profile,'GO_PRIVATE');assert.equal(parseDocument('GO_PRIVATE = 2\n',buildRegistry([])).profile,'everyday')
})
test('a printed PASS cannot override failed or unknown process status',()=>{
 assert.equal(statusFromSummary({RUN_STATUS:'PASS'},1,''),'FAIL')
 assert.equal(statusFromSummary({RUN_STATUS:'PASS'},null,''),'UNKNOWN')
 assert.equal(statusFromSummary({RUN_STATUS:'PASS'},0,''),'PASS')
 assert.equal(parseSummary('RUN_STATUS=PASS\nRUN_DIR=/example').RUN_DIR,'/example')
 assert.equal(parseGoblinError('GOBLIN ERROR G902\n\nPrivate execution failed.')?.code,'G902')
})
test('masked dialogs render password fields with saved values disabled',()=>{
 const html=renderToStaticMarkup(React.createElement(Dialog,{d:{id:1,kind:'prompt',title:'Secret',secret:true,buttons:[{id:'ok',label:'OK',primary:true}],resolve:()=>{}}}))
 assert(html.includes('type="password"'));assert(html.includes('autoComplete="off"'));assert(!html.includes('example password'))
})
test('private files are excluded from automatic AI context',()=>{
 const context=assembleContext({userPrompt:'Explain encryption',contextFree:false,budgetChars:5000,activeFile:{path:'private.gbl',content:'GO_PRIVATE\nmessage="public privacy fixture"'},diagnostics:['fixture']})
 assert.deepEqual(context.sources,['user prompt']);assert(!context.user.includes('public privacy fixture'))
 const publicContext=assembleContext({userPrompt:'Question',contextFree:false,budgetChars:5000,openFiles:[{path:'p.gbl',snippet:'GO_PRIVATE\nsecret="fixture"'}]})
 assert(!publicContext.user.includes('fixture'))
})
test('bundled grammar, help and sidecar contract expose alpha.44 private code',()=>{
 const m=JSON.parse(fs.readFileSync('public/goblin++/manifest.json','utf8'));assert.equal(m.version,'0.1.0-alpha.45');assert(m.profiles.includes('GO_PRIVATE'))
 const reg=JSON.parse(fs.readFileSync('public/goblin++/functions/registry.json','utf8'))
 for(const name of ['input_secret','encrypt_text','encrypt_file','decrypt_text','decrypt_file','read_text','display_file','str_b64'])assert(reg.functions.some((f:{name:string})=>f.name===name),name)
 assert(fs.existsSync('public/goblin++/docs/PRIVATE_FUNCTIONS.md'))
})

 test('network capability guard distinguishes code from quoted text and comments', async()=>{
 const {missingNetworkFunctions,NETWORK_FUNCTIONS}=await import('../src/run/privateCapabilities')
 assert.deepEqual(missingNetworkFunctions('GO_PRIVATE\n# net_connect()\nprint("e2e_encrypt(x,y)")\n',[]),[])
 assert.deepEqual(missingNetworkFunctions('GO_PRIVATE\nc = net_connect("x","x","x","x","x")\n',['input_secret']),['net_connect'])
 assert.deepEqual(missingNetworkFunctions('GO_PRIVATE\nx = e2e_encrypt("x","y")',NETWORK_FUNCTIONS),[])
 })
 test('alpha.44 networking vocabulary, guide and four examples are bundled',()=>{
 const reg=JSON.parse(fs.readFileSync('public/goblin++/functions/registry.json','utf8'))
 for(const name of ['net_connect','net_listen','net_peer_sha256','e2e_keygen','e2e_encrypt','e2e_decrypt'])assert(reg.functions.some((f:{name:string})=>f.name===name),name)
 for(const name of ['network_setup.gbl','network_client.gbl','network_server.gbl','network_relay.gbl'])assert(fs.existsSync('public/goblin++/examples/'+name))
 assert(fs.existsSync('public/goblin++/docs/NETWORKING.md'))
 })

 test('private key files and credential folders are excluded from automatic AI context',()=>{
 for(const [path,content] of [['recipient.key','fixture'],['server.pem','fixture'],['network-demo/recipient.txt','fixture'],['lan-pair/client/ca.pem','fixture'],['unknown.txt','AGE-SECRET-KEY-publicfixture'],['key.txt','-----BEGIN PRIVATE KEY-----']]) {
 const context=assembleContext({userPrompt:'Explain networking',contextFree:false,budgetChars:5000,activeFile:{path,content}})
 assert.deepEqual(context.sources,['user prompt'])
 const open=assembleContext({userPrompt:'Question',contextFree:false,budgetChars:5000,openFiles:[{path,snippet:content}]})
 assert(!open.user.includes('fixture'));assert(!open.sources.includes('open files'))
 }
 })

 test('LAN pair provisioning and split-role examples are bundled',()=>{
 const reg=JSON.parse(fs.readFileSync('public/goblin++/functions/registry.json','utf8'))
 assert(reg.functions.some((f:{name:string})=>f.name==='net_pair_credentials'))
 for(const name of ['setup.gbl','network_server.gbl','network_client.gbl','README.md','QUICKSTART.md'])assert(fs.existsSync('public/goblin++/examples/network/lan/'+name))
 for(const name of ['setup.gbl','client.gbl','server.gbl','README.md'])assert(fs.existsSync('public/goblin++/examples/network/'+name))
 })
