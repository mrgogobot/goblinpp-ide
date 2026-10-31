import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vite/package.json'));
const { build }=viteRequire('esbuild');
await mkdir('release/tests',{recursive:true});
const mocks={
 'platform/tauri':`const b=globalThis.__IDE_TEST_BRIDGE__;export const isTauri=()=>true;export const fs=b.fs;export const proc=b.proc;export const env={};export const settingsApi={};`,
 'stores/editorStore':`export const useEditorStore={getState:()=>globalThis.__IDE_TEST_BRIDGE__.editor};`,
 'stores/languageStore':`export const useLanguageStore={getState:()=>globalThis.__IDE_TEST_BRIDGE__.language};`,
 'stores/projectStore':`export const useProjectStore={getState:()=>globalThis.__IDE_TEST_BRIDGE__.project};`,
 'stores/settingsStore':`export const getSettings=()=>globalThis.__IDE_TEST_BRIDGE__.settings;export const useSettingsStore={getState:()=>({update:()=>{}})};`,
};
for(const [entry,target,mocking]of [['tests/contracts.test.ts','contracts',false],['tests/integration.test.ts','integration',true]]){
 await build({entryPoints:[entry],outfile:`release/tests/${target}.mjs`,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',plugins:mocking?[{name:'test-adapters',setup(b){b.onResolve({filter:/.*/},args=>{for(const [key]of Object.entries(mocks))if(path.resolve(args.resolveDir,args.path).endsWith(key))return{path:key,namespace:'adapter'};return null});b.onLoad({filter:/.*/,namespace:'adapter'},args=>({contents:mocks[args.path],loader:'js'}))}}]:[]});
}
const result=spawnSync(process.execPath,['--test','release/tests/contracts.mjs','release/tests/integration.mjs'],{stdio:'inherit',env:{...process.env,GOBLIN_IDE_ENGINE:process.env.GOBLIN_IDE_ENGINE||path.resolve('src-tauri/binaries/goblin++-aarch64-apple-darwin')}});
process.exitCode=result.status??1;
