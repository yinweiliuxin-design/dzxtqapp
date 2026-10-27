/* Original SmartVio teaching exercises, 2026. No third-party lesson data.
 * These animated demonstrations have not been reviewed by a violin teacher.
 * The six introductory app-navigation steps and previous courses remain intact. */
(function (global) {
  'use strict';
  const L=(zh,en,ja,de)=>({zh,en,ja,de});
  const title=[
    L('先放松，再出发','Settle in before you play','力を抜いて始めよう','Entspannt beginnen'),
    L('让一根空弦唱四拍','Let an open string sing','開放弦を4拍伸ばそう','Vier Schläge auf einer leeren Saite'),
    L('认识第一把位的手指','Meet your first-position fingers','第1ポジションの指を知ろう','Die Finger in der ersten Lage'),
    L('换弦时，节奏不停','Keep the beat across strings','弦を替えても拍を保とう','Im Takt die Saite wechseln'),
    L('拉出第一句小旋律','Play your first little melody','初めての短いメロディー','Deine erste kleine Melodie'),
    L('进阶选修：轻柔揉弦','Optional: a gentle vibrato','任意の応用：やさしいビブラート','Optional: sanftes Vibrato')
  ];
  const summaries=[
    L('先看示意，找到舒适的肩颈与持琴位置。图中手指和弓向是参考，不会检测你的姿势。','Watch the illustration and find a comfortable shoulder and neck position. The finger and bow cues do not assess your posture.','図を見て肩と首が楽な構えを探します。指と弓の表示は姿勢を判定するものではありません。','Finde mit der Illustration eine bequeme Schulter- und Halsposition. Finger- und Bogenhinweise bewerten deine Haltung nicht.'),
    L('从 D 弦、A 弦开始。手腕放松，用弓中段拉出均匀长音。','Start on D and A. Relax your wrist and use the middle of the bow for an even long tone.','D線とA線から始めます。手首を楽にし、弓の中ほどで均一な長い音を出します。','Beginne auf D und A. Halte das Handgelenk locker und spiele einen gleichmäßigen Ton in der Bogenmitte.'),
    L('在 A 弦依次练空弦、1、2、3、4 指。2 指偏高；落指轻，不要捏紧琴颈。','On A, try open string then fingers 1, 2, 3 and 4. Use a high second finger and avoid gripping the neck.','A線で開放弦から1・2・3・4の指へ。2の指は高めに置き、ネックを握り込まないようにします。','Spiele auf A die leere Saite und dann Finger 1 bis 4. Der zweite Finger steht hoch; umklammere den Hals nicht.'),
    L('先只用空弦换弦，再加手指。用较小的右臂动作，保持每拍一样长。','Cross on open strings first, then add fingers. Use small right-arm changes and keep each beat even.','まず開放弦で移弦し、その後に指を加えます。右腕の動きを小さくして拍を均等に保ちます。','Wechsle zuerst auf leeren Saiten, dann mit Fingern. Bewege den rechten Arm nur wenig und halte die Schläge gleichmäßig.'),
    L('这是为本应用原创的短句《晨光四弦》。先听，再分两句慢练，最后连起来。','This original app exercise is called Four Strings at Dawn. Listen, practise its two phrases slowly, then join them.','アプリオリジナルの短い練習曲「夜明けの四弦」です。聴いてから2つのフレーズをゆっくり練習し、つなげます。','Diese Originalübung heißt Vier Saiten im Morgenlicht. Höre zu, übe die zwei Phrasen langsam und verbinde sie.'),
    L('不影响入门进度的选修课。稳定持琴、运弓与音准后再尝试；先放松慢摆动，疼痛或紧张时停止。动画只示意动作，不评定揉弦质量。','An optional lesson after steady posture, bowing and intonation. Start with a relaxed slow rocking motion; stop if painful or tense. The animation does not grade vibrato.','姿勢・運弓・音程が安定してからの任意講座です。力を抜きゆっくり揺らし、痛みや緊張があれば止めます。動画は動きの例で、品質を採点しません。','Eine optionale Lektion nach sicherer Haltung, Bogenführung und Intonation. Beginne mit lockerem, langsamem Wiegen; stoppe bei Schmerzen oder Spannung. Die Animation bewertet Vibrato nicht.')
  ];
  const stages=[
    {id:'see',title:L('先看一次','Watch first','まず見る','Zuerst ansehen'),text:L('按播放，看清当前的弦、手指与弓向。先不用跟着拉。','Press play and notice the active string, finger and bow direction. Watch once before joining in.','再生して弦・指・弓の方向を確認します。最初は見るだけで大丈夫です。','Drücke Wiedergabe und achte auf Saite, Finger und Bogenrichtung. Schau zunächst nur zu.')},
    {id:'slow',title:L('放慢跟练','Follow slowly','ゆっくり合わせる','Langsam mitspielen'),text:L('把速度调到 0.5×，一次只留意一个动作。基础示范使用小提琴采样音。','Choose 0.5× and focus on one movement at a time. The demonstration uses violin note samples.','0.5×にして一度に一つの動作に集中します。音の手本にはバイオリンの単音サンプルを使います。','Wähle 0,5× und konzentriere dich auf eine Bewegung. Das Hörbeispiel verwendet Violin-Einzeltonsamples.')},
    {id:'loop',title:L('难点练两遍','Repeat one small section','難しいところを繰り返す','Einen kurzen Abschnitt wiederholen'),text:L('在需要的起点设 A、终点设 B，打开循环。放松后再继续。','Set A at the start and B at the end of a short section, then enable the loop. Relax before repeating.','短い区間の始点をA、終点をBにしてループします。力を抜いて繰り返しましょう。','Setze A an den Anfang und B ans Ende eines kurzen Abschnitts und aktiviere die Schleife. Bleibe dabei locker.')},
    {id:'solo',title:L('自己拉一遍','Try it on your own','自分で弾いてみる','Selbst ausprobieren'),text:L('选择静音跟练，或开启麦克风的逐音等待。音准提示只作单音参考；无需登录。','Choose silent practice or microphone wait-for-note mode. Pitch feedback is a single-note reference. No sign-in is needed.','無音練習、またはマイクの音待ちモードを選びます。音程表示は単音の参考です。ログインは不要です。','Wähle stummes Üben oder den Mikrofonmodus, der auf den Ton wartet. Die Tonhöhenanzeige dient als Einzeltonreferenz. Keine Anmeldung nötig.')},
    {id:'review',title:L('回听，再前进一步','Listen back, then move on','聴き直して次へ','Nachhören und weitergehen'),text:L('去录音创作中心录下一小段，听声音是否平稳。已练习状态由你确认，不等于通过考试。','Record a short phrase in Create and listen for a steady sound. You mark your own practice progress; this is not an exam result.','録音創作で短いフレーズを録り、音が安定しているか聴きます。練習済みは自己確認で、試験の合否ではありません。','Nimm im Aufnahmebereich eine kurze Phrase auf und höre auf einen stabilen Klang. Du bestätigst den Übungsfortschritt selbst; dies ist keine Prüfungsnote.')}
  ];
  const ids=['settle','open-strings','first-fingers','crossing','dawn-melody','vibrato'];
  // MIDI, string, finger, beats. Original phrases, with explicit string choice.
  const phrases=[
    [[62,'D',0,4],[69,'A',0,4],[62,'D',0,4],[69,'A',0,4]],
    [[62,'D',0,4],[62,'D',0,4],[69,'A',0,4],[69,'A',0,4],[62,'D',0,4],[69,'A',0,4]],
    [[69,'A',0,2],[71,'A',1,2],[73,'A',2,2],[74,'A',3,2],[76,'A',4,2],[74,'A',3,2],[73,'A',2,2],[71,'A',1,2],[69,'A',0,4]],
    [[62,'D',0,2],[69,'A',0,2],[62,'D',0,1],[69,'A',0,1],[62,'D',0,2],[64,'D',1,2],[71,'A',1,2],[64,'D',1,1],[71,'A',1,1],[69,'A',0,2]],
    [[62,'D',0,1],[66,'D',2,1],[69,'A',0,2],[71,'A',1,1],[69,'A',0,1],[67,'D',3,2],[66,'D',2,1],[64,'D',1,1],[62,'D',0,2],[64,'D',1,1],[66,'D',2,1],[69,'A',0,2],[74,'A',3,2],[71,'A',1,2],[69,'A',0,4]],
    [[71,'A',1,4],[71,'A',1,4],[74,'A',3,4],[74,'A',3,4]]
  ];
  const lessons=ids.map((id,index)=>{
    const bpm=index===4?72:60,beat=60/bpm;let time=0;
    const events=phrases[index].map(([midi,string,finger,beats],i)=>{const start=time;time+=beats*beat;return {id:id+'-note-'+(i+1),start,end:time,midi,string,finger,bow:i%2?'up':'down',vibrato:index===5&&i%2===1};});
    return {id,version:1,title:title[index],summary:summaries[index],order:index+1,level:index===5?'optional':'beginner',duration:time,bpm,steps:stages.map(step=>JSON.parse(JSON.stringify(step))),events,rights:{status:'original',note:'Original SmartVio exercise notes, bilingual-expanded lesson text and vector movement cues. No competitor code, sheet music, models or lesson media. Audio note samples use the existing separately attributed CC0 VSCO 2 CE library.'},media:{kind:'animation'},reviewStatus:'draft'};
  });
  const api={lessons};
  if(typeof module==='object'&&module.exports)module.exports=api;
  global.SVLessonData=api;
})(typeof window!=='undefined'?window:globalThis);
