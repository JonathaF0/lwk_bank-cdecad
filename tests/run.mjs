// npm test (in tests/): syntax-checks every Lua file, then runs the Lua specs in a
// Lua VM (fengari) against the resource's pure modules. No FiveM needed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import luaparse from 'luaparse';
import fengari from 'fengari';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
process.chdir(ROOT);
const SKIP = new Set(['node_modules', 'html', 'web', 'brag-output', 'graphify-out', '.git']);
let failed = 0;

// 1. Syntax ---------------------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.lua')) out.push(p);
  }
  return out;
}
const files = walk(ROOT);
for (const f of files) {
  try {
    luaparse.parse(readFileSync(f, 'utf8'), { luaVersion: '5.3' });
  } catch (e) {
    failed++;
    console.error(`SYNTAX ${relative(ROOT, f)}: ${e.message}`);
  }
}
console.log(`syntax: ${files.length - failed}/${files.length} Lua files ok`);

// 2. Specs ------------------------------------------------------------------------
const { lua, lauxlib, lualib, to_luastring } = fengari;
const specs = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('_spec.lua'));
for (const spec of specs) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (path) => {
    const code = readFileSync(join(ROOT, path), 'utf8');
    if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring('@' + path)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(L, -1));
    }
  };
  try {
    run(join('tests', spec));
    console.log(`spec ${spec}: ok`);
  } catch (e) {
    failed++;
    console.error(`spec ${spec}: FAIL ${e.message}`);
  }
}

process.exit(failed ? 1 : 0);
