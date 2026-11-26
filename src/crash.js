// Разбор падения Minecraft: расшифровка кода выхода, отчёт о падении и лог.
// Все тексты, которые видит пользователь, прогоняются через i18n: русский
// оригинал — это ключ, переводы — в renderer/locales/*.js.
const fs = require('fs');
const path = require('path');
const i18n = require('./i18n');
const t = i18n.t;

const MAX_REPORT = 300000;

// Коды выхода Windows (NTSTATUS), которые Java/Minecraft может вернуть при падении.
const WIN_CODES = {
  0xC0000005: {
    title: 'Программа обратилась к памяти, которой ей нельзя пользоваться',
    text: 'Чаще всего это драйвер видеокарты, нативная библиотека мода или нехватка памяти Windows.',
    fixes: ['Обновите драйвер видеокарты', 'Отключите шейдеры', 'Проверьте файл подкачки и свободное место на системном диске'],
  },
  0xC0000374: {
    title: 'Повреждена память нативной части игры',
    text: 'Обычно это драйвер видеокарты или мод с нативным кодом.',
    fixes: ['Обновите драйвер видеокарты', 'Уберите недавно добавленные моды с нативным кодом'],
  },
  0xC00000FD: {
    title: 'Переполнен стек: бесконечная рекурсия',
    text: 'Чаще всего это зацикливание в моде или ошибка в его коде.',
    fixes: ['Уберите моды, добавленные последними', 'Обновите моды до последних версий'],
  },
  0xC0000409: {
    title: 'Переполнение буфера в нативном коде',
    text: 'Нативная библиотека записала данные за пределы буфера. Чаще всего это драйвер видеокарты.',
    fixes: ['Обновите драйвер видеокарты', 'Отключите шейдеры'],
  },
  0xC0000017: {
    title: 'Windows не смогла выделить память',
    text: 'Системе не хватило памяти: ОЗУ и файла подкачки вместе.',
    fixes: ['Освободите место на системном диске', 'Увеличьте файл подкачки', 'Закройте лишние программы', 'Уменьшите дистанцию прорисовки'],
  },
  0xC0000135: {
    title: 'Не найдена системная библиотека (DLL)',
    text: 'Нужной библиотеки нет в системе.',
    fixes: ['Установите Microsoft Visual C++ Redistributable 2015–2022 (x64)', 'Обновите драйвер видеокарты'],
  },
  0xC000007B: {
    title: 'Библиотека не подходит к Java или системе',
    text: 'Обычно 32-битная библиотека в 64-битной Java или наоборот.',
    fixes: ['Используйте 64-битную Java (лаунчер ставит её сам)', 'Если указан свой путь к Java, проверьте, что она 64-битная'],
  },
  0xC0000142: {
    title: 'Библиотека не смогла запуститься',
    text: 'Windows не смогла инициализировать нужную DLL.',
    fixes: ['Установите Microsoft Visual C++ Redistributable', 'Обновите драйвер видеокарты'],
  },
  0xC000001D: {
    title: 'Процессор не поддерживает нужную инструкцию',
    text: 'Нативная библиотека использует команду, которой нет в вашем процессоре.',
    fixes: ['Отключите шейдеры или нативные моды', 'Обновите драйвер видеокарты'],
  },
  0xE06D7363: {
    title: 'Необработанное исключение в нативной библиотеке',
    text: 'Ошибка внутри нативного кода, без понятного текста.',
    fixes: ['Смотрите отчёт о падении ниже', 'Уберите моды, добавленные последними'],
  },
};

// Как называется движок сборки в текстах окна: у Minecraft на Rust нет Java
function engineOf(inst) {
  if (!inst) return '';
  if (inst.platform === 'horizon' || inst.loader === 'horizon') return 'Horizon';
  if (inst.platform === 'rustcraft' || inst.loader === 'rustcraft') return 'Rustcraft';
  return '';
}

