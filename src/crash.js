// Разбор падения Minecraft: расшифровка кода выхода, отчёт о падении и лог.
// Всё, что видит пользователь, написано по-русски и без сырых кодов без пояснения.
const fs = require('fs');
const path = require('path');

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

// Расшифровка кода выхода процесса.
function decodeExit(code) {
  if (code === 0) return { ok: true, raw: 0, hex: '0x00000000', title: 'Код 0: игра закрылась без ошибки', text: '', fixes: [] };
  if (code === null || code === undefined) {
    return {
      ok: false, raw: null, hex: '', title: 'Процесс Minecraft был завершён извне',
      text: 'Например, через Диспетчер задач или при выключении компьютера.', fixes: [],
    };
  }
  const u = code >>> 0; // Windows отдаёт отрицательные коды, приводим к беззнаковым
  const hex = '0x' + u.toString(16).toUpperCase().padStart(8, '0');
  if (WIN_CODES[u]) return { ok: false, raw: code, hex, ...WIN_CODES[u] };
  if (u === 1) {
    return {
      ok: false, raw: code, hex, title: 'Java завершилась с общей ошибкой (код 1)',
      text: 'Так заканчивается запуск, если Java или игра не смогли стартовать или упали с исключением. Точная причина — в отчёте и логе.',
      fixes: [],
    };
  }
  if (u === 0xFFFFFFFF) {
    return {
      ok: false, raw: code, hex, title: 'Minecraft аварийно завершился (код -1)',
      text: 'Так Minecraft заканчивает работу после ошибки в игре. Точная причина — в отчёте о падении.',
      fixes: [],
    };
  }
  return {
    ok: false, raw: code, hex, title: `Неизвестный код выхода ${code}`,
    text: 'Такого кода нет в справочнике. Смотрите отчёт о падении и лог.', fixes: [],
  };
}

// Правила по тексту отчёта и лога. Порядок важен: более точные выше.
const RULES = [
  {
    id: 'native-oom',
    test: t => /OutOfMemoryError\s*$/m.test(t) || /MemoryUtil|nmemRealloc|nmemAlloc|memRealloc|memAlloc/.test(t) && /OutOfMemoryError/.test(t),
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
    test: t => /OutOfMemoryError: Java heap space/.test(t),
    title: 'Не хватает памяти Java (куча)',
    explanation: 'Игре не хватило выделенной памяти. Это тот объём, который задан ползунком «Память» в лаунчере.',
    fixes: ['Увеличьте ползунок «Память» на 2 ГБ (до 6–8 ГБ, если позволяет ОЗУ)', 'Уменьшите дистанцию прорисовки'],
  },
  {
    id: 'direct-oom',
    test: t => /OutOfMemoryError: Direct buffer memory/.test(t),
    title: 'Исчерпан буфер прямой памяти Java',
    explanation: 'Моды и видеокарта используют буфер вне кучи, и его лимит по умолчанию мал.',
    fixes: ['В поле дополнительных аргументов JVM добавьте -XX:MaxDirectMemorySize=4G', 'Уменьшите дистанцию прорисовки'],
  },
  {
    id: 'metaspace',
    test: t => /OutOfMemoryError: Metaspace/.test(t),
    title: 'Переполнена metaspace: слишком много классов от модов',
    explanation: 'Моды загрузили больше классов, чем помещается в служебную память Java.',
    fixes: ['Уберите моды, которыми не пользуетесь', 'Обновите моды до последних версий'],
  },
  {
    id: 'jre-memory',
    test: t => /There is insufficient memory for the Java Runtime|Could not reserve enough space/.test(t),
    title: 'Windows не выделила Java запрошенную память',
    explanation: 'При запуске Java попросила больше памяти, чем доступно системе.',
    fixes: ['Уменьшите ползунок «Память» в лаунчере', 'Увеличьте файл подкачки', 'Освободите место на системном диске'],
  },
  {
    id: 'stack-overflow',
    test: t => /StackOverflowError/.test(t),
    title: 'Переполнение стека: зацикливание в моде',
    explanation: 'Один из модов или сама игра вызвала себя бесконечно.',
    fixes: ['Уберите моды, добавленные последними', 'Обновите моды до последних версий'],
  },
  {
    id: 'mixin',
    test: t => /Mixin apply failed|MixinApplyError|InvalidInjectionException|Mixin transformation failed/.test(t),
    title: 'Конфликт модов (миксины)',
    explanation: 'Два или больше модов меняют одни и те же части игры несовместимым образом.',
    fixes: ['Отключите мод, который добавили последним', 'Обновите конфликтующие моды', 'Смотрите «Подозреваемые моды» в технических данных'],
  },
  {
    id: 'missing-class',
    test: t => /NoClassDefFoundError|ClassNotFoundException|NoSuchMethodError|NoSuchFieldError|AbstractMethodError/.test(t),
    title: 'Моды не подходят друг другу или нет нужной библиотеки',
    explanation: 'Мод ищет класс или метод, которого нет. Обычно это не установлена зависимость или мод рассчитан на другую версию Minecraft.',
    fixes: ['Проверьте, что все зависимости мода установлены', 'Обновите моды до версии этой сборки'],
  },
  {
    id: 'deps',
    test: t => /Missing or unsupported mandatory dependencies|Incompatible mod set|requires .* but|depends on .* but/i.test(t),
    title: 'Не хватает зависимости или версия мода не подходит',
    explanation: 'Загрузчик нашёл мод, который требует другой мод нужной версии.',
    fixes: ['Установите недостающую зависимость', 'Обновите мод до версии, подходящей к сборке'],
  },
  {
    id: 'duplicate',
    test: t => /Duplicate mod|Found duplicate|duplicate mod/i.test(t),
    title: 'В папке mods есть два одинаковых мода',
    explanation: 'Загрузчик нашёл две копии одного мода и не может выбрать, какую запустить.',
    fixes: ['Удалите лишнюю копию мода'],
  },
  {
    id: 'java-version',
    test: t => /UnsupportedClassVersionError|class file version 65\.0/.test(t),
    title: 'Неверная версия Java',
    explanation: 'Мод собран для более новой Java, чем запущенная.',
    fixes: ['Используйте Java 21 (лаунчер ставит её сам)', 'Если указан свой путь к Java, проверьте его версию'],
  },
  {
    id: 'jvm-start',
    test: t => /Could not create the Java Virtual Machine|Invalid maximum heap size|Error occurred during initialization of VM|Could not find or load main class/.test(t),
    title: 'Java не смогла запуститься с текущими параметрами',
    explanation: 'Виртуальная машина Java отказалась стартовать. Обычно причина в аргументах JVM или в размере памяти.',
    fixes: ['Проверьте поле дополнительных аргументов JVM и очистите его, если там что-то вручную', 'Проверьте значение ползунка «Память»'],
  },
  {
    id: 'shader',
    test: t => /shader.*(failed|error)|Failed to (compile|link) .*shader/i.test(t),
    title: 'Ошибка в шейдерах',
    explanation: 'Выбранный шейдерпак не смог скомпилироваться на вашей видеокарте.',
    fixes: ['Отключите шейдеры', 'Выберите другой шейдерпак'],
  },
  {
    id: 'gpu',
    test: t => /GLFW error|Failed to create window|Pixel format not accelerated|GL_OUT_OF_MEMORY|GL_INVALID|OpenGL.*error|GLX|WGL/i.test(t),
    title: 'Ошибка видеокарты или драйвера (OpenGL)',
    explanation: 'Драйвер видеокарты вернул ошибку на этапе отрисовки.',
    fixes: ['Обновите драйвер видеокарты с сайта производителя', 'Отключите шейдеры', 'Снизьте графику в настройках Minecraft'],
  },
];

