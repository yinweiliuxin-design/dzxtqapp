import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped helper and dictionary, not copies of them.
const common=readFileSync(new URL('../dist/common.js',import.meta.url),'utf8');
const from=common.indexOf('const DEVICE_ERROR_TEXT='),to=common.indexOf('function notify(',from);
assert.ok(from>=0&&to>from,'userError helper boundaries exist');
const helper=vm.createContext({});vm.runInContext(common.slice(from,to)+'\nglobalThis.userError=userError;',helper);
const locale={};vm.runInNewContext(readFileSync(new URL('../dist/i18n.js',import.meta.url),'utf8'),{window:locale});
const cjk=/[㐀-鿿]/;

test('browser device errors become localized messages while app messages pass through',()=>{
  const midi=Object.assign(new Error('Permission to use Web MIDI API was not granted.'),{name:'SecurityError'});
  assert.equal(helper.userError(midi),'没有获得权限。请在浏览器或系统设置中允许本站使用该设备后重试。');
  assert.equal(helper.userError(Object.assign(new Error('User cancelled the requestDevice() chooser.'),{name:'NotFoundError'})),'没有找到可用的设备，或已取消选择。');
  assert.equal(helper.userError(new Error('请先停止当前录制。')),'请先停止当前录制。');
  assert.equal(helper.userError(new TypeError('Cannot read properties of undefined')),'操作没有完成，请重试。');
  for(const lang of ['en','de'])assert.doesNotMatch(locale.SVLocale.text(helper.userError(midi),lang),cjk);
  assert.match(locale.SVLocale.text(helper.userError(midi),'ja'),/^権限がありません。/);
});

test('the cause after a full-width colon is translated together with its message',()=>{
  for(const lang of ['en','de']){
    const text=locale.SVLocale.text('麦克风调音未启动：没有找到可用的输入设备',lang);
    assert.doesNotMatch(text,cjk);assert.match(text,/: /);
  }
  assert.equal(locale.SVLocale.text('麦克风调音未启动：没有找到可用的输入设备','ja'),'マイク調弦を開始できませんでした。: 使用できる入力デバイスが見つかりません');
  assert.equal(locale.SVLocale.text('麦克风调音未启动：没有找到可用的输入设备','zh'),'麦克风调音未启动：没有找到可用的输入设备');
});