// Расшифровка кода выхода процесса. engine — 'Horizon', 'Rustcraft' или '' для Java.
function decodeExit(code, engine = '') {
  const who = engine || 'Java';
  if (code === 0) return { ok: true, raw: 0, hex: '0x00000000', title: t('Код 0: игра закрылась без ошибки'), text: '', fixes: [] };
  if (code === null || code === undefined) {
    return {
      ok: false, raw: null, hex: '', title: t('Процесс {engine} был завершён извне', { engine: engine || 'Minecraft' }),
      text: t('Например, через Диспетчер задач или при выключении компьютера.'), fixes: [],
    };
  }
  const u = code >>> 0; // Windows отдаёт отрицательные коды, приводим к беззнаковым
  const hex = '0x' + u.toString(16).toUpperCase().padStart(8, '0');
  if (WIN_CODES[u]) return { ok: false, raw: code, hex, title: t(WIN_CODES[u].title), text: t(WIN_CODES[u].text), fixes: WIN_CODES[u].fixes.map(f => t(f)) };
  if (u === 1) {
    return {
      ok: false, raw: code, hex,
      title: engine ? t('{engine} завершился с общей ошибкой (код 1)', { engine }) : t('Java завершилась с общей ошибкой (код 1)'),
      text: engine
        ? t('Так {engine} заканчивает работу, если не смог стартовать или упал. Точная причина — в отчёте ниже.', { engine })
        : t('Так заканчивается запуск, если Java или игра не смогли стартовать или упали с исключением. Точная причина — в отчёте и логе.'),
      fixes: [],
    };
  }
  if (u === 0xFFFFFFFF) {
    return {
      ok: false, raw: code, hex, title: t('Minecraft аварийно завершился (код -1)'),
      text: t('Так Minecraft заканчивает работу после ошибки в игре. Точная причина — в отчёте о падении.'),
      fixes: [],
    };
  }
  return {
    ok: false, raw: code, hex, title: t('Неизвестный код выхода {code}', { code }),
    text: t('Такого кода нет в справочнике. Смотрите отчёт о падении и лог.'), fixes: [],
  };
}

