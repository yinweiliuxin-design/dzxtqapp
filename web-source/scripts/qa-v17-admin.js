/* Development-only, same-origin UI acceptance. Never bundled into the client. */
(() => {
  'use strict';
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) return;
  const host = document.querySelector('main > section');
  const clientFrame = document.querySelector('#app');
  if (!host || !clientFrame || document.querySelector('#qa-admin')) return;
  const controls = document.createElement('div');
  controls.innerHTML = '<hr><h2>本机后台与社区联通验收</h2><p>真实界面操作；固定 preview-owner 管理员测试身份，不能证明跨账号权限。自产 MP4 夹具，不读取摄像头。设置验收会真实恢复原设置。</p><button id="admin-load">载入后台</button><button id="admin-layout-all">后台四语三宽八页布局</button><button id="admin-community-flow">视频草稿、审批、展示与隐藏恢复</button><button id="admin-settings-flow">设置保存、客户端读回与恢复</button><button id="admin-comment-report-flow">评论、审批、点赞、举报与处理</button><button id="admin-delete-flow">测试帖删除与后台恢复草稿</button><p id="admin-run-status" role="status">等待后台验收</p><span id="admin-idle">后台验收空闲</span><pre id="admin-run-result"></pre>';
  host.append(controls);
  const panel = document.createElement('section');
  panel.style.gridColumn = '1 / -1'; panel.style.overflow = 'auto';
  panel.innerHTML = '<h2>真实管理端 iframe</h2><iframe id="qa-admin" title="本机真实后台" src="/__qa/blank" style="width:390px;height:900px" allow="autoplay"></iframe>';
  document.querySelector('main').append(panel);
  const adminFrame = document.querySelector('#qa-admin');
  const status = document.querySelector('#admin-run-status');
  const details = document.querySelector('#admin-run-result');
  const idle = document.querySelector('#admin-idle');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const cw = () => clientFrame.contentWindow, cd = () => cw().document;
  const aw = () => adminFrame.contentWindow, ad = () => aw().document;
  const evidence = []; let busy = false, prepared = null;
  const safeId = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  async function until(probe, label, timeout = 20000) {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) { const result = await probe(); if (result) return result; await sleep(80); }
    throw Error('等待超时：' + label);
  }
  async function api(path, options) {
    const response = await fetch(path, {credentials: 'same-origin', cache: 'no-store', ...options});
    const body = await response.json();
    assert(response.ok && body.ok === true, 'API ' + response.status + ' ' + (body.error?.code || path));
    return body;
  }
  async function record(id, value) {
    const item = {id, date: new Date().toISOString(), fixtureIdentity: 'preview-owner', environment: 'local-browser-ui', ...value};
    evidence.push(item); details.textContent = JSON.stringify(item, null, 2);
    const response = await fetch('/__qa/results', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(item)});
    assert(response.ok, '验收结果保存失败'); return item;
  }
  async function run(id, fn) {
    if (busy) return; busy = true; idle.hidden = true; status.className = ''; status.textContent = '执行中 ' + id;
    const buttons = [...document.querySelectorAll('button')]; const disabled = buttons.map(button => button.disabled);
    buttons.forEach(button => { button.disabled = true; });
    try { const value = await fn(); await record(id, {pass: true, ...value}); status.className = 'pass'; status.textContent = '通过 ' + id; }
    catch (error) { await record(id, {pass: false, error: String(error.message || error), prepared}); status.className = 'fail'; status.textContent = '失败 ' + id + ' ' + error.message; }
    finally { busy = false; buttons.forEach((button, index) => { button.disabled = disabled[index]; }); idle.hidden = false; }
  }
  function click(documentObject, selector) {
    const node = documentObject.querySelector(selector); assert(node && !node.disabled, '真实控件不可用 ' + selector); node.click(); return node;
  }
  function input(win, selector, value, eventName = 'input') {
    const node = win.document.querySelector(selector); assert(node && !node.disabled, '真实字段不可用 ' + selector);
    if (node.type === 'checkbox') node.checked = Boolean(value); else node.value = value;
    node.dispatchEvent(new win.Event(eventName, {bubbles: true})); return node;
  }
  async function frameLoad(frame, src) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { frame.removeEventListener('load', done); reject(Error('iframe 载入超时')); }, 20000);
      function done() { clearTimeout(timer); resolve(); }
      frame.addEventListener('load', done, {once: true}); frame.src = src;
    });
  }
  async function loadClient() {
    let prefs = JSON.parse(localStorage.getItem('sv12-prefs') || '{}');
    prefs = {...prefs, lang: 'zh', region: 'cn', localeChoiceVersion: 1, appMode: 'full', tutorialAuto: false, tutorialVersion: 1, learningPathShownVersion: 1, learningPathIntroducedVersion: 1};
    localStorage.setItem('sv12-prefs', JSON.stringify(prefs)); clientFrame.style.width = '390px';
    await frameLoad(clientFrame, '/?qaHarness=17&communityQa=' + Date.now() + '#community');
    await until(() => cw().SVCommunity?.viewer()?.id && cd().querySelector('[data-svc-action="new"]'), '实际社区身份');
    assert(cw().SVCommunity.viewer().id === 'preview-owner', '测试身份与开发服务器不匹配');
  }
  async function loadAdmin(width = 390) {
    adminFrame.style.width = width + 'px';
    await frameLoad(adminFrame, '/admin.html?qaAdmin=17&t=' + Date.now());
    await until(() => ad().querySelector('#admin-main[aria-busy="false"]') && ad().querySelector('[data-view="settings"]'), '真实后台载入');
    const state = await api('/api/admin/state'); assert(state.viewer?.isAdmin === true, '后台真实管理权限未确认'); return state;
  }
  async function adminReady() { await until(() => ad().querySelector('#admin-main[aria-busy="false"]'), '后台提交完成'); }
  async function adminView(view) { click(ad(), '[data-view="' + view + '"]'); await sleep(80); }
  async function adminRefresh() { click(ad(), '#admin-connection [data-act="refresh"]'); await adminReady(); }
  async function clientRefresh() { click(cd(), '[data-svc-action="refresh"]'); await until(() => !cd().querySelector('[data-svc-action="refresh"]').disabled, '客户端刷新'); }
  function draft() { return JSON.parse(localStorage.getItem('smartvio-community-local-drafts-v1') || '{}').drafts?.find(row => row.title === prepared?.title); }
  async function clientTab(tab) { click(cd(), '[data-svc-action="tab"][data-tab="' + tab + '"]'); await sleep(50); }
  function ownPost(state) { return state.mine?.find(row => row.id === prepared?.postId || row.title === prepared?.title); }
  async function findPostStatus(statusName) { return until(async () => { const row = ownPost(await api('/api/community/state')); return row?.status === statusName && row; }, '服务端帖子 ' + statusName); }
  async function moderate(type, id, decision, expected) {
    await adminRefresh(); await adminView('moderation');
    input(aw(), '[data-filter="status"]', 'all', 'change'); input(aw(), '[data-filter="type"]', 'all', 'change');
    input(aw(), '[data-filter="query"]', id);
    click(ad(), '[data-act="review"][data-target-type="' + type + '"][data-id="' + safeId(id) + '"][data-decision="' + decision + '"]');
    input(aw(), '#admin-review-form textarea[name="reason"]', 'V17 本机 UI 验收 ' + decision);
    click(ad(), '#admin-review-form button[type="submit"]');
    await until(async () => { const state = await api('/api/admin/state'); return state[type === 'post' ? 'posts' : 'comments'].find(row => row.id === id)?.status === expected; }, '真实后台审核 ' + expected);
    await adminReady(); assert(!ad().querySelector('#admin-modal').open, '审核成功后弹窗未关闭');
    await record('admin-ui-' + type + '-' + decision, {pass: true, targetId: id, expectedStatus: expected});
  }
  async function checkVideo(documentObject, selector, ownerLabel) {
    const video = await until(() => documentObject.querySelector(selector), ownerLabel + '视频DOM');
    (documentObject === ad() ? adminFrame : clientFrame).scrollIntoView({block: 'center'});
    video.scrollIntoView({block: 'center'});
    // Let the application's real off-screen observer settle before playback.
    await sleep(250); await video.play();
    await until(() => video.readyState >= 2 && video.videoWidth > 0, ownerLabel + '浏览器解码');
    const start = video.currentTime; await sleep(250);
    assert(!video.paused && video.currentTime > start, ownerLabel + '视频未推进');
    const value = {duration: video.duration, width: video.videoWidth, height: video.videoHeight, readyState: video.readyState, muted: video.muted, volume: video.volume, progressed: true};
    video.pause(); return value;
  }
  document.querySelector('#admin-load').onclick = () => run('admin-ui-load', async () => { const state = await loadAdmin(); return {adminConfirmed: state.viewer.isAdmin, counts: state.counts}; });
  document.querySelector('#admin-layout-all').onclick = () => run('admin-layout-all', async () => {
    const rows = [], views = ['overview', 'moderation', 'reports', 'users', 'settings', 'catalog', 'audit', 'plans'];
    for (const width of [390, 768, 1440]) {
      await loadAdmin(width);
      for (const lang of ['zh', 'en', 'ja', 'de']) {
        input(aw(), '#admin-language', lang, 'change');
        for (const view of views) {
          await adminView(view); const documentObject = ad(), root = documentObject.documentElement;
          assert(root.scrollWidth <= root.clientWidth + 1, '后台横向溢出 ' + lang + '/' + view + '/' + width + ': ' + root.scrollWidth + '/' + root.clientWidth);
          const item = {pass: true, width, lang, view, innerWidth: aw().innerWidth, clientWidth: root.clientWidth, scrollWidth: root.scrollWidth};
          rows.push(item); await record('admin-layout-' + lang + '-' + view + '-' + width, item);
        }
      }
    }
    return {cases: rows.length, passCount: rows.length, rows, boundary: 'Windows Chromium iframe尺寸模拟，非手机真机'};
  });
  document.querySelector('#admin-community-flow').onclick = () => run('admin-community-flow', async () => {
    await loadClient(); await loadAdmin();
    prepared = {title: 'V17 本机原创视频验收 ' + new Date().toISOString(), mediaId: null, postId: null};
    click(cd(), '[data-svc-action="new"]');
    input(cw(), '[data-svc-field="title"]', prepared.title);
    input(cw(), '[data-svc-field="text"]', '本机实际界面联通验收。项目自产64×64 MP4动画与音频，不含第三方音乐或人物，固定管理员测试身份。');
    click(cd(), '[data-svc-field="rights"]');
    const fileInput = await until(() => { const el = cd().querySelector('[data-svc-field="video"]'); return el && !el.disabled && el; }, '权利确认后视频输入启用');
    const fixture = await fetch('/__qa/fixture.mp4', {cache: 'no-store'}).then(response => { assert(response.ok, '原创夹具不可用'); return response.blob(); });
    const transfer = new (cw().DataTransfer)(); transfer.items.add(new (cw().File)([fixture], 'smartvio-v17-own-generated.mp4', {type: 'video/mp4'}));
    fileInput.files = transfer.files; fileInput.dispatchEvent(new (cw().Event)('change', {bubbles: true}));
    const attachment = await until(() => draft()?.attachments?.find(item => item.kind === 'video'), '真实UI上传完成', 100000);
    prepared.mediaId = attachment.mediaId;
    const media = (await api('/api/community/videos/' + prepared.mediaId + '/status')).media;
    assert(media.state === 'ready' && !media.cleanupPending && media.size === fixture.size && media.duration > 0 && media.width === 64 && media.height === 64, '真实容器元数据不符');
    assert(cd().querySelector('[data-svc-field="rights"]').checked === false, '上传后权利未重新确认');
    const head = await fetch('/api/community/videos/' + prepared.mediaId, {method: 'HEAD', cache: 'no-store'});
    const range = await fetch('/api/community/videos/' + prepared.mediaId, {headers: {Range: 'bytes=0-31'}, cache: 'no-store'});
    const part = new Uint8Array(await range.arrayBuffer());
    assert(head.status === 200 && (await head.arrayBuffer()).byteLength === 0 && head.headers.get('Accept-Ranges') === 'bytes', 'HEAD响应不正确');
    assert(range.status === 206 && part.length === 32 && String.fromCharCode(...part.slice(4, 8)) === 'ftyp', 'Range响应不正确');
    if (!cd().querySelector('[data-svc-field="rights"]').checked) click(cd(), '[data-svc-field="rights"]');
    click(cd(), '[data-svc-action="save-cloud"]');
    const saved = await findPostStatus('draft'); prepared.postId = saved.id;
    await until(() => !cd().querySelector('[data-svc-action="submit"]').disabled, '云草稿保存完成');
    if (!cd().querySelector('[data-svc-field="rights"]').checked) click(cd(), '[data-svc-field="rights"]');
    click(cd(), '[data-svc-action="submit"]');
    const pending = await findPostStatus('pending');
    assert(pending.attachments.some(item => item.kind === 'video' && item.mediaId === prepared.mediaId), '待审帖子缺少视频');
    await record('admin-community-upload-pending', {pass: true, ...prepared, media: {size: media.size, duration: media.duration, width: media.width, height: media.height, codec: media.codec, audioCodec: media.audioCodec}, head: head.status, range: range.status, rangeBytes: part.length});
    await adminRefresh(); await adminView('moderation'); input(aw(), '[data-filter="query"]', prepared.postId);
    click(ad(), '[data-act="preview"][data-target-type="post"][data-id="' + safeId(prepared.postId) + '"]');
    const adminVideo = await checkVideo(ad(), '#admin-modal video', '后台'); click(ad(), '#admin-modal [data-act="close"]');
    await moderate('post', prepared.postId, 'approve', 'published');
    await clientRefresh(); await clientTab('clips');
    assert(cd().querySelector('video.svc-video[src="/api/community/videos/' + safeId(prepared.mediaId) + '"]'), '客户端短视频页缺少已审视频');
    const clientVideo = await checkVideo(cd(), 'video.svc-video[src="/api/community/videos/' + safeId(prepared.mediaId) + '"]', '客户端');
    await moderate('post', prepared.postId, 'hide', 'hidden'); await clientRefresh();
    assert(!cd().querySelector('video.svc-video[src="/api/community/videos/' + safeId(prepared.mediaId) + '"]'), '隐藏后客户端仍公开显示测试视频');
    await moderate('post', prepared.postId, 'restore', 'published'); await clientRefresh();
    assert(cd().querySelector('video.svc-video[src="/api/community/videos/' + safeId(prepared.mediaId) + '"]'), '恢复后客户端未显示测试视频');
    return {...prepared, upload: 'ready', cloudDraft: 'draft', submitted: 'pending', approved: 'published', hiddenRemoved: true, restoredVisible: true, adminVideo, clientVideo, identityBoundary: '同一preview-owner，非普通用户跨账号实测'};
  });
  async function fillSettings(settings) {
    await adminView('settings');
    for (const key of ['postingEnabled', 'commentsEnabled', 'likesEnabled', 'allowExternalLinks', 'cloudPresetBackupEnabled']) input(aw(), '#admin-settings-form [name="' + key + '"]', settings[key], 'change');
    for (const lang of ['zh', 'en', 'ja', 'de']) input(aw(), '#admin-settings-form [name="announcement-' + lang + '"]', settings.announcement[lang]);
    const version = Number(ad().querySelector('#admin-settings-form').dataset.version);
    click(ad(), '#admin-settings-form button[type="submit"]');
    const state = await until(async () => { const value = await api('/api/admin/state'); return value.settings.version > version && value; }, '设置实际保存');
    await adminReady(); return state.settings;
  }
  document.querySelector('#admin-settings-flow').onclick = () => run('admin-settings-flow', async () => {
    await loadClient(); const original = (await loadAdmin()).settings;
    const token = 'V17 本机设置读回 ' + new Date().toISOString();
    const changed = {...original, announcement: {...original.announcement, zh: token}};
    let observed = null, restored = null;
    try {
      const saved = await fillSettings(changed);
      await adminRefresh(); await adminView('settings');
      assert(ad().querySelector('[name="announcement-zh"]').value === token, '后台刷新后公告未保存');
      const state = await api('/api/community/state'); assert(state.settings.announcement.zh === token, '客户端API未读到后台公告');
      await clientRefresh(); assert(cd().body.textContent.includes(token), '客户端真实页面未显示新公告');
      observed = {versionBefore: original.version, versionSaved: saved.version, adminReloadReadback: true, clientApiReadback: true, clientRenderedReadback: true};
    } finally {
      await adminRefresh(); restored = await fillSettings(original); await clientRefresh();
      for (const key of ['postingEnabled', 'commentsEnabled', 'likesEnabled', 'allowExternalLinks', 'cloudPresetBackupEnabled']) assert(restored[key] === original[key], '恢复设置失败 ' + key);
      assert(JSON.stringify(restored.announcement) === JSON.stringify(original.announcement), '恢复四语公告失败');
    }
    return {...observed, restoredVersion: restored.version, originalSettingsRestored: true};
  });
  document.querySelector('#admin-comment-report-flow').onclick = () => run('admin-comment-report-flow', async () => {
    assert(prepared?.postId, '请先完成视频联通验收'); await loadClient(); await loadAdmin(); await clientTab('feed');
    const postId = safeId(prepared.postId), text = 'V17 UI 评论审核 ' + new Date().toISOString();
    click(cd(), '[data-svc-action="comment"][data-id="' + postId + '"]'); input(cw(), '[data-svc-field="comment"]', text); click(cd(), '[data-svc-action="send-comment"]');
    const comment = await until(async () => (await api('/api/community/state')).myComments?.find(item => item.text === text && item.status === 'pending'), '客户端评论待审');
    await moderate('comment', comment.id, 'approve', 'published'); await clientRefresh();
    let state = await api('/api/community/state'); assert(state.posts.find(post => post.id === prepared.postId)?.comments.some(row => row.id === comment.id && row.status === 'published'), '审批后评论未发布');
    const likeBefore = state.posts.find(post => post.id === prepared.postId).likedByMe;
    click(cd(), '[data-svc-action="like"][data-id="' + postId + '"]');
    await until(async () => (await api('/api/community/state')).posts.find(post => post.id === prepared.postId)?.likedByMe !== likeBefore, '真实点赞保存');
    const reportButton = cd().querySelector('[data-svc-action="report-comment"][data-id="' + safeId(comment.id) + '"]');
    assert(reportButton, '客户端缺少已发布评论举报按钮'); reportButton.closest('details').open = true; reportButton.click();
    const reason = 'V17 本机举报处理验收 ' + new Date().toISOString(); input(cw(), '[data-svc-field="report"]', reason); click(cd(), '[data-svc-action="send-report"]');
    const report = await until(async () => (await api('/api/admin/state')).reports.find(item => item.reason === reason && item.targetId === comment.id && item.status === 'open'), '真实举报进入后台');
    await adminRefresh(); await adminView('reports'); input(aw(), '[data-filter="query"]', report.id);
    click(ad(), '[data-act="report"][data-id="' + safeId(report.id) + '"][data-resolution-status="resolved"]');
    input(aw(), '#admin-report-form textarea[name="resolution"]', 'V17 本机测试举报处理完成，内容不自动隐藏'); click(ad(), '#admin-report-form button[type="submit"]');
    await until(async () => (await api('/api/admin/state')).reports.find(item => item.id === report.id)?.status === 'resolved', '后台举报处理持久化');
    await adminReady();
    await moderate('comment', comment.id, 'hide', 'hidden'); await clientRefresh();
    state = await api('/api/community/state'); assert(!state.posts.find(post => post.id === prepared.postId)?.comments.some(row => row.id === comment.id && row.status === 'published'), '隐藏评论仍标记已发布');
    await moderate('comment', comment.id, 'restore', 'published'); await clientRefresh();
    state = await api('/api/community/state'); assert(state.posts.find(post => post.id === prepared.postId)?.comments.some(row => row.id === comment.id && row.status === 'published'), '恢复评论未发布');
    return {postId: prepared.postId, commentId: comment.id, reportId: report.id, commentPending: true, commentApproved: true, likePersisted: true, reportResolved: true, commentHiddenNotPublished: true, commentRestoredPublished: true, identityBoundary: '同一管理员fixture可看本人隐藏评论；普通用户不可见的权限隔离另由API测试覆盖'};
  });
  document.querySelector('#admin-delete-flow').onclick = () => run('admin-delete-flow', async () => {
    assert(prepared?.postId, '请先完成视频联通验收'); await loadClient(); await loadAdmin(); await clientTab('mine');
    click(cd(), '[data-svc-action="delete-cloud"][data-id="' + safeId(prepared.postId) + '"]'); click(cd(), '[data-svc-action="confirm-delete"]'); await findPostStatus('deleted');
    await clientTab('feed'); assert(!cd().querySelector('video[src="/api/community/videos/' + safeId(prepared.mediaId) + '"]'), '删帖后公开视频未移除');
    await moderate('post', prepared.postId, 'restore', 'draft'); await clientRefresh();
    const restored = await findPostStatus('draft'); assert(restored.attachments.some(item => item.mediaId === prepared.mediaId), '恢复草稿附件丢失');
    return {postId: prepared.postId, deleteConfirmed: true, removedFromFeed: true, restoredAsDraft: true, mediaRetainedForOwner: true};
  });
  window.addEventListener('pagehide', () => { for (const frame of [clientFrame, adminFrame]) try { for (const video of frame.contentDocument.querySelectorAll('video')) video.pause(); } catch {} });
})();
