/* Silvio / VELLEN V24. Pure presentation for an explicit instrument choice.
   No account, storage, device, microphone or network access in this module. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SVInstrumentProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const copy = {
    zh: {
      chooseTitle: '你今天用哪一把琴？', chooseDescription: '选好乐器，让练习入口更适合你。之后可随时在设置中切换。',
      electric: '电子小提琴', acoustic: '原声小提琴', change: '切换乐器', continue: '进入我的琴房', cancel: '暂不切换',
      saved: '已切换乐器，原有记录仍然保留。', memoryOnly: '当前浏览器无法保存选择，本次使用仍然有效。', busy: '请先停止播放或保存录制，再切换乐器。',
      inputs: '声音输入', creative: '创作工具', shared: '曲库、教学、伴奏和录音两种乐器都可使用。', current: '当前乐器', selectionRequired: '请先选择一种小提琴。',
      electricShort: '连接设备，探索你的声音。', acousticShort: '从调音开始，专注每一根弦。',
      electricDetail: '设备连接、琴端参数适配与 MIDI 创作优先展示。', acousticDetail: '调音、麦克风跟练与录音优先展示。',
      sameRecords: '切换不会删除曲目收藏、练习记录或本机录音。', noAccount: '选择乐器无需登录，也不会自动连接设备。',
      device: '连接设备', tones: '音色工作台', midi: 'MIDI 工作台', tuner: '调音器', practice: '跟奏练习', studio: '录音创作',
      electricNote: 'BLE-MIDI 传输演奏指令，不传输琴的原声。琴端参数控制需要匹配的协议适配器；录下琴声可用麦克风或兼容的音频接口。',
      acousticNote: '使用手机或电脑的麦克风即可调音、跟练和录音。麦克风只在你点击开始并授权后启用。',
      inputTitle: '让 App 听见你的琴声', inputIntro: '不需要蓝牙配对。先准备好麦克风，再选择你想做的练习。',
      inputStep1: '找一个安静的位置', inputStep1Detail: '让麦克风朝向琴，避免扬声器声音盖过演奏。',
      inputStep2: '点击功能中的开始按钮', inputStep2Detail: '在调音、跟奏或录音页面主动开启麦克风；浏览器可能会询问权限。',
      inputStep3: '试听后调整位置', inputStep3Detail: '先录一小段回听。声音过小或失真时，调整麦克风距离与输入音量。',
      practiceElectric: '示范可直接聆听；当前跟奏反馈使用麦克风。BLE-MIDI 请在 MIDI 工作台使用，琴声录制需要音频输入。',
      practiceAcoustic: '先听示范，再开启麦克风跟奏。建议使用耳机，减少伴奏被麦克风重复收录。',
      lessonsElectric: '按动画练习运弓与指法；当前跟练反馈使用麦克风音高，不读取琴身动作。',
      lessonsAcoustic: '按动画练习运弓与指法；开启麦克风后可参考音高反馈，不提供动作评分。',
      studioElectric: '录琴声请选择麦克风或系统可用的音频输入。BLE-MIDI 只有音符指令；应用合成音可单独录制。',
      studioAcoustic: '选择麦克风录制演奏，或选择应用合成音制作练习音轨。先录一小段检查声音。',
      tonesAcoustic: '这里调整 App 的合成音与效果，不会改变原声小提琴本身的音色。',
      midiAcoustic: '可编辑、导入和导出 MIDI，或连接兼容的 MIDI 设备。麦克风琴声不会自动转换成 MIDI。'
    },
    en: {
      chooseTitle: 'Which violin are you playing?', chooseDescription: 'Choose your instrument to put the right tools first. You can change it in Settings at any time.',
      electric: 'Electric violin', acoustic: 'Acoustic violin', change: 'Change instrument', continue: 'Open my studio', cancel: 'Keep my choice',
      saved: 'Instrument updated. Your existing records are preserved.', memoryOnly: 'This browser cannot save your choice. It will still apply for this visit.', busy: 'Stop playback or save your recording before changing instruments.',
      inputs: 'Audio input', creative: 'Creative tools', shared: 'Library, lessons, backing tracks and recording work with either violin.', current: 'Your instrument', selectionRequired: 'Choose a violin first.',
      electricShort: 'Connect your instrument. Explore your sound.', acousticShort: 'Tune your strings. Find your focus.',
      electricDetail: 'Device connections, supported instrument controls and MIDI tools come first.', acousticDetail: 'Tuning, microphone practice and recording come first.',
      sameRecords: 'Changing instruments keeps your favourites, practice history and local recordings.', noAccount: 'No sign-in required. Choosing an instrument does not connect a device.',
      device: 'Connect a device', tones: 'Sounds', midi: 'MIDI studio', tuner: 'Tuner', practice: 'Play along', studio: 'Record & create',
      electricNote: 'BLE-MIDI carries performance messages, not your violin’s audio. Instrument controls need a matching protocol adapter. Record the violin through a microphone or a compatible audio interface.',
      acousticNote: 'Use your phone or computer microphone to tune, practise and record. The microphone starts only after you choose a feature and grant permission.',
      inputTitle: 'Let the app hear your violin', inputIntro: 'No Bluetooth pairing needed. Prepare your microphone, then choose what to practise.',
      inputStep1: 'Find a quiet place', inputStep1Detail: 'Point the microphone towards your violin and keep speaker playback from overpowering it.',
      inputStep2: 'Start from the tool you need', inputStep2Detail: 'Enable the microphone in Tuner, Play along or Record. Your browser may ask for permission.',
      inputStep3: 'Listen and adjust', inputStep3Detail: 'Record a short test. If it is too quiet or distorted, adjust the microphone distance and input level.',
      practiceElectric: 'Listen to a demo directly. Current play-along feedback uses the microphone. Use BLE-MIDI in MIDI studio; recording the violin requires audio input.',
      practiceAcoustic: 'Listen first, then start microphone practice. Headphones help keep backing playback out of the microphone.',
      lessonsElectric: 'Follow the bowing and fingering animations. Current feedback uses microphone pitch and does not read instrument motion.',
      lessonsAcoustic: 'Follow the bowing and fingering animations. Microphone feedback can guide pitch; it does not grade your movements.',
      studioElectric: 'To record your violin, use a microphone or an available system audio input. BLE-MIDI carries note messages only. App synth audio can be recorded separately.',
      studioAcoustic: 'Choose the microphone for your performance, or app synth audio to create a practice track. Record a short sound check first.',
      tonesAcoustic: 'These controls change the app’s synth sound and effects, not the sound of your acoustic violin.',
      midiAcoustic: 'Edit, import and export MIDI, or connect a compatible MIDI device. Microphone audio is not automatically converted to MIDI.'
    },
    ja: {
      chooseTitle: '今日はどちらのバイオリン？', chooseDescription: '楽器に合わせて、よく使う機能を見つけやすくします。設定からいつでも変更できます。',
      electric: '電子バイオリン', acoustic: 'アコースティックバイオリン', change: '楽器を変更', continue: 'スタジオを開く', cancel: '変更しない',
      saved: '楽器を変更しました。これまでの記録は残ります。', memoryOnly: 'このブラウザでは選択を保存できません。今回の利用中は適用されます。', busy: '再生を停止するか録音を保存してから、楽器を変更してください。',
      inputs: '音声入力', creative: '創作ツール', shared: '曲ライブラリ、レッスン、伴奏、録音はどちらの楽器でも使えます。', current: '使用する楽器', selectionRequired: 'バイオリンを選んでください。',
      electricShort: '楽器をつないで、自分の音を探す。', acousticShort: '調弦して、一弦ずつ丁寧に。',
      electricDetail: '機器の接続、対応する楽器設定、MIDI 創作を優先表示。', acousticDetail: 'チューナー、マイクでの練習、録音を優先表示。',
      sameRecords: '変更しても、お気に入り、練習履歴、端末内の録音は消えません。', noAccount: 'ログインは不要です。楽器を選ぶだけでは機器に接続しません。',
      device: '機器を接続', tones: '音色', midi: 'MIDI スタジオ', tuner: 'チューナー', practice: '合わせて練習', studio: '録音・創作',
      electricNote: 'BLE-MIDI が送るのは演奏情報で、楽器の音声ではありません。楽器の設定変更には対応プロトコルのアダプターが必要です。録音にはマイクか対応オーディオインターフェースを使います。',
      acousticNote: 'スマートフォンやパソコンのマイクで調弦、練習、録音ができます。マイクは開始操作と許可の後にだけ動作します。',
      inputTitle: 'バイオリンの音を App に届ける', inputIntro: 'Bluetooth のペアリングは不要です。マイクを準備して、練習する機能を選びましょう。',
      inputStep1: '静かな場所を選ぶ', inputStep1Detail: 'マイクを楽器に向け、スピーカーの音が演奏を覆わないようにします。',
      inputStep2: '使いたい機能で開始する', inputStep2Detail: 'チューナー、合わせて練習、録音からマイクを起動します。ブラウザが許可を求める場合があります。',
      inputStep3: '録音を聴いて調整する', inputStep3Detail: '短く録音して確認します。音が小さい、または割れる場合は、距離と入力音量を調整します。',
      practiceElectric: 'お手本はそのまま聴けます。現在の練習フィードバックはマイクを使います。BLE-MIDI は MIDI スタジオで利用し、楽器の録音には音声入力が必要です。',
      practiceAcoustic: 'お手本を聴いてからマイクで練習しましょう。伴奏の回り込みを減らすため、イヤホンの使用をおすすめします。',
      lessonsElectric: '運弓と運指のアニメーションで練習します。現在のフィードバックはマイクの音高を使い、楽器の動きは読み取りません。',
      lessonsAcoustic: '運弓と運指のアニメーションで練習します。マイクで音高を確認できますが、動作の採点は行いません。',
      studioElectric: '楽器の録音にはマイクかシステムで使える音声入力を選びます。BLE-MIDI は音符情報のみです。App の合成音は別に録音できます。',
      studioAcoustic: '演奏にはマイク、練習トラックの制作には App の合成音を選びます。まず短く録音して音を確認しましょう。',
      tonesAcoustic: 'App の合成音とエフェクトを調整します。原声バイオリン自体の音色は変わりません。',
      midiAcoustic: 'MIDI の編集・読み込み・書き出しや、対応 MIDI 機器の接続ができます。マイクの音声は自動で MIDI になりません。'
    },
    de: {
      chooseTitle: 'Welche Geige spielst du?', chooseDescription: 'Wähle dein Instrument, damit die passenden Werkzeuge zuerst erscheinen. Du kannst die Auswahl jederzeit in den Einstellungen ändern.',
      electric: 'E-Violine', acoustic: 'Akustische Violine', change: 'Instrument wechseln', continue: 'Mein Studio öffnen', cancel: 'Auswahl beibehalten',
      saved: 'Instrument gewechselt. Deine bisherigen Daten bleiben erhalten.', memoryOnly: 'Dieser Browser kann die Auswahl nicht speichern. Sie gilt trotzdem für diesen Besuch.', busy: 'Stoppe die Wiedergabe oder speichere die Aufnahme, bevor du das Instrument wechselst.',
      inputs: 'Audioeingang', creative: 'Kreativwerkzeuge', shared: 'Bibliothek, Lektionen, Begleitung und Aufnahme stehen beiden Instrumenten zur Verfügung.', current: 'Dein Instrument', selectionRequired: 'Wähle zuerst eine Violine aus.',
      electricShort: 'Verbinde dein Instrument. Entdecke deinen Klang.', acousticShort: 'Saiten stimmen. In Ruhe üben.',
      electricDetail: 'Geräteverbindung, unterstützte Instrumenteinstellungen und MIDI stehen im Vordergrund.', acousticDetail: 'Stimmen, Üben mit Mikrofon und Aufnehmen stehen im Vordergrund.',
      sameRecords: 'Beim Wechsel bleiben Favoriten, Übungsverlauf und lokale Aufnahmen erhalten.', noAccount: 'Keine Anmeldung nötig. Die Auswahl verbindet noch kein Gerät.',
      device: 'Gerät verbinden', tones: 'Klänge', midi: 'MIDI-Studio', tuner: 'Stimmgerät', practice: 'Mitspielen', studio: 'Aufnahme & Kreation',
      electricNote: 'BLE-MIDI überträgt Spielinformationen, keinen Geigenklang. Instrumenteinstellungen brauchen einen passenden Protokolladapter. Nimm die Geige über ein Mikrofon oder ein kompatibles Audiointerface auf.',
      acousticNote: 'Nutze das Mikrofon von Handy oder Computer zum Stimmen, Üben und Aufnehmen. Es startet erst nach deiner Aktion und Freigabe.',
      inputTitle: 'Lass die App deine Geige hören', inputIntro: 'Keine Bluetooth-Kopplung nötig. Bereite das Mikrofon vor und wähle deine Übung.',
      inputStep1: 'Einen ruhigen Platz finden', inputStep1Detail: 'Richte das Mikrofon auf die Geige. Lautsprecher sollten dein Spiel nicht übertönen.',
      inputStep2: 'Im gewünschten Werkzeug starten', inputStep2Detail: 'Starte das Mikrofon im Stimmgerät, beim Mitspielen oder bei der Aufnahme. Der Browser kann nach einer Freigabe fragen.',
      inputStep3: 'Anhören und anpassen', inputStep3Detail: 'Nimm einen kurzen Test auf. Ist er zu leise oder verzerrt, passe Mikrofonabstand und Eingangspegel an.',
      practiceElectric: 'Demos kannst du direkt anhören. Die aktuelle Übungsrückmeldung nutzt das Mikrofon. BLE-MIDI gehört ins MIDI-Studio; für Geigenaufnahmen brauchst du einen Audioeingang.',
      practiceAcoustic: 'Erst zuhören, dann mit Mikrofon üben. Kopfhörer helfen, die Begleitung aus der Mikrofonaufnahme fernzuhalten.',
      lessonsElectric: 'Folge den Animationen für Bogenführung und Fingersatz. Die aktuelle Rückmeldung nutzt die Tonhöhe am Mikrofon und erfasst keine Instrumentbewegung.',
      lessonsAcoustic: 'Folge den Animationen für Bogenführung und Fingersatz. Das Mikrofon gibt Hinweise zur Tonhöhe, bewertet aber keine Bewegungen.',
      studioElectric: 'Wähle für Geigenaufnahmen ein Mikrofon oder einen verfügbaren System-Audioeingang. BLE-MIDI liefert nur Noteninformationen. App-Synthesizerklänge lassen sich separat aufnehmen.',
      studioAcoustic: 'Wähle das Mikrofon für dein Spiel oder den App-Synthesizer für einen Übungstrack. Mache zuerst einen kurzen Klangtest.',
      tonesAcoustic: 'Hier änderst du Synthesizerklang und Effekte der App, nicht den Klang deiner akustischen Geige.',
      midiAcoustic: 'Bearbeite, importiere und exportiere MIDI oder verbinde ein kompatibles MIDI-Gerät. Mikrofonton wird nicht automatisch in MIDI umgewandelt.'
    }
  };
  const routes = Object.freeze(['home','library','practice','studio','performance','midi','tones','tuner','metronome','device','learn','lessons','community','shop','profile']);
  const acousticRoutes = Object.freeze(['home','library','practice','tuner','metronome','learn','lessons','studio','device','community','shop','profile','performance','midi','tones']);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid = type => type === 'electric' || type === 'acoustic';
  const typeOf = type => valid(type) ? type : 'electric';
  function hasChoice(prefs) { return !!prefs && typeof prefs === 'object' && prefs.instrumentChoiceVersion === 1 && valid(prefs.instrument); }
  function text(lang, key) {
    const dictionary = Object.prototype.hasOwnProperty.call(copy, lang) ? copy[lang] : copy.en;
    return Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : '';
  }
  function arrow() { return '<svg class="svip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'; }
  function art(type) {
    const electric = typeOf(type) === 'electric';
    // Original front-view geometry. The open frame follows the owner's white violin
    // photographs; the acoustic outline uses full upper/lower bouts and four corners.
    // Layered colour paths avoid shared SVG paint IDs across repeated app instances.
    const electricBody = 'M145 253C132 244 119 252 122 267L130 509 91 509C67 505 55 518 59 546 64 590 91 626 131 637 179 651 231 625 253 588 273 555 268 521 247 488L223 454C206 430 199 411 204 391 207 380 215 372 224 374 211 365 202 345 203 323 204 290 183 258 166 255Z M173 276C193 287 193 310 190 328 187 351 195 370 201 381 186 397 181 414 183 432L169 439 166 279Z M169 460C184 445 198 457 210 477 224 499 249 521 249 551 249 584 224 615 189 623 147 633 109 613 88 583 78 569 72 552 77 536L121 536C139 536 146 525 146 510L147 475Z';
    const acousticBody = 'M147 254C120 240 93 251 88 276 84 296 92 315 108 330L98 339C119 346 129 367 127 390 125 414 112 434 91 442L102 451C77 471 61 497 63 531 65 591 104 635 162 639 220 636 260 591 262 532 264 498 248 473 224 451L235 442C214 435 201 414 198 390 196 368 206 348 227 339L217 330C234 312 241 293 236 276 230 251 205 240 177 254Z';
    const body = electric
      ? '<path class="svvi-frame-depth" d="'+electricBody+'" fill-rule="evenodd" transform="translate(1 4)"/>'+
        '<path class="svvi-frame" data-part="open-frame" d="'+electricBody+'" fill-rule="evenodd"/>'+
        '<path class="svvi-frame-shade" d="m132 276 8 231c1 15-9 20-20 20H81c-3 14 5 36 17 50-14-11-24-28-28-48h49c13 0 16-10 15-22zM232 491c20 24 31 49 25 76-8 32-31 51-50 59 22-17 39-43 40-67 3-30-8-49-15-68Z"/>'+
        '<path class="svvi-frame-glint" d="M140 268 142 505M91 519H126M173 264c28 16 36 44 28 71M78 585c25 37 62 55 102 50"/>'
      : '<path class="svvi-rib" d="'+acousticBody+'" transform="translate(0 4)"/>'+
        '<path class="svvi-wood" data-part="acoustic-body" d="'+acousticBody+'"/>'+
        '<path class="svvi-wood-face" d="M146 261C123 251 102 261 98 280 94 296 103 316 118 330 113 341 110 343 111 344 132 359 140 380 134 403 129 424 117 440 109 449 83 470 73 500 75 531 77 585 111 626 162 629 215 626 250 584 250 531 252 502 240 474 216 451 209 441 197 424 191 403 186 380 194 359 215 344L207 331C223 315 231 295 226 280 222 260 202 251 179 261Z"/>'+
        '<path class="svvi-wood-centre" d="M150 262c-5 54 4 102-3 143-6 44-5 84-1 120 3 36 1 73 0 100l17 4 17-3c-4-43-2-73 1-106 3-38-7-76-8-112-2-43 3-104 1-146Z"/>'+
        '<path class="svvi-purfling" d="M144 260C120 249 100 260 96 278 92 297 101 316 115 330L105 338C126 350 138 370 134 393 130 418 118 437 104 444L111 452C86 473 72 500 73 531 75 586 111 628 162 631 215 628 252 587 252 532 254 501 239 474 214 452L221 444C206 437 194 418 191 393 187 371 199 351 220 339L210 331C225 315 233 297 228 278 223 259 202 249 179 260"/>'+
        '<g class="svvi-grain"><path d="M110 271c-8 20-3 32 3 43m12-50c-6 23-3 45 1 64m15-67c-6 52 1 77-2 100m-17 94c-22 39-24 94-10 134m15-135c-15 50-13 112-1 157m12-160c-8 52-4 126 0 166m51-356c5 24 3 51 0 71m15-68c10 23 8 43 1 56m-10 136c11 43 14 107 3 151m8-145c19 40 21 97 7 130m9-122c18 34 22 75 12 105"/><path class="svvi-grain-light" d="M118 269c-5 14-3 31 0 42m17 150c-10 38-8 116-3 142m66-331c4 21 3 37 0 50m13 148c16 43 15 85 7 114"/></g>'+
        '<g class="svvi-fholes" data-part="f-holes"><path d="M125 400c-8-2-12 6-8 11 4 6 9-1 6-4 11 9-12 41-13 58-1 10 4 18 13 18 8-1 10-10 4-12-5-2-8 5-4 7-10-1-9-12-5-23 8-20 22-52 7-55Z"/><path d="M200 400c8-2 12 6 8 11-4 6-9-1-6-4-11 9 12 41 13 58 1 10-4 18-13 18-8-1-10-10-4-12 5-2 8 5 4 7 10-1 9-12 5-23-8-20-22-52-7-55Z"/><path d="m112 444 14-4m72 0 14 4"/></g>';
    const pegs = [
      [137,111,'M120 107C111 100 96 104 97 115 98 127 111 129 122 122Z'],
      [137,137,'M119 133C107 125 94 131 96 143 98 153 110 155 121 147Z'],
      [182,100,'M199 94C211 88 222 96 219 108 217 117 207 119 198 112Z'],
      [182,126,'M200 120C212 114 224 123 220 135 218 145 206 146 199 137Z']
    ].map(([x,y,d],i)=>'<g class="svvi-peg" data-peg="'+i+'"><path class="svvi-peg-shaft" d="M'+x+' '+y+'h'+(i<2?-21:21)+'"/><path class="svvi-ebony" d="'+d+'"/><path class="svvi-peg-glint" d="'+(i<2?'M102 '+(y+2)+'q4 7 12 4':'M205 '+(y-2)+'q7 1 8 7')+'"/></g>').join('');
    const strings = [0,1,2,3].map(i=>'<path class="svip-strings svvi-string" data-violin-string="'+['G','D','A','E'][i]+'" d="M'+(152+i*7)+' 128 '+(142+i*13)+' 480 '+(149+i*8)+' 557"/>').join('');
    return '<svg class="svip-violin svip-violin-'+(electric?'electric':'acoustic')+' svvi-illustration" data-sv-instrument="'+(electric?'open-frame':'acoustic')+'-v25" viewBox="0 0 320 680" fill="none" aria-hidden="true" focusable="false">'+
      '<ellipse class="svvi-ground" cx="163" cy="655" rx="78" ry="7"/>'+
      '<g class="svvi-bow" data-part="bow"><path class="svvi-bow-stick" d="M286 47c-9 137-7 357-7 575l-7 13"/><path class="svvi-bow-hair" d="M282 55 275 622"/><path class="svvi-bow-tip" d="m286 47 5 11-9-3Z"/><path class="svvi-bow-frog" d="m273 603 10 1-1 22-10-1Z"/><path class="svvi-bow-metal" d="M272 607h10m-10 14h10m-7 6v10"/></g>'+
      '<g class="svvi-instrument" transform="rotate(-4 160 340)">'+body+
      '<path class="svvi-neck '+(electric?'svvi-neck-white':'svvi-neck-maple')+'" data-part="neck" d="M147 118h29l9 246-47 2Z"/>'+
      pegs+
      '<path class="svvi-pegbox '+(electric?'svvi-neck-white':'svvi-neck-maple')+'" data-part="pegbox" d="M144 83h35l2 64-37 1Z"/><path class="svvi-pegbox-well" d="m153 86 17 1 2 55-21 1Z"/><path class="svvi-pegbox-detail" d="M150 101h22m-21 13h21m-20 15h20"/>'+
      '<path class="svvi-scroll '+(electric?'svvi-neck-white':'svvi-neck-maple')+'" data-part="scroll" d="M148 91 142 76C130 76 128 62 135 56 131 42 143 32 156 35 164 25 180 34 180 46 191 51 190 68 179 74L176 91Z"/><path class="svvi-scroll-carving" d="M150 81c-4-14-11-21-6-32 5-11 20-10 24 0 4 10-7 17-13 11-7-6 2-12 5-6m-4-20c-3 8-2 14 2 17m-12 35h29"/>'+
      '<path class="svvi-ebony svvi-fingerboard" data-part="fingerboard" d="m148 132 29-1 11 278-51 3Z"/><path class="svvi-board-edge" d="m149 135-9 270m43 0-9-270"/><path class="svvi-nut" d="m148 129 29-1v5l-29 1Z"/>'+
      '<path class="svvi-bridge-foot-shadow" d="M134 492h58v6h-58Z"/><path class="svvi-bridge" data-part="bridge" d="M138 483c2-8 7-13 14-14 8-2 18-2 25 0 7 2 11 6 13 14l-2 10h-9l-2-7-8 1-1 7h-10l-2-7-9-1-1 7h-10Z"/><path class="svvi-bridge-detail" d="M149 478q5 5 9 0m8 0q5 5 10 0m-15-3v6"/>'+
      '<path class="svvi-tailgut" d="M156 608v30m17-30v30"/><path class="svvi-ebony svvi-tailpiece" data-part="tailpiece" d="m144 535 38-1c4 17-3 34-8 46l-6 45h-13l-5-45c-5-12-11-29-6-45Z"/><path class="svvi-tail-glint" d="M148 541c0 14 3 27 8 38l5 38"/>'+
      strings+
      '<g class="svvi-string-winding">'+[0,1,2,3].map(i=>'<path stroke="'+['#9c9c86','#507288','#657f9f','#ad6474'][i]+'" d="M'+(147+i*9)+' 534 '+(149+i*8)+' 557"/>').join('')+'</g>'+
      '<g class="svvi-fine-tuners" data-part="fine-tuners">'+[0,1,2,3].map(i=>'<path d="M'+(149+i*8)+' 547v14"/><circle cx="'+(149+i*8)+'" cy="560" r="3"/>').join('')+'</g>'+
      '<path class="svvi-ebony svvi-chinrest" data-part="chinrest" d="M85 569c22-13 52-9 66 5l27 32c13 5 25 1 31 7 9 11-14 24-42 25-40 1-78-14-91-38-6-12-2-25 9-31Z"/><path class="svvi-chin-glint" d="M87 577c20-10 41-7 56 3M86 608c22 18 57 27 91 22"/>'+
      '<path class="svvi-endpin" d="M157 640h15l-2 8h-10Z"/>'+
      '</g></svg>';
  }
  function chooser({ lang = 'en', selected, required = true } = {}) {
    const t = key => escape(text(lang, key));
    const cards = ['electric','acoustic'].map(type => '<button type="button" class="svip-choice'+(selected===type?' is-selected':'')+'" data-action="choose-instrument" data-instrument="'+type+'" aria-pressed="'+(selected===type)+'"><span class="svip-choice-art">'+art(type)+'<span class="svip-choice-check" aria-hidden="true">'+(selected===type?'✓':'')+'</span></span><span class="svip-choice-copy"><strong>'+t(type)+'</strong><span>'+t(type+'Short')+'</span><small>'+t(type+'Detail')+'</small></span></button>').join('');
    return '<section class="svip svip-chooser" data-i18n-ignore aria-labelledby="svip-choose-title"><header class="svip-chooser-header"><span class="svip-kicker">'+t('current')+'</span><h2 id="svip-choose-title">'+t('chooseTitle')+'</h2><p>'+t('chooseDescription')+'</p></header><div class="svip-choices" role="group" aria-label="'+t('chooseTitle')+'">'+cards+'</div><p class="svip-shared">'+t('shared')+'</p><p class="svip-preserve">'+t('sameRecords')+'</p><div class="svip-chooser-actions">'+(!required?'<button type="button" class="svip-secondary" data-action="cancel-instrument">'+t('cancel')+'</button>':'')+'<button type="button" class="svip-primary" data-action="commit-instrument"'+(!valid(selected)?' disabled':'')+'>'+t('continue')+arrow()+'</button></div><p class="svip-no-account">'+t('noAccount')+'</p></section>';
  }
  function links(lang, type) {
    const ids = type === 'acoustic' ? ['tuner','practice','studio'] : ['device','tones','midi'];
    return '<div class="svip-shortcuts">'+ids.map(id=>'<button type="button" data-go="'+id+'"><span>'+escape(text(lang,id))+'</span>'+arrow()+'</button>').join('')+'</div>';
  }
  function homePanel({ lang = 'en', type } = {}) {
    type = typeOf(type);
    const t = key => escape(text(lang,key));
    return '<section class="svip svip-home" data-i18n-ignore><div class="svip-home-heading"><div class="svip-mini-art">'+art(type)+'</div><div><span class="svip-kicker">'+t('current')+'</span><h3>'+t(type)+'</h3><p>'+t(type+'Short')+'</p></div><button type="button" class="svip-change" data-action="instrument-settings">'+t('change')+'</button></div>'+links(lang,type)+'<p class="svip-shared">'+t('shared')+'</p><p class="svip-preserve">'+t('sameRecords')+'</p></section>';
  }
  function settingsPanel({ lang = 'en', type } = {}) {
    type = typeOf(type);
    const t = key => escape(text(lang,key));
    return '<section class="svip svip-settings" data-i18n-ignore><div class="svip-settings-heading"><div><span class="svip-kicker">'+t('current')+'</span><h3>'+t(type)+'</h3></div><button type="button" class="svip-change" data-action="instrument-settings">'+t('change')+'</button></div><p>'+t(type+'Note')+'</p><p class="svip-preserve">'+t('sameRecords')+'</p></section>';
  }
  function acousticInputs({ lang = 'en' } = {}) {
    const t = key => escape(text(lang,key));
    return '<section class="svip svip-inputs" data-i18n-ignore><header class="svip-inputs-heading"><div><span class="svip-kicker">'+t('inputs')+'</span><h2>'+t('inputTitle')+'</h2><p>'+t('inputIntro')+'</p></div><div class="svip-inputs-art">'+art('acoustic')+'</div></header><ol class="svip-input-steps">'+[1,2,3].map(n=>'<li><span class="svip-step-number" aria-hidden="true">0'+n+'</span><div><h3>'+t('inputStep'+n)+'</h3><p>'+t('inputStep'+n+'Detail')+'</p></div></li>').join('')+'</ol>'+links(lang,'acoustic')+'<p class="svip-input-note">'+t('acousticNote')+'</p></section>';
  }
  function pageHint({ lang = 'en', type, page } = {}) {
    type = typeOf(type);
    const suffix = type === 'electric' ? 'Electric' : 'Acoustic';
    const key = ['practice','lessons','studio'].includes(page) ? page+suffix : type==='acoustic'&&['tones','midi'].includes(page) ? page+'Acoustic' : '';
    if (!key) return '';
    return '<aside class="svip svip-page-hint" data-i18n-ignore><strong>'+escape(text(lang,type))+'</strong><span>'+escape(text(lang,key))+'</span></aside>';
  }
  function navIds(type) { return (type === 'acoustic' ? acousticRoutes : routes).slice(); }
  return Object.freeze({ valid, hasChoice, text, chooser, settingsPanel, homePanel, acousticInputs, pageHint, navIds, art });
});