// Правила по тексту отчёта и лога. Порядок важен: более точные выше.
const RULES = [
  {
    id: 'rust-no-resources',
    test: s => /Prepare resources with the launcher|horizon-prepare --prepare/.test(s)
      || /(?:horizon-client|horizon-prepare).{0,200}No such file or directory/.test(s)
      || /\.local[\\/]horizon-client/.test(s) && /No such file|not found/i.test(s),
    title: 'Horizon не нашёл данных игры',
    explanation: 'Движку нужны ресурсы, которые он готовит из вашей копии Minecraft 26.3. Их ещё нет или подготовка не завершилась: генератор данных упал, например из-за нехватки памяти.',
    fixes: [
      'Откройте вкладку «Minecraft Rust» и нажмите «Скачать движок» — подготовка продолжится с того же места',
      'Освободите хотя бы 4 ГБ ОЗУ: генератору данных Horizon этого мало с запасом не бывает',
      'Убедитесь, что версия 26.3 хотя бы раз скачана целиком (это делает лаунчер при подготовке)',
    ],
  },
  {
    id: 'rust-missing-lib',
    test: s => /error while loading shared libraries|cannot open shared object file|libasound\.so|libudev\.so|libvulkan|libxkbcommon\.so/.test(s),
    title: 'В системе нет библиотеки, которая нужна движку',
    explanation: 'Horizon и Rustcraft — обычные программы на Rust: им нужны системные библиотеки звука и ввода. В Linux их часто нет в минимальной установке.',
    fixes: [
      'Linux (Debian/Ubuntu): установите libasound2, libudev1 и libxkbcommon0',
      'Linux (Fedora/Arch): alsa-lib, systemd-libs, libxkbcommon',
      'macOS: запустите движок один раз через Finder (правый клик → «Открыть»)',
    ],
  },
  {
    id: 'rust-gpu',
    test: s => /(?:wgpu|Vulkan|DX12|DXGI|adapter|surface)/i.test(s)
      && /(?:panic|error|failed|unsupported|lost)/i.test(s)
      && /(?:wgpu|Vulkan|DX12|DXGI)/i.test(s),
    title: 'Видеодрайвер не подошёл движку',
    explanation: 'Horizon рисует через Vulkan (Windows/Linux) или Metal (macOS), Rustcraft — через Vulkan или DirectX 12. Старый драйвер такие запросы не выполняет.',
    fixes: [
      'Обновите драйвер видеокарты с сайта производителя (не через центр обновления Windows)',
      'На старых видеокартах без Vulkan 1.2 движок не запустится: остаётся Java Edition',
    ],
  },
  {
    id: 'rust-memory',
    test: s => /memory allocation of \d+ bytes failed|Out of memory|Killed process|Cannot allocate memory/.test(s),
    title: 'Движку не хватило памяти',
    explanation: 'Rust-движки держат мир в памяти целиком и на слабой машине могут не уложиться в доступную ОЗУ.',
    fixes: [
      'Закройте браузер и другие тяжёлые программы',
      'Уменьшите дистанцию прорисовки в настройках игры (по умолчанию 12 чанков)',
      'Увеличьте файл подкачки или добавьте памяти',
    ],
  },
  {
    id: 'rust-panic',
    test: s => /thread '.*' panicked at|panicked at '|assertion failed:/.test(s),
    title: 'Ошибка внутри движка',
    explanation: 'Это паника самого движка, а не вашей настройки. В отчёте указан файл и строка — по ним автор исправляет ошибку.',
    fixes: [
      'Приложите отчёт о падении к сообщению в Discord движка — там указан точный файл',
      'Обновите движок до последней версии: вкладка «Minecraft Rust»',
    ],
  },
  {
    id: 'native-oom',
    test: s => /OutOfMemoryError\s*$/m.test(s) || /MemoryUtil|nmemRealloc|nmemAlloc|memRealloc|memAlloc/.test(s) && /OutOfMemoryError/.test(s),
    title: 'Не хватило нативной памяти Windows (вне кучи Java)',
    explanation: 'Java выделяет память двумя способами: кучу, которую задаёт ползунок памяти, и нативную память, которую берёт у Windows. Здесь закончилась именно нативная память. Поэтому ползунок можно не трогать.',
    fixes: [
      'Освободите место на системном диске (нужно 10 ГБ и больше)',
      'Увеличьте файл подкачки: Параметры → Система → О системе → Дополнительные параметры → Быстродействие → Виртуальная память',
      'Закройте браузер и другие тяжёлые программы во время игры',
      'Уменьшите дистанцию прорисовки до 8',
      'В настройках Sodium уменьшите потоки обработки чанков до 2–4',
    ],
  },
  {
    id: 'heap-oom',
    test: s => /OutOfMemoryError: Java heap space/.test(s),
    title: 'Не хватает памяти Java (куча)',
    explanation: 'Игре не хватило выделенной памяти. Это тот объём, который задан ползунком «Память» в лаунчере.',
    fixes: ['Увеличьте ползунок «Память» на 2 ГБ (до 6–8 ГБ, если позволяет ОЗУ)', 'Уменьшите дистанцию прорисовки'],
  },
  {
    id: 'direct-oom',
    test: s => /OutOfMemoryError: Direct buffer memory/.test(s),
    title: 'Исчерпан буфер прямой памяти Java',
    explanation: 'Моды и видеокарта используют буфер вне кучи, и его лимит по умолчанию мал.',
    fixes: ['В поле дополнительных аргументов JVM добавьте -XX:MaxDirectMemorySize=4G', 'Уменьшите дистанцию прорисовки'],
  },
  {
    id: 'metaspace',
    test: s => /OutOfMemoryError: Metaspace/.test(s),
    title: 'Переполнена metaspace: слишком много классов от модов',
    explanation: 'Моды загрузили больше классов, чем помещается в служебную память Java.',
    fixes: ['Уберите моды, которыми не пользуетесь', 'Обновите моды до последних версий'],
  },
  {
    id: 'jre-memory',
    test: s => /There is insufficient memory for the Java Runtime|Could not reserve enough space/.test(s),
    title: 'Windows не выделила Java запрошенную память',
    explanation: 'При запуске Java попросила больше памяти, чем доступно системе.',
    fixes: ['Уменьшите ползунок «Память» в лаунчере', 'Увеличьте файл подкачки', 'Освободите место на системном диске'],
  },
  {
    id: 'stack-overflow',
    test: s => /StackOverflowError/.test(s),
    title: 'Переполнение стека: зацикливание в моде',
    explanation: 'Один из модов или сама игра вызвала себя бесконечно.',
    fixes: ['Уберите моды, добавленные последними', 'Обновите моды до последних версий'],
  },
  {
    id: 'mixin',
    test: s => /Mixin apply failed|MixinApplyError|InvalidInjectionException|Mixin transformation failed/.test(s),
    title: 'Конфликт модов (миксины)',
    explanation: 'Два или больше модов меняют одни и те же части игры несовместимым образом.',
    fixes: ['Отключите мод, который добавили последним', 'Обновите конфликтующие моды', 'Смотрите «Подозреваемые моды» в технических данных'],
  },
  {
    id: 'missing-class',
    test: s => /NoClassDefFoundError|ClassNotFoundException|NoSuchMethodError|NoSuchFieldError|AbstractMethodError/.test(s),
    title: 'Моды не подходят друг другу или нет нужной библиотеки',
    explanation: 'Мод ищет класс или метод, которого нет. Обычно это не установлена зависимость или мод рассчитан на другую версию Minecraft.',
    fixes: ['Проверьте, что все зависимости мода установлены', 'Обновите моды до версии этой сборки'],
  },
  {
    id: 'deps',
    test: s => /Missing or unsupported mandatory dependencies|Incompatible mod set|requires .* but|depends on .* but/i.test(s),
    title: 'Не хватает зависимости или версия мода не подходит',
    explanation: 'Загрузчик нашёл мод, который требует другой мод нужной версии.',
    fixes: ['Установите недостающую зависимость', 'Обновите мод до версии, подходящей к сборке'],
  },
  {
    id: 'duplicate',
    test: s => /Duplicate mod|Found duplicate|duplicate mod/i.test(s),
    title: 'В папке mods есть два одинаковых мода',
    explanation: 'Загрузчик нашёл две копии одного мода и не может выбрать, какую запустить.',
    fixes: ['Удалите лишнюю копию мода'],
  },
  {
    id: 'java-version',
    test: s => /UnsupportedClassVersionError|class file version 65\.0/.test(s),
    title: 'Неверная версия Java',
    explanation: 'Мод собран для более новой Java, чем запущенная.',
    fixes: ['Используйте Java 21 (лаунчер ставит её сам)', 'Если указан свой путь к Java, проверьте его версию'],
  },
  {
    id: 'jvm-start',
    test: s => /Could not create the Java Virtual Machine|Invalid maximum heap size|Error occurred during initialization of VM|Could not find or load main class/.test(s),
    title: 'Java не смогла запуститься с текущими параметрами',
    explanation: 'Виртуальная машина Java отказалась стартовать. Обычно причина в аргументах JVM или в размере памяти.',
    fixes: ['Проверьте поле дополнительных аргументов JVM и очистите его, если там что-то вручную', 'Проверьте значение ползунка «Память»'],
  },
  {
    id: 'shader',
    test: s => /shader.*(failed|error)|Failed to (compile|link) .*shader/i.test(s),
    title: 'Ошибка в шейдерах',
    explanation: 'Выбранный шейдерпак не смог скомпилироваться на вашей видеокарте.',
    fixes: ['Отключите шейдеры', 'Выберите другой шейдерпак'],
  },
  {
    id: 'gpu',
    test: s => /GLFW error|Failed to create window|Pixel format not accelerated|GL_OUT_OF_MEMORY|GL_INVALID|OpenGL.*error|GLX|WGL/i.test(s),
    title: 'Ошибка видеокарты или драйвера (OpenGL)',
    explanation: 'Драйвер видеокарты вернул ошибку на этапе отрисовки.',
    fixes: ['Обновите драйвер видеокарты с сайта производителя', 'Отключите шейдеры', 'Снизьте графику в настройках Minecraft'],
  },
];

