(function (nonce) {
  'use strict';
  if (window.__silvioExportCleanup) window.__silvioExportCleanup();
  var port = null, busy = false, pending = null, disposed = false;
  var originalClick = HTMLAnchorElement.prototype.click;
  var CHUNK = 48 * 1024, LIMIT = 100 * 1024 * 1024;
  function notice(message) {
    var el = document.createElement('div');
    el.textContent = message;
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;z-index:2147483647;left:16px;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));padding:14px 18px;background:#292d2a;color:white;border-radius:14px;font:14px/1.5 system-ui;box-shadow:0 4px 24px #0003;pointer-events:none;';
    document.documentElement.appendChild(el);
    setTimeout(function () { el.remove(); }, 5000);
  }
  function request(message) {
    return new Promise(function (resolve, reject) {
      if (!port || disposed || pending) return reject(new Error('保存通道暂不可用，请重新打开页面后重试。'));
      message.nonce = nonce;
      var timer = setTimeout(function () {
        if (pending) { pending = null; reject(new Error('导出等待超时，请重试。')); }
      }, 45000);
      pending = { id: message.id, resolve: resolve, reject: reject, timer: timer };
      port.postMessage(JSON.stringify(message));
    });
  }
  function handshake(event) {
    if (disposed || port || !event.ports || event.ports.length !== 1) return;
    var message;
    try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch (_) { return; }
    if (!message || message.type !== 'silvio-export-channel' || message.nonce !== nonce) return;
    port = event.ports[0];
    window.removeEventListener('message', handshake);
    port.onmessage = function (event) {
      var result;
      try { result = JSON.parse(event.data); } catch (_) { return; }
      if (!result || result.nonce !== nonce) return;
      if (result.status === 'saved') { notice('已保存到你选择的位置。'); return; }
      if (result.status === 'cancelled') { notice('已取消保存，可重新导出。'); return; }
      if (pending && pending.id === result.id) {
        var current = pending; pending = null; clearTimeout(current.timer);
        if (result.status === 'error') current.reject(new Error(result.message || '导出失败，请重试。'));
        else current.resolve(result);
      } else if (result.status === 'error') notice(result.message || '保存失败，请重试。');
    };
    port.start();
  }
  function base64(bytes) {
    var text = '';
    for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return btoa(text);
  }
  function readChunk(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { reject(new Error('无法读取下载内容。')); };
      reader.readAsArrayBuffer(blob);
    });
  }
  async function download(anchor) {
    if (busy) { notice('上一份文件正在导出，请稍后再试。'); return; }
    busy = true;
    var id = 'export_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    try {
      if (!port) throw new Error('保存通道还未准备好，请稍后重试。');
      var response = await fetch(anchor.href);
      if (!response.ok) throw new Error('无法读取下载内容。');
      var blob = await response.blob();
      if (blob.size > LIMIT) throw new Error('这份文件超过测试版 100 MB 导出上限，请分段录制后重试。');
      await request({ type: 'begin', id: id, name: anchor.download || 'Silvio-export', mime: blob.type, total: blob.size });
      for (var offset = 0; offset < blob.size; offset += CHUNK) {
        var bytes = await readChunk(blob.slice(offset, Math.min(offset + CHUNK, blob.size)));
        var ack = await request({ type: 'chunk', id: id, offset: offset, data: base64(bytes) });
        if (ack.offset !== offset + bytes.length) throw new Error('导出校验失败，请重试。');
      }
      await request({ type: 'end', id: id });
      notice('请选择文件保存位置。');
    } catch (error) {
      if (port && !disposed) port.postMessage(JSON.stringify({ type: 'abort', id: id, nonce: nonce }));
      notice(error && error.message ? error.message : '导出失败，请重试。');
    } finally { busy = false; }
  }
  function handles(anchor) {
    return anchor && anchor.tagName === 'A' && anchor.hasAttribute('download') && /^(blob:|data:)/i.test(anchor.href);
  }
  function click(event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[download]') : null;
    if (!handles(anchor)) return;
    event.preventDefault(); event.stopImmediatePropagation(); download(anchor);
  }
  HTMLAnchorElement.prototype.click = function () {
    if (handles(this)) download(this);
    else originalClick.call(this);
  };
  document.addEventListener('click', click, true);
  window.addEventListener('message', handshake);
  window.__silvioExportCleanup = function () {
    disposed = true;
    window.removeEventListener('message', handshake);
    document.removeEventListener('click', click, true);
    HTMLAnchorElement.prototype.click = originalClick;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('页面已更新，请重新导出。')); pending = null; }
    if (port) port.close(); port = null;
  };
})(__SILVIO_NONCE__);