// Разбор текста отчёта о падении (crash-reports).
function parseReport(text) {
  const t = text || '';
  const pick = re => { const m = t.match(re); return m ? m[1].trim() : ''; };
  const mem = t.match(/Memory:\s*\d+ bytes \((\d+) MiB\) \/ \d+ bytes \((\d+) MiB\)/);
  const causes = [...t.matchAll(/^Caused by: (.*)$/gm)].map(m => m[1].trim());
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

  const exit = decodeExit(code);
  const parsed = parseReport(reportText);

  // Сначала отчёт (он точнее), потом лог
  let issues = diagnose(reportText);
  if (!issues.length) issues = diagnose(logText);

  // Особый случай: OutOfMemoryError без текста при кучи далеко не полной — это нативная память
  const heapNotFull = parsed.heapUsedMiB != null && parsed.heapMaxMiB
    && parsed.heapUsedMiB < parsed.heapMaxMiB * 0.7;
  if (heapNotFull) {
    issues = issues.map(i => i.id === 'native-oom'
      ? { ...i, explanation: `${i.explanation} В момент падения куча Java использовала ${parsed.heapUsedMiB} из ${parsed.heapMaxMiB} МБ, то есть она не была заполнена.` }
      : i);
  }

  if (found.hsErr) {
    issues.push({
      id: 'jvm-crash',
      title: 'Java аварийно завершилась',
      explanation: 'Виртуальная машина упала целиком, без обычного отчёта. В файле hs_err указана библиотека или метод, из-за которых это произошло.',
      fixes: ['Откройте файл hs_err (путь ниже) и найдите в нём строку с библиотекой', 'Обновите драйвер видеокарты'],
    });
  }

  const fixes = [];
  for (const i of [...issues, exit]) for (const f of i.fixes || []) if (!fixes.includes(f)) fixes.push(f);

  const summary = issues.length ? issues[0].title
    : (exit.ok ? 'Найден отчёт о падении, но известная причина не определена' : exit.title);

  return {
    instanceId: instance.id,
    instanceName: instance.name,
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

module.exports = { decodeExit, parseReport, diagnose, findSessionCrash, buildInfo, RULES };
