(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SVMediaStore = api.createMediaStore({environment: root});
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA_VERSION = 1;
  const DATABASE_VERSION = 2;
  const STORE = 'media';
  const IMPORT_JOURNAL = 'workspaceImport';
  const KINDS = ['recording', 'video', 'loop', 'backing'];
  const LIMITS = [
    '仅当前浏览器与同源地址保存；协议、主机或端口改变后不会读取到原录音。',
    '容量由浏览器配额决定，隐私模式、清理网站数据或浏览器回收可能删除录音。重要录音请另行下载。',
    '这是本机浏览器存储，不是云备份；未停止且未完成的录音不会恢复。'
  ];

  class MediaStorageError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = 'MediaStorageError';
      this.code = code;
      this.causeName = cause && cause.name || null;
      this.committed = false;
      this.persisted = false;
    }
  }

  function storageError(code, cause) {
    const name = cause && cause.name;
    if (name === 'QuotaExceededError') return new MediaStorageError('QUOTA_EXCEEDED',
      code === 'DELETE_FAILED' || code === 'CLEAR_FAILED' ? '浏览器存储提交失败；删除未确认，请重试。' : '浏览器存储空间不足；录音仅保留在本页内存，请立即下载。', cause);
    if (name === 'SecurityError' || name === 'NotAllowedError') return new MediaStorageError('STORAGE_DENIED', '浏览器未允许本机存储；录音仅保留在本页内存，刷新后会丢失。', cause);
    const messages = {
      UNAVAILABLE: '当前浏览器不支持 IndexedDB；录音仅保留在本页内存，刷新后会丢失。',
      OPEN_FAILED: '无法打开本机录音库；本页录音可下载，但未确认持久保存。',
      BLOCKED: '录音库被其他页面占用，请关闭旧页面后刷新；本页录音尚未持久保存。',
      WRITE_FAILED: '录音未提交到本机录音库；仅保留在本页内存，请下载备份。',
      READ_FAILED: '无法读取本机录音库；当前列表可能不完整，请保留本页并重试。',
      DELETE_FAILED: '删除未提交；本机录音仍需确认删除，请重试。',
      CLEAR_FAILED: '清空未提交；本机录音仍需确认删除，请重试。',
      VERSION_CHANGED: '录音库版本已被其他页面更新；请刷新后再保存。',
      CLOSED: '录音库已关闭；本页新增录音尚未持久保存。'
    };
    return new MediaStorageError(code, messages[code] || messages.WRITE_FAILED, cause);
  }

  function errorInfo(error) {
    return error ? {code: error.code, message: error.message, name: error.causeName || error.name} : null;
  }

  function createMediaStore(options) {
    options = options || {};
    const env = options.environment || (typeof globalThis !== 'undefined' ? globalThis : {});
    const BlobType = options.Blob || env.Blob;
    const now = options.now || (() => new Date().toISOString());
    const dbName = options.dbName || 'smartvio-v11-media';
    const memory = new Map();
    let db = null, openPromise = null, lastError = null, writeQueue = Promise.resolve(), closed = false;
    const isBlob = value => typeof BlobType === 'function' && value instanceof BlobType;
    const remember = error => { lastError = error; return error; };

    function status() {
      const warning = lastError || (memory.size ? new MediaStorageError('VOLATILE_RECORDS', '部分录音仅保留在本页内存；刷新后会丢失，请下载备份。') : null);
      return {
        schemaVersion: SCHEMA_VERSION, database: dbName,
        mode: db ? warning ? 'degraded' : 'indexeddb' : 'memory',
        persistentAvailable: !!db, error: errorInfo(warning),
        memoryRecords: memory.size,
        memoryBytes: [...memory.values()].reduce((sum, row) => sum + row.blob.size, 0),
        limitations: LIMITS.slice()
      };
    }

    async function ensureDB(requiredVersion) {
      if (closed) { remember(storageError('CLOSED')); return null; }
      if (requiredVersion !== undefined) {
        const current = await ensureDB();
        if (!current) return null;
        if (hasJournal(current) && current.version >= requiredVersion) return current;
        if (current.version >= requiredVersion) { remember(new MediaStorageError('SCHEMA_UNAVAILABLE', '作品恢复存储结构不可用，请保留数据并重试。')); return null; }
        // Only an explicitly confirmed restore upgrades the database. Ordinary
        // reads/writes keep v1 usable by the previously downloaded offline app.
        db = null; openPromise = null; current.close();
      }
      if (!openPromise) {
        openPromise = new Promise(resolve => {
          let factory;
          try { factory = Object.prototype.hasOwnProperty.call(options, 'indexedDB') ? options.indexedDB : env.indexedDB; }
          catch (error) { remember(storageError('OPEN_FAILED', error)); resolve(null); return; }
          if (!factory || typeof factory.open !== 'function') { remember(storageError('UNAVAILABLE')); resolve(null); return; }
          let request, settled = false, timer;
          const finish = (connection, error) => {
            if (settled) { if (connection) connection.close(); return; }
            settled = true;
            clearTimeout(timer);
            if (error) remember(error);
            if (connection && !closed) { db = connection; lastError = null; }
            else if (connection) connection.close();
            resolve(db);
          };
          try {
            request = requiredVersion === undefined ? factory.open(dbName) : factory.open(dbName, requiredVersion);
            request.onupgradeneeded = () => {
              if (settled || closed) { request.transaction.abort(); return; }
              const connection = request.result;
              const store = connection.objectStoreNames.contains(STORE)
                ? request.transaction.objectStore(STORE)
                : connection.createObjectStore(STORE, {keyPath: 'id'});
              if (!store.indexNames.contains('byKind')) store.createIndex('byKind', 'kind', {unique: false});
              if (!store.indexNames.contains('byLoopSlot')) store.createIndex('byLoopSlot', ['kind', 'trackIndex'], {unique: true});
              if (Number(connection.version || requiredVersion || 1) >= DATABASE_VERSION && !connection.objectStoreNames.contains(IMPORT_JOURNAL)) connection.createObjectStore(IMPORT_JOURNAL, {keyPath: 'id'});
            };
            request.onerror = () => finish(null, storageError('OPEN_FAILED', request.error));
            request.onblocked = () => finish(null, storageError('BLOCKED'));
            request.onsuccess = () => {
              const connection = request.result;
              connection.onversionchange = () => { connection.close(); if (db === connection) db = null; remember(storageError('VERSION_CHANGED')); };
              connection.onclose = () => { if (db === connection) { db = null; remember(storageError('CLOSED')); } };
              finish(connection);
            };
            timer = setTimeout(() => finish(null, storageError('BLOCKED')), options.openTimeoutMs || 2500);
          } catch (error) { finish(null, storageError('OPEN_FAILED', error)); }
        });
      }
      await openPromise;
      return db;
    }

    // Only transaction.complete confirms a commit; request.success is insufficient.
    // https://www.w3.org/TR/IndexedDB-3/#transaction-finished
    function transaction(connection, mode, operation, stores = STORE) {
      return new Promise((resolve, reject) => {
        let tx, result, failure;
        try {
          if (mode === 'readwrite') {
            try { tx = connection.transaction(stores, mode, {durability: 'strict'}); }
            catch (error) { if (error.name !== 'TypeError') throw error; tx = connection.transaction(stores, mode); }
          } else tx = connection.transaction(stores, mode);
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(tx.error || failure || new Error('Transaction aborted'));
          tx.onerror = () => { failure = tx.error || failure; };
          const watch = (request, success) => {
            request.onerror = () => { failure = request.error || failure; };
            request.onsuccess = () => {
              try { if (success) success(request.result); }
              catch (error) { failure = error; tx.abort(); }
            };
            return request;
          };
          operation(tx.objectStore(STORE), watch, value => { result = value; }, tx);
        } catch (error) {
          if (tx) { failure = error; try { tx.abort(); } catch (_) { reject(error); } }
          else reject(error);
        }
      });
    }

    const hasJournal = connection => connection.objectStoreNames?.contains?.(IMPORT_JOURNAL) === true;
    const guardedStores = connection => hasJournal(connection) ? [STORE, IMPORT_JOURNAL] : STORE;
    function whenWritable(connection, tx, watch, operation) {
      if (!hasJournal(connection)) return operation();
      watch(tx.objectStore(IMPORT_JOURNAL).get('restore'), journal => {
        if (journal) throw new MediaStorageError('RESTORE_PENDING', '作品恢复尚未完成，请先完成或回滚恢复。');
        operation();
      });
    }

    function validateKind(kind) {
      if (kind !== undefined && !KINDS.includes(kind)) throw new MediaStorageError('INVALID_RECORD', '录音类别无效。');
    }

    function normalize(input) {
      validateKind(input && input.kind);
      if (!input || !KINDS.includes(input.kind) || typeof input.id !== 'string' || !input.id || input.id.length > 160 ||
          input.completed !== true || !isBlob(input.blob) || !input.blob.size || typeof input.name !== 'string' || input.name.length > 200) {
        throw new MediaStorageError('INVALID_RECORD', '仅能保存已停止且完成的非空录音；需要有效编号、名称、Blob和completed:true。');
      }
      if (input.kind === 'loop' && (!Number.isInteger(input.trackIndex) || input.trackIndex < 0 || input.trackIndex > 3)) {
        throw new MediaStorageError('INVALID_RECORD', 'Looper轨号必须为0至3。');
      }
      const row = {
        schemaVersion: SCHEMA_VERSION, id: input.id, kind: input.kind,
        completed: true, name: input.name, blob: input.blob,
        type: input.blob.type || (typeof input.type === 'string' ? input.type.slice(0, 180) : 'application/octet-stream'),
        createdAt: typeof input.createdAt === 'string' && Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt : now(), updatedAt: now()
      };
      if (input.kind === 'loop') row.trackIndex = input.trackIndex;
      for (const key of ['duration', 'bpm', 'meter', 'loopBars', 'volume', 'sampleRate', 'channels']) {
        if (input[key] !== undefined) {
          if (!Number.isFinite(input[key]) || input[key] < 0) throw new MediaStorageError('INVALID_RECORD', '录音元数据中的数值无效。');
          row[key] = input[key];
        }
      }
      if (typeof input.muted === 'boolean') row.muted = input.muted;
      if (typeof input.source === 'string') row.source = input.source.slice(0, 80);
      return row;
    }

    function keepMemory(row) {
      if (row.kind === 'loop') for (const [id, old] of memory) if (old.kind === 'loop' && old.trackIndex === row.trackIndex) memory.delete(id);
      memory.set(row.id, row);
    }

    function serialWrite(operation) {
      const result = writeQueue.then(operation);
      writeQueue = result.catch(() => {});
      return result;
    }

    function restorable(row) {
      return row && row.schemaVersion === SCHEMA_VERSION && row.completed === true && KINDS.includes(row.kind) &&
        typeof row.id === 'string' && isBlob(row.blob) && row.blob.size > 0 &&
        (row.kind !== 'loop' || Number.isInteger(row.trackIndex) && row.trackIndex >= 0 && row.trackIndex < 4);
    }

    async function list(kind, listOptions) {
      validateKind(kind);
      await writeQueue;
      const connection = await ensureDB();
      let stored = [];
      if (connection) {
        try {
          stored = await transaction(connection, 'readonly', (store, watch, set, tx) => {
            whenWritable(connection, tx, watch, () => watch(kind ? store.index('byKind').getAll(kind) : store.getAll(), set));
          }, guardedStores(connection));
          lastError = null;
        } catch (error) { remember(error.code === 'RESTORE_PENDING' ? error : storageError('READ_FAILED', error)); }
      }
      const merged = new Map(stored.filter(restorable).map(row => [row.id, {...row, persisted: true}]));
      for (const row of memory.values()) if (restorable(row) && (!kind || row.kind === kind)) merged.set(row.id, {...row, persisted: false});
      const rows = [...merged.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || Number(a.persisted) - Number(b.persisted));
      // Destructive UI actions need all IDs, including a durable slot hidden by
      // a newer volatile recording after a failed replacement transaction.
      if (listOptions && listOptions.includeShadowed === true) return rows;
      const occupied = new Set();
      return rows.filter(row => {
        if (row.kind !== 'loop') return true;
        if (occupied.has(row.trackIndex)) return false;
        occupied.add(row.trackIndex); return true;
      });
    }

    async function put(input) {
      const row = normalize(input);
      return serialWrite(async () => {
        const connection = await ensureDB();
        if (connection) {
          try {
            await transaction(connection, 'readwrite', (store, watch, set, tx) => whenWritable(connection, tx, watch, () => {
              const save = () => watch(store.put(row));
              if (row.kind === 'loop') watch(store.index('byLoopSlot').getKey(['loop', row.trackIndex]), oldId => {
                if (oldId !== undefined && oldId !== row.id) watch(store.delete(oldId));
                save();
              });
              else save();
            }), guardedStores(connection));
            memory.delete(row.id);
            if (row.kind === 'loop') for (const [id, old] of memory) if (old.kind === 'loop' && old.trackIndex === row.trackIndex) memory.delete(id);
            lastError = null;
            return {record: {...row, persisted: true}, persisted: true, committed: true, mode: 'indexeddb', error: null};
          } catch (error) { remember(storageError('WRITE_FAILED', error)); }
        }
        keepMemory(row);
        return {record: {...row, persisted: false}, persisted: false, committed: false, mode: 'memory', error: errorInfo(lastError)};
      });
    }

    function deleteRecord(id) {
      if (typeof id !== 'string' || !id || id.length > 160) return Promise.reject(new MediaStorageError('INVALID_RECORD', '录音编号无效。'));
      return serialWrite(async () => {
        const connection = await ensureDB();
        if (connection) {
          try { await transaction(connection, 'readwrite', (store, watch, set, tx) => whenWritable(connection, tx, watch, () => watch(store.delete(id))), guardedStores(connection)); }
          catch (error) { throw remember(storageError('DELETE_FAILED', error)); }
          memory.delete(id); lastError = null;
          return {id, deleted: true, committed: true, persisted: true, mode: 'indexeddb', error: null};
        }
        memory.delete(id);
        return {id, deleted: true, committed: false, persisted: false, mode: 'memory', error: errorInfo(lastError)};
      });
    }

    function clear() {
      return serialWrite(async () => {
        const connection = await ensureDB();
        if (connection) {
          try { await transaction(connection, 'readwrite', (store, watch, set, tx) => whenWritable(connection, tx, watch, () => watch(store.clear())), guardedStores(connection)); }
          catch (error) { throw remember(storageError('CLEAR_FAILED', error)); }
          memory.clear(); lastError = null;
          return {cleared: true, committed: true, persisted: true, mode: 'indexeddb', error: null};
        }
        memory.clear();
        return {cleared: true, committed: false, persisted: false, mode: 'memory', error: errorInfo(lastError)};
      });
    }

    // A durable journal binds media preparation to the localStorage recovery step.
    // Restore only enters an empty media library. No existing recording is replaced.
    async function pendingImport() {
      await writeQueue;
      const connection = await ensureDB();
      if (!connection) throw lastError || remember(storageError('UNAVAILABLE'));
      if (!hasJournal(connection)) return null;
      return transaction(connection, 'readonly', (store, watch, set, tx) => watch(tx.objectStore(IMPORT_JOURNAL).get('restore'), set), [STORE, IMPORT_JOURNAL]);
    }
    async function snapshotForBackup() {
      await writeQueue;
      const connection = await ensureDB();
      let rows = [];
      if (!connection && lastError?.code !== 'UNAVAILABLE') throw lastError || storageError('READ_FAILED');
      if (connection) rows = await transaction(connection, 'readonly', (store, watch, set, tx) => whenWritable(connection, tx, watch, () => watch(store.getAll(), set)), guardedStores(connection));
      // Backups must never silently drop malformed or shadowed durable records.
      if (rows.some(row => !restorable(row)) || [...memory.values()].some(row => !restorable(row))) throw new MediaStorageError('INVALID_RECORD', '录音库含无法完整读取的旧资料，未生成不完整备份。');
      const durable = new Set(rows.map(row => row.id));
      if ([...memory.keys()].some(id => durable.has(id))) throw new MediaStorageError('IMPORT_CONFLICT', '同一录音有未持久保存的替代版本，请先分别下载。');
      return [...rows.map(row => ({...row, persisted:true})), ...[...memory.values()].map(row => ({...row, persisted:false}))];
    }
    function prepareImportBatch(input) {
      if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.token || '') || !Array.isArray(input.records) || input.records.length > 500 || !Array.isArray(input.storageChanges) || input.storageChanges.length > 12) return Promise.reject(new MediaStorageError('INVALID_IMPORT', '作品包恢复参数无效。'));
      const rows = input.records.map(value => {
        const row = normalize(value);
        if (typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))) row.updatedAt = value.updatedAt;
        return row;
      });
      const ids = new Set(), slots = new Set();
      for (const row of rows) {
        if (ids.has(row.id) || row.kind === 'loop' && slots.has(row.trackIndex)) return Promise.reject(new MediaStorageError('IMPORT_CONFLICT', '作品包编号或循环轨道重复。'));
        ids.add(row.id); if (row.kind === 'loop') slots.add(row.trackIndex);
      }
      const changes = input.storageChanges.map(change => {
        if (!change || typeof change.key !== 'string' || change.key.length > 100 || ![change.before, change.after].every(value => value === null || typeof value === 'string' && value.length <= 5 * 1024 * 1024)) throw new MediaStorageError('INVALID_IMPORT', '恢复日志格式无效。');
        return {key: change.key, before: change.before, after: change.after};
      });
      if (new Set(changes.map(change => change.key)).size !== changes.length) return Promise.reject(new MediaStorageError('INVALID_IMPORT', '恢复日志字段重复。'));
      return serialWrite(async () => {
        if (memory.size) throw new MediaStorageError('IMPORT_CONFLICT', '当前页面仍有未持久保存的录音，不能覆盖恢复。');
        let connection = await ensureDB();
        if (!connection) throw lastError || remember(storageError('UNAVAILABLE'));
        if (!hasJournal(connection)) {
          const existing = await transaction(connection, 'readonly', (store, watch, set) => watch(store.getAll(), set));
          if (existing.length) throw new MediaStorageError('IMPORT_CONFLICT', '请在空作品库恢复；当前录音全部保留。');
          connection = await ensureDB(DATABASE_VERSION);
          if (!connection) throw lastError || remember(storageError('UNAVAILABLE'));
        }
        if (!hasJournal(connection)) throw new MediaStorageError('SCHEMA_UNAVAILABLE', '作品恢复存储结构不可用，请保留数据并重试。');
        const journal = {id:'restore', schema:1, token:input.token, createdAt:now(), storageChanges:changes, mediaIds:rows.map(row => row.id)};
        try {
          await transaction(connection, 'readwrite', (store, watch, set, tx) => {
            const journals = tx.objectStore(IMPORT_JOURNAL);
            watch(journals.get('restore'), pending => {
              if (pending) throw new MediaStorageError('RESTORE_PENDING', '已有作品恢复需要先完成或回滚。');
              watch(store.getAll(), existing => {
                if (existing.length) throw new MediaStorageError('IMPORT_CONFLICT', '请在空作品库恢复；当前录音全部保留。');
                for (const row of rows) watch(store.put(row));
                watch(journals.put(journal));
              });
            });
          }, [STORE, IMPORT_JOURNAL]);
        } catch (error) { throw remember(error instanceof MediaStorageError ? error : storageError('WRITE_FAILED', error)); }
        lastError = null;
        return {prepared:true, committed:true, token:input.token, count:rows.length};
      });
    }
    function finishImportBatch(token, rollback) {
      return serialWrite(async () => {
        const connection = await ensureDB();
        if (!connection) throw lastError || remember(storageError('UNAVAILABLE'));
        if (!hasJournal(connection)) throw new MediaStorageError('SCHEMA_UNAVAILABLE', '作品恢复存储结构不可用，请保留数据并重试。');
        try { await transaction(connection, 'readwrite', (store, watch, set, tx) => {
          const journals = tx.objectStore(IMPORT_JOURNAL);
          watch(journals.get('restore'), journal => {
            if (!journal || journal.token !== token) throw new MediaStorageError('IMPORT_CONFLICT', '恢复日志已变更，请重新检查。');
            if (!rollback && memory.size) throw new MediaStorageError('IMPORT_CONFLICT', '恢复期间出现新的临时录音，恢复未提交。');
            if (rollback) for (const id of journal.mediaIds) watch(store.delete(id));
            watch(journals.delete('restore'));
          });
        }, [STORE, IMPORT_JOURNAL]); }
        catch (error) { throw remember(error instanceof MediaStorageError ? error : storageError('WRITE_FAILED', error)); }
        lastError = null;
        return {committed:true, restored:!rollback, rolledBack:rollback};
      });
    }

    async function estimate() {
      const result = {usage: null, quota: null, persistentPermission: null, ...status()};
      try {
        const storage = options.storage || env.navigator && env.navigator.storage;
        if (storage && typeof storage.estimate === 'function') {
          const size = await storage.estimate();
          result.usage = Number.isFinite(size.usage) ? size.usage : null;
          result.quota = Number.isFinite(size.quota) ? size.quota : null;
        }
        if (storage && typeof storage.persisted === 'function') result.persistentPermission = await storage.persisted();
      } catch (error) { result.estimateError = {name: error.name, message: '无法取得浏览器容量估算；可用容量未知。'}; }
      return result;
    }

    function close() { closed = true; if (db) db.close(); db = null; }
    return {list, put, delete: deleteRecord, clear, status, estimate, close, pendingImport, snapshotForBackup, prepareImportBatch, commitImportBatch:token => finishImportBatch(token, false), rollbackImportBatch:token => finishImportBatch(token, true)};
  }
  return {createMediaStore, MediaStorageError, SCHEMA_VERSION, DATABASE_VERSION};
});
