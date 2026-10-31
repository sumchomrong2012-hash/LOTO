/* =====================================================================================
   Khmer Chess — LANGUAGE PACK  (Khmer = default, English)
   Works by translating the text on screen: every text the game shows is looked up here.
   To fix or add a word: edit the lists E(...) and R(...) below. Khmer wording should be checked by a native speaker.
   ===================================================================================== */
(function () {
  var LS = 'khmerLang', lang = 'km';
  try { var saved = localStorage.getItem(LS); if (saved === 'en' || saved === 'km') lang = saved; } catch (e) {}

  var exact = {}, templates = [];
  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  /* E(source(s), khmer, english)  — english omitted = the source itself */
  function E(src, km, en) { (Array.isArray(src) ? src : [src]).forEach(function (s) { exact[norm(s)] = { km: km, en: en === undefined ? (Array.isArray(src) ? src[0] : src) : en }; }); }
  /* R(template with {x}, khmer template, english template) — for texts that contain names / numbers */
  function R(tpl, km, en, strict) {
    var names = [], rx = tpl.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, function (m, n) { names.push(n); return '(.+?)'; });
    templates.push({ rx: new RegExp('^' + rx + '$'), names: names, km: km, en: en === undefined ? tpl : en, strict: !!strict });
  }

  /* ---------- colours / small words ---------- */
  E(['White', 'ស'], 'ស', 'White'); E(['Black', 'ខ្មៅ'], 'ខ្មៅ', 'Black');
  E('White (you)', 'ស (អ្នក)'); E('Black (you)', 'ខ្មៅ (អ្នក)'); E('Random', 'ចៃដន្យ'); E('None', 'គ្មាន'); E('No', 'ទេ'); E('OK', 'យល់ព្រម');
  E('Yes', 'បាទ/ចាស'); E('Close', 'បិទ'); E('Cancel', 'បោះបង់'); E('Back', 'ត្រឡប់ក្រោយ'); E('Accept', 'ទទួលយក'); E('Decline', 'បដិសេធ');
  E('Send', 'ផ្ញើ'); E('Add', 'បន្ថែម'); E('Join', 'ចូល'); E('Open', 'បើក'); E('View', 'មើល'); E('Refresh', 'ផ្ទុកឡើងវិញ'); E('Remove', 'ដកចេញ');
  E('Standard', 'ស្តង់ដារ'); E('Clear', 'សម្អាត'); E('Reset', 'កំណត់ឡើងវិញ'); E('Play', 'លេង'); E('Setup', 'រៀបចំ'); E('Switch', 'ប្តូរ'); E('Invite', 'អញ្ជើញ');
  E('Clear all', 'លុបទាំងអស់'); E('Opponent', 'គូប្រកួត'); E('System', 'ប្រព័ន្ធ'); E('You', 'អ្នក'); E('Draw', 'ស្មើ'); E('Checkmate', 'ម៉ាត់'); E('Stalemate', 'អស់ផ្លូវដើរ (ស្មើ)');
  E('Game over', 'ចប់ហ្គេម'); E('Game finished', 'ហ្គេមចប់'); E('Setup', 'រៀបចំ');

  /* ---------- header / modes / settings ---------- */
  E(['ហ្វឹកហាត់', 'Training'], 'ហ្វឹកហាត់', 'Training'); E(['អនឡាញ', 'Online'], 'អនឡាញ', 'Online'); E('AI', 'AI', 'AI');
  E(['ជជែក', 'Chat'], 'ជជែក', 'Chat'); E(['ការកំណត់', 'Settings'], 'ការកំណត់', 'Settings'); E(['ជូនដំណឹង', 'Alerts'], 'ជូនដំណឹង', 'Alerts'); E(['រូបរាង 3D', '3D'], 'រូបរាង 3D', '3D');
  E(['⚙ ការកំណត់ (Settings)'], '⚙ ការកំណត់', '⚙ Settings');
  E(['Training Mode', 'របៀបហ្វឹកហាត់'], 'របៀបហ្វឹកហាត់', 'Training Mode'); E(['AI Mode', 'របៀប AI'], 'របៀប AI', 'AI Mode'); E(['Online Mode', 'របៀបអនឡាញ'], 'របៀបអនឡាញ', 'Online Mode');
  E('Board Style', 'រចនាបថក្តារ'); E('Khmer Carved Board (picture)', 'ក្តារខ្មែរឆ្លាក់ (រូបភាព)'); E('Classic Colors', 'ពណ៌បុរាណ'); E('Sound', 'សំឡេង'); E('Sound on', 'បើកសំឡេង'); E('Sound off', 'បិទសំឡេង');
  E('Piece Style', 'រចនាបថកូនអុក'); E('Classic Unicode', 'និមិត្តសញ្ញាបុរាណ'); E('My Pieces (Wood)', 'កូនអុករបស់ខ្ញុំ (ឈើ)'); E('Gold & Silver', 'មាស និង ប្រាក់');
  E('Animation', 'ចលនា'); E('Slide Speed', 'ល្បឿនរំកិល'); E('Instant', 'ភ្លាមៗ'); E('Fast', 'លឿន'); E('Normal', 'ធម្មតា'); E('Slow', 'យឺត');
  E('Legal Move Hints', 'ជំនួយផ្លូវដើរ'); E('No hints', 'គ្មានជំនួយ'); E('Show hints (dots on possible moves)', 'បង្ហាញជំនួយ (ចំណុចលើផ្លូវដើរដែលអាចដើរបាន)');
  E('Drag & drop', 'អូស និង ទម្លាក់'); E('Timer', 'នាឡិកា'); E('⏱️ Timer', '⏱️ នាឡិកា'); E('Match Timer (total)', 'នាឡិកាប្រកួត (សរុប)'); E('Turn Timer (per move)', 'នាឡិកាវេន (ក្នុងមួយជំហាន)');
  E('No Timer', 'គ្មាននាឡិកា'); E('No timer (∞)', 'គ្មាននាឡិកា (∞)'); E('No turn limit', 'គ្មានកំណត់វេន');
  E('1 min', '1 នាទី'); E('3 min', '3 នាទី'); E('5 min', '5 នាទី'); E('10 min', '10 នាទី'); E('20 min', '20 នាទី'); E('30 min', '30 នាទី'); E('60 min', '60 នាទី'); E('No clock', 'គ្មាននាឡិកា');
  E('1 minute', '1 នាទី'); E('2 minutes', '2 នាទី'); E('3 minutes', '3 នាទី'); E('5 minutes', '5 នាទី'); E('30 seconds', '30 វិនាទី');
  E('Enable Counting Rule', 'បើកច្បាប់រាប់'); E('Counting: 64 moves', 'រាប់៖ 64 ជំហាន'); E('Game Controls', 'ការគ្រប់គ្រងហ្គេម'); E('↶ Undo', '↶ ត្រឡប់ក្រោយ'); E('↷ Redo', '↷ ធ្វើឡើងវិញ');
  E('💾 Save', '💾 រក្សាទុក'); E('📁 Load', '📁 ផ្ទុក'); E('📊 Request Count', '📊 សុំរាប់'); E('📊 Game Info', '📊 ព័ត៌មានហ្គេម'); E('Captured Pieces', 'កូនអុកដែលចាប់បាន');
  E('Language • ភាសា', 'ភាសា', 'Language'); E('Language', 'ភាសា');
  E('Change Mode?', 'ប្តូររបៀប?'); E('Switch mode? Your current game will be lost.', 'ប្តូររបៀប? ហ្គេមបច្ចុប្បន្ននឹងបាត់បង់។'); E('Are you sure?', 'តើអ្នកប្រាកដទេ?');
  E('Reset game?', 'កំណត់ហ្គេមឡើងវិញ?'); E('New AI game?', 'ហ្គេម AI ថ្មី?');
  E('The game in progress will be lost. Reset it?', 'ហ្គេមដែលកំពុងលេងនឹងបាត់បង់។ កំណត់ឡើងវិញ?'); E('The game in progress will be lost. Start a new game?', 'ហ្គេមដែលកំពុងលេងនឹងបាត់បង់។ ចាប់ផ្តើមហ្គេមថ្មី?');
  E('Yes, reset', 'បាទ/ចាស កំណត់ឡើងវិញ'); E('Yes, new game', 'បាទ/ចាស ហ្គេមថ្មី');

  /* ---------- AI / training ---------- */
  E('AI OPPONENT SETUP', 'ការរៀបចំគូប្រកួត AI'); E('AI Plays', 'AI លេង'); E('You Play', 'អ្នកលេង'); E('Difficulty', 'កម្រិតលំបាក'); E('Easy', 'ងាយ'); E('Medium', 'មធ្យម'); E('Hard', 'ពិបាក');
  E('Master — very strong', 'អ្នកជំនាញ — ខ្លាំងណាស់'); E('Grandmaster', 'ម្ចាស់ជំនាញ'); E('Legend — strongest', 'ព្រឹទ្ធាចារ្យ — ខ្លាំងបំផុត');
  E('New AI Game', 'ហ្គេម AI ថ្មី'); E('Custom Position', 'ទីតាំងផ្ទាល់ខ្លួន'); E('Human (2-player)', 'មនុស្ស (២នាក់)'); E('2 Players', '២ នាក់');
  E('🎓 TRAINING MODE — Drag pieces from the trays', '🎓 របៀបហ្វឹកហាត់ — អូសកូនអុកពីថាស'); E('START GAME', 'ចាប់ផ្តើមហ្គេម'); E('Set pieces', 'ដាក់កូនអុក'); E('▶ Start Training Game', '▶ ចាប់ផ្តើមហ្គេមហ្វឹកហាត់');
  E('Set all pieces?', 'ដាក់កូនអុកទាំងអស់?'); E('This replaces the pieces now on the board with the full set.', 'វានឹងជំនួសកូនអុកលើក្តារដោយកូនអុកពេញលេញ។'); E('Yes, set pieces', 'បាទ/ចាស ដាក់កូនអុក');
  E(['⚪ វេនខាងស (White\'s Turn)', "វេនខាងស (White's Turn)"], '⚪ វេនខាងស', "⚪ White's Turn"); E(['⚫ វេនខាងខ្មៅ (Black\'s Turn)', "វេនខាងខ្មៅ (Black's Turn)"], '⚫ វេនខាងខ្មៅ', "⚫ Black's Turn");
  E(['ខាងស (White)'], 'ខាងស', 'White side'); E(['ខាងខ្មៅ (Black)'], 'ខាងខ្មៅ', 'Black side');
  E('WHITE • ស', 'ស', 'WHITE'); E('BLACK • ខ្មៅ', 'ខ្មៅ', 'BLACK');
  E('KING IN DANGER', 'ស្តេចកំពុងគ្រោះថ្នាក់'); E('🚨 EMERGENCY ANNOUNCEMENT', '🚨 សេចក្តីប្រកាសបន្ទាន់'); E('Counting expired — DRAW', 'អស់ការរាប់ — ស្មើ');
  E('Back to Menu', 'ត្រឡប់ទៅម៉ឺនុយ'); E('View board', 'មើលក្តារ'); E('Play another game? • លេងម្តងទៀត?', 'លេងម្តងទៀតទេ?', 'Play another game?'); E('🔁 Play again', '🔁 លេងម្តងទៀត'); E('🔁 Accept rematch!', '🔁 ទទួលយកការលេងម្តងទៀត!');
  E('YOU WIN! • អ្នកឈ្នះ', '🏆 អ្នកឈ្នះ!', 'YOU WIN!'); E('You lost • អ្នកចាញ់', 'អ្នកចាញ់', 'You lost'); E('Draw • ស្មើ', 'ស្មើ', 'Draw');
  R('{c} Wins — {t}', '{c} ឈ្នះ — {t}', undefined, true); R('👑 {c} wins.', '👑 {c} ឈ្នះ។', undefined, true); R('{t}. {d}', '{t}។ {d}', undefined, true); E('🤝 Counting rule expired.', '🤝 អស់ការរាប់ — ស្មើ។'); E('Counting rule', 'ច្បាប់រាប់');
  E('Time out', 'អស់ពេល'); E('Match Timeout', 'អស់ពេលប្រកួត'); E('Turn Timeout', 'អស់ពេលវេន'); E('Resignation', 'ចុះចាញ់'); E('Draw by agreement', 'ស្មើតាមការយល់ព្រម'); E('Insufficient material', 'កូនអុកមិនគ្រប់គ្រាន់');
  E('🤝 Draw — insufficient material.', '🤝 ស្មើ — កូនអុកមិនគ្រប់គ្រាន់។'); E('🤝 Draw — no legal moves.', '🤝 ស្មើ — គ្មានផ្លូវដើរ។');
  R('Move {n}', 'ជំហាន {n}'); R('Count: {a} / {b} ({c} left)', 'រាប់៖ {a} / {b} (នៅសល់ {c})'); R('Count: {a} / {b} — expired', 'រាប់៖ {a} / {b} — អស់');
  R('{c} must mate NOW', '{c} ត្រូវម៉ាត់ឥឡូវនេះ'); R('{c} must mate soon', '{c} ត្រូវម៉ាត់ឆាប់ៗ'); R('{c} must mate within limit', '{c} ត្រូវម៉ាត់ក្នុងកំណត់');
  E('📊', '📊');

  /* ---------- sign in / account ---------- */
  E('អុកចត្រង្គ • Khmer Chess', 'អុកចត្រង្គ • Khmer Chess'); E('Sign in to play online with friends.', 'ចូលគណនីដើម្បីលេងអនឡាញជាមួយមិត្តភក្តិ។');
  E('Sign in', 'ចូលគណនី'); E('Create account', 'បង្កើតគណនី'); E('Sign in • ចូលគណនី', 'ចូលគណនី', 'Sign in'); E('Create account • បង្កើតគណនី', 'បង្កើតគណនី', 'Create account'); E('Sign out', 'ចាកចេញ');
  E('📱 Phone number', '📱 លេខទូរស័ព្ទ'); E('✉️ Email', '✉️ អ៊ីមែល'); E('Phone number • លេខទូរស័ព្ទ', 'លេខទូរស័ព្ទ', 'Phone number'); E('Email • អ៊ីមែល', 'អ៊ីមែល', 'Email');
  E('Password • ពាក្យសម្ងាត់', 'ពាក្យសម្ងាត់', 'Password'); E('Display name • ឈ្មោះ (2–24 characters)', 'ឈ្មោះបង្ហាញ (២–២៤ តួអក្សរ)', 'Display name (2–24 characters)');
  E('SMS code • លេខកូដ SMS', 'លេខកូដ SMS', 'SMS code'); E('Verify code • បញ្ជាក់', 'បញ្ជាក់លេខកូដ', 'Verify code'); E('Forgot password?', 'ភ្លេចពាក្យសម្ងាត់?');
  E('Not signed in', 'មិនទាន់ចូលគណនី'); R('Signed in as {n}', 'បានចូលជា {n}'); E('Not configured — edit config.js', 'មិនទាន់កំណត់ — កែ config.js'); E('Not configured: edit config.js', 'មិនទាន់កំណត់៖ កែ config.js');
  E('Enter a valid phone number.', 'សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវ។'); E('Enter your password.', 'សូមបញ្ចូលពាក្យសម្ងាត់។'); E('Enter your email and password.', 'សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់។');
  E('Please wait…', 'សូមរង់ចាំ…'); E('Wrong phone number or password. Use the same phone number you registered with.', 'លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។ សូមប្រើលេខដែលបានចុះឈ្មោះ។');
  E('Display name must be 2–24 characters.', 'ឈ្មោះបង្ហាញត្រូវមាន ២–២៤ តួអក្សរ។'); E('Password must be at least 6 characters.', 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ។');
  E('We sent a code by SMS. Type it below.', 'យើងបានផ្ញើលេខកូដតាម SMS។ សូមវាយវាខាងក្រោម។'); E('Type the SMS code.', 'សូមវាយលេខកូដ SMS។'); E('Checking…', 'កំពុងពិនិត្យ…');
  E('Please sign in first.', 'សូមចូលគណនីជាមុន។'); E('Online play is not configured yet. Put your Supabase URL and key in config.js.', 'ការលេងអនឡាញមិនទាន់កំណត់ទេ។ សូមដាក់ Supabase URL និង key ក្នុង config.js។');

  /* ---------- lobby / rooms ---------- */
  E('CREATE A ROOM • បង្កើតបន្ទប់', 'បង្កើតបន្ទប់', 'CREATE A ROOM'); E('Create room • បង្កើត', 'បង្កើតបន្ទប់', 'Create room'); E('JOIN WITH A CODE • ចូលបន្ទប់', 'ចូលដោយលេខកូដ', 'JOIN WITH A CODE'); E('Join • ចូល', 'ចូល', 'Join');
  E('I play as', 'ខ្ញុំលេងជា'); E('Clock (per player)', 'នាឡិកា (ម្នាក់ៗ)'); E('Who moves first', 'អ្នកណាដើរមុន'); E('First mover', 'អ្នកដើរមុន'); E('First Turn', 'វេនដំបូង'); E('Show in public lobby', 'បង្ហាញក្នុងបន្ទប់សាធារណៈ');
  E('OPEN PUBLIC ROOMS', 'បន្ទប់សាធារណៈដែលបើក'); E('No open public rooms right now.', 'មិនមានបន្ទប់សាធារណៈទេឥឡូវនេះ។'); E('🎮 INVITATIONS', '🎮 ការអញ្ជើញ'); R('Version {n}', 'កំណែ {n}');
  E('Type the 6-letter room code first.', 'សូមវាយលេខកូដបន្ទប់ ៦ តួអក្សរជាមុន។'); R('Joining room {c}…', 'កំពុងចូលបន្ទប់ {c}…'); R('Could not join: {m}', 'មិនអាចចូលបាន៖ {m}');
  E('Room not found — check the code.', 'រកមិនឃើញបន្ទប់ — សូមពិនិត្យលេខកូដ។'); E('That room already has two players.', 'បន្ទប់នោះមានអ្នកលេងពីរនាក់ហើយ។'); E('This room needs a passcode.', 'បន្ទប់នេះត្រូវការលេខសម្ងាត់។'); E('Wrong passcode.', 'លេខសម្ងាត់មិនត្រឹមត្រូវ។');
  E('🔒 Passcode • លេខសម្ងាត់', '🔒 លេខសម្ងាត់បន្ទប់', '🔒 Passcode'); R('Room {c} is locked. Ask the host for the passcode.', 'បន្ទប់ {c} ត្រូវបានចាក់សោ។ សូមសុំលេខសម្ងាត់ពីម្ចាស់បន្ទប់។'); E('Wrong passcode — try again.', 'លេខសម្ងាត់មិនត្រឹមត្រូវ — សូមព្យាយាមម្តងទៀត។'); E('Type the passcode.', 'សូមវាយលេខសម្ងាត់។');
  R('Room code: {c} • {m} • you are {x}', 'លេខកូដបន្ទប់៖ {c}  •  {m}  •  អ្នកជា {x}'); R('Room {c} • {m}', 'បន្ទប់ {c} • {m}'); E('Waiting for an opponent…', 'កំពុងរង់ចាំគូប្រកួត…'); E('Waiting for an opponent…', 'កំពុងរង់ចាំគូប្រកួត…');
  E('Invite friend', 'អញ្ជើញមិត្ត'); E('🤝 Offer draw • សុំស្មើ', '🤝 សុំស្មើ', '🤝 Offer draw'); E('🏳 Resign • ចុះចាញ់', '🏳 ចុះចាញ់', '🏳 Resign'); E('✕ Cancel room', '✕ បោះបង់បន្ទប់'); E('Lobby • បន្ទប់', 'បន្ទប់', 'Lobby'); E('Lobby', 'បន្ទប់');
  E('ONLINE MULTIPLAYER • អនឡាញ', 'ហ្គេមអនឡាញ', 'ONLINE MULTIPLAYER'); E('✕ Close • បិទ', '✕ បិទ', '✕ Close'); E('Close • បិទ', 'បិទ', 'Close');
  R('{a} (White) vs {b} — YOUR TURN', '{a} (ស) ប្រឆាំង {b} — វេនអ្នក'); R('{a} (Black) vs {b} — YOUR TURN', '{a} (ខ្មៅ) ប្រឆាំង {b} — វេនអ្នក'); R('{a} (White) vs {b} — opponent’s turn', '{a} (ស) ប្រឆាំង {b} — វេនគូប្រកួត'); R('{a} (Black) vs {b} — opponent’s turn', '{a} (ខ្មៅ) ប្រឆាំង {b} — វេនគូប្រកួត');
  R('Setting up pieces — you: {a} • {n}: {b}', 'កំពុងរៀបចំកូនអុក — អ្នក៖ {a} • {n}៖ {b}'); E('ready ✓', 'រួចរាល់ ✓'); E('choosing…', 'កំពុងជ្រើស…'); R('Room {c} • {m} • the clock starts when both are ready', 'បន្ទប់ {c} • {m} • នាឡិកាចាប់ផ្តើមពេលទាំងពីររួចរាល់');
  R('Room {c} is open. Share the code or invite link with your friend.', 'បន្ទប់ {c} បានបើកហើយ។ សូមចែករំលែកលេខកូដ ឬតំណអញ្ជើញទៅមិត្ត។'); R('Game on — you are {c}. {d} moves first/now.', 'ចាប់ផ្តើមហើយ — អ្នកជា {c}។ {d} ដើរមុន/ឥឡូវនេះ។');
  R('{n} joined. {c} moves first. Good luck!', '{n} បានចូលហើយ។ {c} ដើរមុន។ សូមជូនពរ!'); R('{n} joined your room', '{n} បានចូលបន្ទប់របស់អ្នក'); E('Time to start the game', 'ដល់ពេលចាប់ផ្តើមហ្គេមហើយ');
  E('Both players are ready — game on!', 'អ្នកលេងទាំងពីររួចរាល់ — ចាប់ផ្តើម!'); E('Both players are ready — pieces were adjusted. Game on!', 'អ្នកលេងទាំងពីររួចរាល់ — កូនអុកត្រូវបានកែតម្រូវ។ ចាប់ផ្តើម!');
  R('{a} ({x}) moves first, because {b} ({y}) removed pieces.', '{a} ({x}) ដើរមុន ព្រោះ {b} ({y}) បានដកកូនអុកចេញ។');
  E('Cancel this room?', 'បោះបង់បន្ទប់នេះ?'); E('Resign this game?', 'ចុះចាញ់ហ្គេមនេះ?'); E('The room will be closed.', 'បន្ទប់នឹងត្រូវបិទ។'); E('You will lose this game.', 'អ្នកនឹងចាញ់ហ្គេមនេះ។'); E('Yes, cancel', 'បាទ/ចាស បោះបង់'); E('Yes, resign', 'បាទ/ចាស ចុះចាញ់');
  E('👋 Room cancelled', '👋 បន្ទប់ត្រូវបានបោះបង់'); E('Room cancelled', 'បន្ទប់ត្រូវបានបោះបង់'); E('OK • Lobby', 'យល់ព្រម • បន្ទប់'); R('{n} has left the room, so the room was cancelled.', '{n} បានចាកចេញពីបន្ទប់ ដូច្នេះបន្ទប់ត្រូវបានបោះបង់។'); E('This room was closed because nobody was online.', 'បន្ទប់នេះត្រូវបានបិទ ព្រោះគ្មាននរណាម្នាក់នៅលើអ៊ីនធឺណិត។');
  E('Join or create a room first.', 'សូមចូល ឬបង្កើតបន្ទប់ជាមុន។'); E('⚠️ Join a room first.', '⚠️ សូមចូលបន្ទប់ជាមុន។'); E('⚠️ Open Online mode and join a room to chat.', '⚠️ សូមបើករបៀបអនឡាញ ហើយចូលបន្ទប់ដើម្បីជជែក។');

  /* ---------- rematch / draw / results ---------- */
  R('🔁 {n} wants a rematch', '🔁 {n} ចង់លេងម្តងទៀត'); R('{n} wants a rematch', '{n} ចង់លេងម្តងទៀត'); E('Tap to accept', 'ចុចដើម្បីទទួលយក'); R('🔁 Rematch! Room code: {c}', '🔁 លេងម្តងទៀត! លេខកូដបន្ទប់៖ {c}'); R('Rematch invite sent. Waiting for {n}… (code {c})', 'បានផ្ញើការអញ្ជើញលេងម្តងទៀត។ កំពុងរង់ចាំ {n}… (លេខកូដ {c})');
  E('🤝 Opponent offers a draw', '🤝 គូប្រកួតសុំស្មើ'); R('{n} offers a draw.', '{n} សុំស្មើ។'); R('{n} offers a draw', '{n} សុំស្មើ'); E('Accept or decline in the game', 'ទទួលយក ឬបដិសេធក្នុងហ្គេម'); R('🤝 Draw offer sent — waiting for {n}…', '🤝 បានផ្ញើសំណើស្មើ — កំពុងរង់ចាំ {n}…'); E('Draw offer sent.', 'បានផ្ញើសំណើស្មើ។'); R('🤝 {n} declined your draw offer.', '🤝 {n} បានបដិសេធសំណើស្មើរបស់អ្នក។'); E('🤝 Draw offer sent…', '🤝 បានផ្ញើសំណើស្មើ…');
  R('Your record: 🏆 {w} win • ❌ {l} loss • 🤝 {d} draw', 'កំណត់ត្រារបស់អ្នក៖ 🏆 ឈ្នះ {w} • ❌ ចាញ់ {l} • 🤝 ស្មើ {d}'); R('You vs {n}: {w} – {l}', 'អ្នក ប្រឆាំង {n}៖ {w} – {l}'); R('You vs {n}: {w} – {l} ({d} draws)', 'អ្នក ប្រឆាំង {n}៖ {w} – {l} (ស្មើ {d})'); R('You vs {n}: {w} – {l} ({d} draw)', 'អ្នក ប្រឆាំង {n}៖ {w} – {l} (ស្មើ {d})');
  E('Your turn', 'វេនរបស់អ្នក'); R('{n} made a move', '{n} បានដើរមួយជំហាន');

  /* ---------- setup before the game ---------- */
  E('⚙️ Adjust your pieces? • កែសម្រួលកូនអុក?', '⚙️ កែសម្រួលកូនអុករបស់អ្នក?', '⚙️ Adjust your pieces?'); E('No, start game', 'ទេ ចាប់ផ្តើមហ្គេម'); E('Yes, set up', 'បាទ/ចាស រៀបចំ'); E('ទេ ចាប់ផ្តើម', 'ទេ ចាប់ផ្តើម', 'No, start game'); E('បាទ/ចាស រៀបចំ', 'បាទ/ចាស រៀបចំ', 'Yes, set up');
  E('A strong player can give a handicap: remove one of your own pieces (and swap it for extra pawns or promoted pawns), or promote a pawn. Your opponent cannot see your choice until you are both ready. If you remove pieces, your opponent moves first.',
    'អ្នកលេងពូកែអាចផ្តល់អត្ថប្រយោជន៍ដល់គូប្រកួត៖ ដកកូនអុករបស់ខ្លួនចេញ (ហើយជំនួសដោយត្រីបន្ថែម ឬត្រីឡើងថ្នាក់) ឬដំឡើងថ្នាក់ត្រី។ គូប្រកួតមិនឃើញជម្រើសរបស់អ្នកទេ រហូតដល់ទាំងពីររួចរាល់។ បើអ្នកដកកូនអុកចេញ គូប្រកួតនឹងដើរមុន។');
  E('Set up your pieces • រៀបចំកូនអុក', 'រៀបចំកូនអុករបស់អ្នក', 'Set up your pieces');
  E('Tap a piece to remove it, then add a pawn or promoted pawn 👑 in its place — even more than 8 pawns. Pick a piece below, then tap an empty square. Pick 👑 and tap a pawn to promote it. 16 pieces at most. If you remove pieces, your opponent moves first.',
    'ចុចកូនអុកដើម្បីដកចេញ បន្ទាប់មកបន្ថែមត្រី ឬត្រីឡើងថ្នាក់ 👑 ជំនួស — ច្រើនជាង ៨ ក៏បាន។ ជ្រើសកូនអុកខាងក្រោម រួចចុចក្រឡាទទេ។ ជ្រើស 👑 ហើយចុចត្រីដើម្បីដំឡើងថ្នាក់។ អតិបរមា ១៦ កូន។ បើអ្នកដកកូនអុកចេញ គូប្រកួតនឹងដើរមុន។');
  E('OK • រួចរាល់', 'យល់ព្រម • រួចរាល់', 'OK'); R('Your pieces: {n} / 16', 'កូនអុករបស់អ្នក៖ {n} / 16'); R('Your pieces: {n} / 16 — your opponent gets an advantage', 'កូនអុករបស់អ្នក៖ {n} / 16 — គូប្រកួតទទួលបានអត្ថប្រយោជន៍');
  E('The King cannot be removed.', 'មិនអាចដកស្តេចចេញបានទេ។'); E('Pick a piece below first, then tap an empty square.', 'សូមជ្រើសកូនអុកខាងក្រោមជាមុន រួចចុចក្រឡាទទេ។'); E('You are ready. Waiting for', 'អ្នករួចរាល់ហើយ។ កំពុងរង់ចាំ');
  R('You are ready. Waiting for {n}…', 'អ្នករួចរាល់ហើយ។ កំពុងរង់ចាំ {n}…'); E('That setup is not allowed.', 'ការរៀបចំនេះមិនត្រូវបានអនុញ្ញាតទេ។');

  /* ---------- friends / invitations / profile ---------- */
  E('👥 Friends • មិត្តភក្តិ', '👥 មិត្តភក្តិ', '👥 Friends'); E('ADD A FRIEND • បន្ថែមមិត្ត', 'បន្ថែមមិត្ត', 'ADD A FRIEND'); E('FRIEND REQUESTS', 'សំណើមិត្តភក្តិ'); E('MY FRIENDS', 'មិត្តភក្តិរបស់ខ្ញុំ'); E('📤 Share room code / link in another app', '📤 ចែករំលែកលេខកូដបន្ទប់ / តំណ តាមកម្មវិធីផ្សេង');
  E('No friends yet — add a friend by their display name.', 'មិនទាន់មានមិត្តទេ — បន្ថែមមិត្តតាមឈ្មោះបង្ហាញរបស់គេ។'); E('wants to be your friend', 'ចង់ធ្វើជាមិត្តរបស់អ្នក'); E('request sent — waiting', 'បានផ្ញើសំណើ — កំពុងរង់ចាំ'); E('friend', 'មិត្តភក្តិ');
  E('🟢 Online', '🟢 អនឡាញ'); E('🎮 In a game', '🎮 កំពុងលេង'); E('⚪ Offline', '⚪ ក្រៅបណ្តាញ'); E('Invited ✓', 'បានអញ្ជើញ ✓'); E('Remove friend?', 'ដកមិត្តចេញ?'); E('Cancel request?', 'បោះបង់សំណើ?'); E('Yes', 'បាទ/ចាស');
  E("Friend's display name", 'ឈ្មោះបង្ហាញរបស់មិត្ត'); E('Type your friend’s display name.', 'សូមវាយឈ្មោះបង្ហាញរបស់មិត្ត។'); E('Sending…', 'កំពុងផ្ញើ…'); E('No player has that display name.', 'គ្មានអ្នកលេងណាមានឈ្មោះនេះទេ។'); E('You cannot add yourself.', 'អ្នកមិនអាចបន្ថែមខ្លួនឯងបានទេ។'); E('You are already friends.', 'អ្នកជាមិត្តរួចហើយ។'); E('Request already sent.', 'បានផ្ញើសំណើរួចហើយ។');
  R('You and {n} are now friends!', 'អ្នក និង {n} ឥឡូវជាមិត្តហើយ!'); R('Request sent to {n}.', 'បានផ្ញើសំណើទៅ {n}។'); R('Invite a friend to room {c}', 'អញ្ជើញមិត្តចូលបន្ទប់ {c}'); R('Invitation sent to {n}.', 'បានផ្ញើការអញ្ជើញទៅ {n}។'); R('Invitation sent to {n}. They will see a Join button.', 'បានផ្ញើការអញ្ជើញទៅ {n}។ គេនឹងឃើញប៊ូតុងចូល។');
  R('{n} invites you to play', '{n} អញ្ជើញអ្នកលេង'); R('🎮 {n} invites you to play ({m})', '🎮 {n} អញ្ជើញអ្នកលេង ({m})'); R('invites you • {m}', 'អញ្ជើញអ្នក • {m}'); R('{n} sent you a friend request', '{n} បានផ្ញើសំណើមិត្តភក្តិមកអ្នក'); R('👥 {n} sent you a friend request', '👥 {n} បានផ្ញើសំណើមិត្តភក្តិមកអ្នក'); E('Tap to answer', 'ចុចដើម្បីឆ្លើយតប');
  R('{n} friend requests', 'សំណើមិត្តភក្តិ {n}'); R('{n} friend request', 'សំណើមិត្តភក្តិ {n}'); R('👥 Request sent to {n}', '👥 បានផ្ញើសំណើទៅ {n}');
  E('👤 My profile • គណនីខ្ញុំ', '👤 គណនីរបស់ខ្ញុំ', '👤 My profile'); E('📷 Choose picture', '📷 ជ្រើសរូបភាព'); E('Save • រក្សាទុក', 'រក្សាទុក', 'Save'); E('Saving…', 'កំពុងរក្សាទុក…'); E('✏️ Edit profile', '✏️ កែប្រវត្តិរូប'); E('➕ Add friend', '➕ បន្ថែមមិត្ត'); E('✓ Friends', '✓ មិត្តភក្តិ'); E('Friend request sent', 'បានផ្ញើសំណើមិត្តភក្តិ'); E('Accept friend request', 'ទទួលយកសំណើមិត្តភក្តិ'); E('🟢 You', '🟢 អ្នក');
  E('Wins', 'ឈ្នះ'); E('Losses', 'ចាញ់'); E('Draws', 'ស្មើ'); E('Win rate', 'អត្រាឈ្នះ'); E('✉️ Leave a message', '✉️ ទុកសារ'); E('Write a message…', 'សរសេរសារ…'); E('No messages yet. Write the first one!', 'មិនទាន់មានសារទេ។ សូមសរសេរសារដំបូង!');
  E('Loading…', 'កំពុងផ្ទុក…');

  /* ---------- notifications / chat ---------- */
  E('🔔 Notifications • ជូនដំណឹង', '🔔 ការជូនដំណឹង', '🔔 Notifications'); E('🔔 Turn on phone notifications', '🔔 បើកការជូនដំណឹងលើទូរស័ព្ទ'); E('No notifications yet. New messages, invitations and friend requests will appear here.', 'មិនទាន់មានការជូនដំណឹងទេ។ សារ ការអញ្ជើញ និងសំណើមិត្តថ្មីៗនឹងបង្ហាញនៅទីនេះ។');
  E('Turn on phone notifications to be told about messages and invitations when the game is in the background.', 'បើកការជូនដំណឹងលើទូរស័ព្ទ ដើម្បីដឹងអំពីសារ និងការអញ្ជើញ នៅពេលហ្គេមនៅផ្ទៃខាងក្រោយ។');
  E('🔔 Phone notifications are ON (while the game is open in the background).', '🔔 ការជូនដំណឹងលើទូរស័ព្ទបានបើក (ពេលហ្គេមនៅបើកផ្ទៃខាងក្រោយ)។');
  E(['ការជជែកផ្ទាល់ • Message Box'], 'ការជជែកផ្ទាល់', 'Message Box'); E('⚔️ សួស្ដី', '⚔️ សួស្ដី', '⚔️ Hello'); E('👍 ដើរល្អ', '👍 ដើរល្អ', '👍 Good move'); E('⚠️ ប្រយ័ត្ន', '⚠️ ប្រយ័ត្ន', '⚠️ Careful'); E('👑 អុកមាត់', '👑 អុកមាត់', '👑 Checkmate'); E('🤝 ស្មើ', '🤝 ស្មើ', '🤝 Draw?');
  E('វាយសារ...', 'វាយសារ...', 'Type a message...'); R('● Recording {t} / 0:15', '● កំពុងថត {t} / 0:15'); E('● Recording 0:00 / 0:15', '● កំពុងថត 0:00 / 0:15');
  E('Microphone is not available. Please allow microphone access for this site/app.', 'មីក្រូហ្វូនមិនអាចប្រើបានទេ។ សូមអនុញ្ញាតការប្រើមីក្រូហ្វូនសម្រាប់គេហទំព័រ/កម្មវិធីនេះ។');
  E('Voice messages are not supported on this device or app.', 'សារជាសំឡេងមិនត្រូវបានគាំទ្រលើឧបករណ៍ ឬកម្មវិធីនេះទេ។'); E('This device cannot play this voice message.', 'ឧបករណ៍នេះមិនអាចចាក់សារជាសំឡេងនេះបានទេ។'); E('Could not send the voice message.', 'មិនអាចផ្ញើសារជាសំឡេងបានទេ។'); E('Voice message is too long.', 'សារជាសំឡេងវែងពេក។');
  E('Chat is available in Online mode only.', 'ការជជែកមានតែក្នុងរបៀបអនឡាញប៉ុណ្ណោះ។'); E('Chat is available in Online mode', 'ការជជែកមានតែក្នុងរបៀបអនឡាញ');
  E('Invite link copied. Send it to your friend.', 'បានចម្លងតំណអញ្ជើញ។ សូមផ្ញើវាទៅមិត្ត។');
  R('⚠️ {m}', '⚠️ {m}'); R('{m} ⚠️', '{m} ⚠️');
  E('Draw', 'ស្មើ');


  /* ---------- more texts ---------- */
  R('Version {n}', 'កំណែ {n}'); R('🏆 {w} wins • {l} losses • {d} draws', '🏆 ឈ្នះ {w} • ចាញ់ {l} • ស្មើ {d}');
  E('e.g. 4821', 'ឧ. 4821'); E('Passcode', 'លេខសម្ងាត់'); E('now', 'ឥឡូវនេះ'); R('{n} min ago', '{n} នាទីមុន'); R('{n} h ago', '{n} ម៉ោងមុន'); R('{n} d ago', '{n} ថ្ងៃមុន');
  R('AI plays {c} • Level: {l}', 'AI លេង {c} • កម្រិត៖ {l}'); E('easy', 'ងាយ'); E('medium', 'មធ្យម'); E('hard', 'ពិបាក'); E('master', 'អ្នកជំនាញ'); E('grandmaster', 'ម្ចាស់ជំនាញ'); E('legend', 'ព្រឹទ្ធាចារ្យ');
  R('AI ({l})', 'AI ({l})'); R('AI ({l}) thinking…', 'AI ({l}) កំពុងគិត…');
  E('Accept & Start', 'ទទួលយក & ចាប់ផ្តើម'); E('Ready — Send Setup', 'រួចរាល់ — ផ្ញើការរៀបចំ'); E('Active Side', 'ខាងដែលកំពុងដើរ'); E('Attacker must mate or draw', 'អ្នកវាយប្រហារត្រូវម៉ាត់ ឬស្មើ');
  E('Black lost', 'ខ្មៅចាញ់'); E('White lost', 'ស ចាញ់'); E('White Wins', 'ស ឈ្នះ'); E('Black Wins', 'ខ្មៅ ឈ្នះ'); E('White to move', 'ស ដើរ'); E('Black to move', 'ខ្មៅ ដើរ');
  E('Both sides need exactly one King.', 'ភាគីទាំងពីរត្រូវមានស្តេចតែមួយ។'); R('Currently: White {a}, Black {b}.', 'បច្ចុប្បន្ន៖ ស {a}, ខ្មៅ {b}។'); E('Configure the game before starting.', 'កំណត់ហ្គេមមុនចាប់ផ្តើម។');
  R('{c} wins.', '{c} ឈ្នះ។', undefined, true); R('{t}: {d}', '{t}៖ {d}', undefined, true); E('Current:', 'បច្ចុប្បន្ន៖'); E('• Last:', '• ចុងក្រោយ៖'); E('System:', 'ប្រព័ន្ធ៖');
  E('Not connected', 'មិនបានភ្ជាប់'); E('START', 'ចាប់ផ្តើម'); R('{n}: ready ✓', '{n}៖ រួចរាល់ ✓'); R('{n}: choosing…', '{n}៖ កំពុងជ្រើស…'); E('full', 'ពេញ');
  E('⚙️ Game Setup', '⚙️ ការរៀបចំហ្គេម'); E('🎮 Invitation', '🎮 ការអញ្ជើញ'); E('🔁 Rematch?', '🔁 លេងម្តងទៀត?'); E('Game Setup', 'ការរៀបចំហ្គេម');
  E('Clear the board', 'សម្អាតក្តារ'); E('Emoji', 'សញ្ញាអារម្មណ៍'); E('Friends', 'មិត្តភក្តិ'); E('Load all pieces on the board', 'ដាក់កូនអុកទាំងអស់លើក្តារ'); E('My profile', 'គណនីរបស់ខ្ញុំ'); E('Notifications', 'ការជូនដំណឹង');
  E('Reset trays', 'កំណត់ថាសឡើងវិញ'); E('Rotate Board', 'បង្វិលក្តារ'); E('Toggle 3D Board', 'ប្តូរក្តារ 3D'); E('Voice message', 'សារជាសំឡេង'); E('Change name', 'ប្តូរឈ្មោះ'); E('Chat', 'ជជែក'); E('Settings', 'ការកំណត់');


  /* ---------- round 13 ---------- */
  E('Time per move', 'ពេលក្នុងមួយជំហាន'); E('No limit', 'គ្មានកំណត់'); E('💬 Room chat', '💬 ជជែកក្នុងបន្ទប់'); E('✉️ Messages', '✉️ សារ'); E('No messages yet.', 'មិនទាន់មានសារទេ។');
  E('Sign in (Online mode) to see your messages.', 'សូមចូលគណនី (របៀបអនឡាញ) ដើម្បីមើលសាររបស់អ្នក។');
  E("Friends who leave you a message appear here. Open a friend's profile and tap ✉️ Leave a message to write to them.", 'មិត្តដែលទុកសារឱ្យអ្នកនឹងបង្ហាញនៅទីនេះ។ បើកប្រវត្តិរូបមិត្ត ហើយចុច ✉️ ទុកសារ ដើម្បីសរសេរទៅគេ។');
  R('📊 Bare king — {c} must checkmate within limit {t} (Count: {a} / {b}).', '📊 ស្តេចឯកា — {c} ត្រូវម៉ាត់ក្នុងកំណត់ {t} (រាប់៖ {a} / {b})។');
  R('📊 All pawns promoted — counting renewed: {c} must checkmate within limit {t} (Count: {a} / {b}).', '📊 ត្រីទាំងអស់បានឡើងថ្នាក់ — រាប់ឡើងវិញ៖ {c} ត្រូវម៉ាត់ក្នុងកំណត់ {t} (រាប់៖ {a} / {b})។');
  R("📊 Counting started — {c} has up to {m} moves before it's a draw.", '📊 ចាប់ផ្តើមរាប់ — {c} មានរហូតដល់ {m} ជំហាន មុននឹងស្មើ។');



  /* ---------- round 14: passcode pop-up ---------- */
  E('Do you want a passcode for this room? Players will need it to join.', 'តើអ្នកចង់ដាក់លេខសម្ងាត់សម្រាប់បន្ទប់នេះទេ? អ្នកលេងត្រូវការវាដើម្បីចូល។');
  E('No passcode', 'គ្មានលេខសម្ងាត់'); E('Yes, enter passcode', 'បាទ/ចាស បញ្ចូលលេខសម្ងាត់'); E('Passcode (2–20 characters)', 'លេខសម្ងាត់ (២–២០ តួអក្សរ)'); E('Passcode must be 2–20 characters.', 'លេខសម្ងាត់ត្រូវមាន ២–២០ តួអក្សរ។'); E('Create room', 'បង្កើតបន្ទប់');

  /* ---------- engine ---------- */
  var cache = {}, cacheN = 0, LETTER = /[A-Za-z\u1780-\u17FF]/;
  function lookup(src, depth) {
    var key = norm(src); if (!key || !LETTER.test(key)) return null;
    var ck = lang + '|' + key; if ((depth || 0) === 0 && ck in cache) return cache[ck];
    var res = lookup2(key, depth);
    if ((depth || 0) === 0) { if (cacheN > 3000) { cache = {}; cacheN = 0; } cache[ck] = res; cacheN++; }
    return res;
  }
  function lookup2(key, depth) {
    var hit = exact[key]; if (hit) return hit[lang];
    if ((depth || 0) > 2) return null;
    for (var i = 0; i < templates.length; i++) {
      var t = templates[i], m = t.rx.exec(key); if (!m) continue;
      var tpl = lang === 'km' ? t.km : t.en, skip = false;
      var res = tpl.replace(/\{(\w+)\}/g, function (x, n) { var idx = t.names.indexOf(n); if (idx < 0) return x; var v = m[idx + 1]; var tr = lookup(v, (depth || 0) + 1); if (tr == null) { if (t.strict) skip = true; return v; } return tr; });
      if (skip) continue;
      return res;
    }
    return null;
  }
  function translate(src) { var r = lookup(src); return r == null ? null : r; }
  var observer = null, applying = false;
  function skipNode(node) {
    var p = node.parentNode; if (!p || !p.closest) return false;
    if (p.closest('#dm-thread') || (p.classList && p.classList.contains('inbox-prev'))) return true;
    if (p.closest('#chat-messages')) {
      if (p.tagName === 'B') return false;
      var prev = node.previousSibling; while (prev && prev.nodeType === 3 && !/\S/.test(prev.nodeValue)) prev = prev.previousSibling;
      return !(prev && prev.nodeType === 1 && prev.tagName === 'B' && /^(System|ប្រព័ន្ធ)/.test(prev.textContent.trim()));
    }
    return false;
  }
  function setNode(node) {
    if (skipNode(node)) return;
    if (node.__t && node.nodeValue === node.__t.shown) { var again = translate(node.__t.src); var want = node.__t.lead + again + node.__t.trail; if (again != null && want !== node.nodeValue) { node.nodeValue = want; node.__t.shown = want; } return; }
    var v = node.nodeValue; if (!v || !/\S/.test(v)) return;
    var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0], tr = translate(v);
    if (tr == null) { if (node.__t) node.__t = null; return; }
    applying = true; node.__t = { src: v.trim(), lead: lead, trail: trail, shown: lead + tr + trail }; node.nodeValue = node.__t.shown; applying = false;
  }
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  function setAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) { var a = ATTRS[i]; if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var key = 'i18n_' + a, cur = el.getAttribute(a); var st = el[key];
      if (st && cur === st.shown) { var t2 = translate(st.src); if (t2 != null && t2 !== st.shown) { applying = true; el.setAttribute(a, t2); st.shown = t2; applying = false; } continue; }
      var tr = translate(cur); if (tr == null) continue; applying = true; el[key] = { src: cur, shown: tr }; el.setAttribute(a, tr); applying = false; }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { setNode(root); return; }
    if (root.nodeType !== 1) return;
    if (/^(SCRIPT|STYLE|TEXTAREA)$/.test(root.tagName)) return;
    setAttrs(root);
    for (var c = root.firstChild; c; c = c.nextSibling) walk(c);
  }
  function start() {
    walk(document.body);
    observer = new MutationObserver(function (muts) {
      if (applying) return;
      muts.forEach(function (m) {
        if (m.type === 'characterData') setNode(m.target);
        else if (m.type === 'attributes') setAttrs(m.target);
        else m.addedNodes.forEach(function (n) { walk(n); });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var sel = document.getElementById('lang-select'); if (sel) sel.value = lang;
    document.documentElement.lang = lang === 'km' ? 'km' : 'en';
  }
  window.i18nSet = function (l) {
    if (l !== 'km' && l !== 'en') return; lang = l; cache = {}; cacheN = 0; try { localStorage.setItem(LS, l); } catch (e) {}
    document.documentElement.lang = l; var sel = document.getElementById('lang-select'); if (sel) sel.value = l;
    walk(document.body);
  };
  window.i18nLang = function () { return lang; };
  window.i18nT = function (s) { var r = translate(s); return r == null ? s : r; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
