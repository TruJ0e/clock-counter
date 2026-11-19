import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {applyAlwaysOnTop}=require('../src/always-on-top.cjs');

function windowMock(initial=false) {
  let current=initial;
  const calls=[];
  const win={
    calls,
    setVisibleOnAllWorkspaces(...args){calls.push(['spaces',...args]);},
    setAlwaysOnTop(...args){calls.push(['top',...args]);current=args[0];},
    isAlwaysOnTop(){return current;}
  };
  return win;
}

test('macOS enables all Spaces, full-screen visibility, then floating window level',()=>{
  const win=windowMock(false);
  assert.equal(applyAlwaysOnTop(win,true,'darwin'),true);
  assert.deepEqual(win.calls,[
    ['spaces',true,{visibleOnFullScreen:true}],
    ['top',true,'floating']
  ]);
});
test('macOS disables both the workspace and window-level options',()=>{
  const win=windowMock(true);
  assert.equal(applyAlwaysOnTop(win,false,'darwin'),false);
  assert.deepEqual(win.calls,[
    ['spaces',false,{visibleOnFullScreen:false}],
    ['top',false,'floating']
  ]);
});
test('Windows never invokes macOS-only workspace API',()=>{
  const win=windowMock();
  assert.equal(applyAlwaysOnTop(win,true,'win32'),true);
  assert.deepEqual(win.calls,[['top',true]]);
});
test('Linux keeps current floating-level logic without changing Spaces',()=>{
  const win=windowMock(true);
  assert.equal(applyAlwaysOnTop(win,false,'linux'),false);
  assert.deepEqual(win.calls,[['top',false]]);
});
test('only the explicit boolean true enables always-on-top',()=>{
  const win=windowMock();
  assert.equal(applyAlwaysOnTop(win,'false','darwin'),false);
  assert.deepEqual(win.calls[0],['spaces',false,{visibleOnFullScreen:false}]);
});