// Разбор текста отчёта о падении (crash-reports).
function parseReport(text) {
  const s = text || '';
  const pick = re => { const m = s.match(re); return m ? m[1].trim() : ''; };
  const mem = s.match(/Memory:\s*\d+ bytes \((\d+) MiB\) \/ \d+ bytes \((\d+) MiB\)/);
  const causes = [...s.matchAll(/^Caused by: (.*)$/gm)].map(m => m[1].trim());
  return {
    description: pick(/^Description:\s*(.*)$/m),
    top: pick(/^([\w.$]+(?:Exception|Error|Throwable)[^\n]*)$/m),
    caused: causes.length ? causes[causes.length - 1] : '',
    suspected: pick(/^\s*Suspected Mods:\s*(.*)$/m),
    minecraft: pick(/Minecraft Version: (.*)/),
    java: pick(/Java Version: (.*)/),
    heapUsedMiB: mem ? Number(mem[1]) : null,
    heapMaxMiB: mem ? Number(mem[2]) : null,
  };
}

// Поиск известных причин. Возвращает список { id, title, explanation, fixes }.
function diagnose(text) {
  const out = [];
  for (const r of RULES) {
    if (r.test(text || '')) out.push({ id: r.id, title: r.title, explanation: r.explanation, fixes: r.fixes });
  }
  return out;
}

// Перевод диагностики в текущем языке. Дополнительное предложение о неполной
// куче — отдельный ключ с плейсхолдерами, чтобы переводить его независимо.
function translateIssues(issues) {
  return issues.map(i => ({
    id: i.id,
    title: t(i.title),
    explanation: t(i.explanation) + (i.extraExplanation ? t(i.extraExplanation, { used: i.heap.used, max: i.heap.max }) : ''),
    fixes: (i.fixes || []).map(f => t(f)),
  }));
}

function tailLines(text, n) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.slice(-n).join('\n');
}

function newestSince(dir, re, sinceMs) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => re.test(f))
    .map(f => { const p = path.join(dir, f); return { p, t: fs.statSync(p).mtimeMs }; })
    .filter(x => x.t >= sinceMs - 2000)
    .sort((a, b) => b.t - a.t);
  return files[0] ? files[0].p : null;
}

// Ищет отчёт о падении и файл hs_err, созданные именно в этой сессии.
function findSessionCrash(gameDir, startedAt) {
  if (!startedAt) return { report: null, hsErr: null };
  const reportPath = newestSince(path.join(gameDir, 'crash-reports'), /\.txt$/i, startedAt);
  const hsErr = newestSince(gameDir, /^hs_err_pid\d+\.log$/i, startedAt);
  return {
    report: reportPath ? { path: reportPath, text: fs.readFileSync(reportPath, 'utf8').slice(0, MAX_REPORT) } : null,
    hsErr,
  };
}

// Собирает всё для окна. logLines — последние строки лога, которые лаунчер видел в сессии.
function buildInfo({ instance, code, startedAt, playMs, logLines, gameDir, found }) {
  const reportText = found.report ? found.report.text : '';
  const latestPath = path.join(gameDir, 'logs', 'latest.log');
  const latestLog = fs.existsSync(latestPath) ? tailLines(fs.readFileSync(latestPath, 'utf8'), 400) : '';
  const logText = [(logLines || []).slice(-400).join('\n'), latestLog].join('\n');

  const engine = engineOf(instance);
  const exit = decodeExit(code, engine);
  const parsed = parseReport(reportText);

  // Сначала отчёт (он точнее), потом лог
  let issues = diagnose(reportText);
  if (!issues.length) issues = diagnose(logText);

  // Особый случай: OutOfMemoryError без текста при кучи далеко не полной — это нативная память
  const heapNotFull = parsed.heapUsedMiB != null && parsed.heapMaxMiB
    && parsed.heapUsedMiB < parsed.heapMaxMiB * 0.7;
  if (heapNotFull) {
    issues = issues.map(i => i.id === 'native-oom'
      ? { ...i, extraExplanation: ' В момент падения куча Java использовала {used} из {max} МБ, то есть она не была заполнена.', heap: { used: parsed.heapUsedMiB, max: parsed.heapMaxMiB } }
      : i);
  }

  if (found.hsErr && !engine) {
    issues.push({
      id: 'jvm-crash',
      title: 'Java аварийно завершилась',
      explanation: 'Виртуальная машина упала целиком, без обычного отчёта. В файле hs_err указана библиотека или метод, из-за которых это произошло.',
      fixes: ['Откройте файл hs_err (путь ниже) и найдите в нём строку с библиотекой', 'Обновите драйвер видеокарты'],
    });
  }

  // Перевод всей диагностики и советов
  issues = translateIssues(issues);

  const fixes = [];
  for (const i of [...issues, exit]) for (const f of i.fixes || []) if (!fixes.includes(f)) fixes.push(f);

  const summary = issues.length ? issues[0].title
    : (exit.ok ? t('Найден отчёт о падении, но известная причина не определена') : exit.title);

  return {
    instanceId: instance.id,
    instanceName: instance.name,
    engine,
    gameDir,
    when: new Date(startedAt + (playMs || 0)).toISOString(),
    playMs: playMs || 0,
    exit,
    summary,
    issues: issues.map(({ title, explanation }) => ({ title, explanation })),
    fixes: fixes.slice(0, 8),
    parsed,
    reportPath: found.report ? found.report.path : '',
    reportText,
    logText: tailLines(logText, 300),
    logPath: fs.existsSync(latestPath) ? latestPath : '',
    hsErrPath: found.hsErr || '',
  };
}

module.exports = { decodeExit, parseReport, diagnose, findSessionCrash, buildInfo, engineOf, RULES };
