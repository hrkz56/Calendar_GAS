/**
 * Calendar_GAS Ver1.0 Phase2
 * 勤務表テキストをGoogleカレンダー登録用データへ変換する。
 *
 * 戻り値:
 * {
 *   success: boolean,
 *   year: number,
 *   events: EventData[],
 *   errors: ParseError[],
 *   warnings: ParseWarning[],
 *   summary: { parsed: number, errors: number, warnings: number }
 * }
 */
function parseSchedule(text, selectedYear) {
  const normalized = normalizeInput_(text);
  const lines = normalized.split('\n');
  const baseYear = resolveBaseYear_(selectedYear);
  const events = [];
  const errors = [];
  const warnings = [];

  let currentCategory = '';
  let sourceIndex = 0;

  lines.forEach(function(rawLine, index) {
    const line = rawLine.trim();
    const lineNo = index + 1;

    if (!line) return;

    const headingCategory = detectHeadingCategory_(line);
    if (headingCategory) {
      currentCategory = headingCategory;
      return;
    }

    const parsed = parseScheduleLine_(line, currentCategory, baseYear, lineNo);
    if (parsed.skip) return;

    if (parsed.error) {
      errors.push(parsed.error);
      return;
    }

    if (parsed.warning) {
      warnings.push(parsed.warning);
    }

    parsed.event.sourceIndex = sourceIndex++;
    events.push(parsed.event);
  });

  return {
    success: errors.length === 0,
    year: baseYear,
    events: events,
    errors: errors,
    warnings: warnings,
    summary: {
      parsed: events.length,
      errors: errors.length,
      warnings: warnings.length
    }
  };
}

function normalizeInput_(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function resolveBaseYear_(selectedYear) {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (selectedYear !== undefined && selectedYear !== null && String(selectedYear).trim() !== '') {
    const year = Number(selectedYear);
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
      return year;
    }
    throw new Error('年は2000〜2100の範囲で指定してください。');
  }

  return currentYear;
}

function detectHeadingCategory_(line) {
  const match = line.match(/^【\s*([^】]+?)\s*】$/);
  if (!match) return '';

  const raw = match[1].trim();
  const normalized = normalizeCategoryName_(raw);
  return CONFIG.CATEGORIES[normalized] ? normalized : '';
}

function normalizeCategoryName_(raw) {
  const name = String(raw || '').trim();
  if (name === '健康・美容' || name === '健康美容') return '美容';
  if (name === '休み・有給' || name === '休暇') return '休み';
  if (name === '有給休暇') return '有給';
  return name;
}

function parseScheduleLine_(line, currentCategory, baseYear, lineNo) {
  const dateInfo = extractDate_(line, baseYear);
  if (!dateInfo) {
    return {
      error: makeError_(lineNo, line, '日付を判定できません。')
    };
  }

  if (!isValidDateParts_(dateInfo.year, dateInfo.month, dateInfo.day)) {
    return {
      error: makeError_(lineNo, line, '日付が不正です。')
    };
  }

  const category = detectCategory_(line, currentCategory);
  if (!category) {
    return {
      error: makeError_(lineNo, line, 'カテゴリを判定できません。見出しまたはタイトルにカテゴリを指定してください。')
    };
  }

  const timeInfo = extractTimeRange_(line);
  const explicitAllDay = /(^|[\s　])終日($|[\s　])/.test(line);
  const defaultAllDay = CONFIG.CATEGORIES[category].defaultAllDay;
  const allDay = explicitAllDay || (!timeInfo && defaultAllDay);

  if (!allDay && !timeInfo) {
    return {
      error: makeError_(lineNo, line, '開始時刻と終了時刻が必要です。')
    };
  }

  if (timeInfo && !isValidTimeRange_(timeInfo.start, timeInfo.end)) {
    return {
      error: makeError_(lineNo, line, '時刻または時間範囲が不正です。')
    };
  }

  const title = buildTitle_(line, category, dateInfo, timeInfo, explicitAllDay);
  if (!title) {
    return {
      error: makeError_(lineNo, line, 'タイトルを判定できません。')
    };
  }

  const event = {
    category: category,
    title: title,
    date: formatDate_(dateInfo.year, dateInfo.month, dateInfo.day),
    start: allDay ? '' : timeInfo.start,
    end: allDay ? '' : timeInfo.end,
    allDay: allDay,
    color: CONFIG.CATEGORIES[category].color,
    sourceLine: lineNo,
    sourceText: line
  };

  let warning = null;
  if (category === '仕事' && /在宅/.test(line) && !/（在宅）/.test(title)) {
    event.title += '（在宅）';
  }

  if (category === '有給' && title === '有給') {
    event.title = '有給休暇';
  }

  return {
    event: event,
    warning: warning
  };
}

function extractDate_(line, baseYear) {
  let match = line.match(/(^|[^\d])(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?=$|[^\d])/);
  if (match) {
    return {
      year: Number(match[2]),
      month: Number(match[3]),
      day: Number(match[4]),
      raw: match[0].trim()
    };
  }

  match = line.match(/(^|[^\d])(\d{1,2})[\/\-](\d{1,2})(?=$|[^\d])/);
  if (match) {
    return {
      year: baseYear,
      month: Number(match[2]),
      day: Number(match[3]),
      raw: match[0].trim()
    };
  }

  return null;
}

function extractTimeRange_(line) {
  const separatorClass = CONFIG.TIME_SEPARATORS.map(escapeRegExp_).join('');
  const re = new RegExp('(\\d{1,2}:\\d{2})\\s*[' + separatorClass + ']\\s*(\\d{1,2}:\\d{2})');
  const match = line.match(re);
  if (!match) return null;

  return {
    start: normalizeTime_(match[1]),
    end: normalizeTime_(match[2]),
    raw: match[0]
  };
}

function normalizeTime_(value) {
  const parts = String(value).split(':');
  return pad2_(Number(parts[0])) + ':' + pad2_(Number(parts[1]));
}

function detectCategory_(line, currentCategory) {
  const explicit = line.match(/【\s*([^】]+?)\s*】/g);
  if (explicit && explicit.length) {
    for (let i = 0; i < explicit.length; i++) {
      const name = normalizeCategoryName_(explicit[i].replace(/[【】]/g, ''));
      if (CONFIG.CATEGORIES[name]) return name;
    }
  }

  if (/有給休暇|有給/.test(line)) return '有給';
  if (/休み|休日/.test(line)) return '休み';
  if (/歯医者|病院|クリニック|医院|診療/.test(line)) return '病院';
  if (/美容|眉毛サロン|理容室|美容室|サロン/.test(line)) return '美容';
  if (/早番|中番|遅番|勤務|仕事/.test(line)) return '仕事';

  if (currentCategory && CONFIG.CATEGORIES[currentCategory]) return currentCategory;
  return '';
}

function buildTitle_(line, category, dateInfo, timeInfo, explicitAllDay) {
  let title = line;

  title = title.replace(new RegExp(escapeRegExp_(dateInfo.raw)), ' ');
  if (timeInfo) title = title.replace(new RegExp(escapeRegExp_(timeInfo.raw)), ' ');
  title = title.replace(/(^|[\s　])終日($|[\s　])/g, ' ');
  title = title.replace(/[ ]{2,}/g, ' ').trim();

  if (category === '仕事') {
    const shift = detectWorkShift_(title);
    const remote = /在宅/.test(title);

    if (shift) {
      return CONFIG.WORK_TITLE_RULES[shift] + (remote ? '（在宅）' : '');
    }

    if (/^【仕事】/.test(title)) return title;
    if (title) return '【仕事】' + stripCategoryPrefix_(title);
    return '';
  }

  if (category === '休み') return '休み';
  if (category === '有給') return '有給休暇';

  const prefix = CONFIG.CATEGORIES[category].titlePrefix;
  let cleaned = stripCategoryPrefix_(title);

  if (!cleaned) {
    if (category === '病院') cleaned = '病院';
    if (category === '美容') cleaned = '美容';
    if (category === '私用') cleaned = '私用';
  }

  return prefix && cleaned.indexOf(prefix) !== 0 ? prefix + cleaned : cleaned;
}

function stripCategoryPrefix_(title) {
  return String(title || '')
    .replace(/^【\s*[^】]+?\s*】\s*/, '')
    .trim();
}

function detectWorkShift_(title) {
  const names = Object.keys(CONFIG.WORK_TITLE_RULES);
  for (let i = 0; i < names.length; i++) {
    if (String(title).indexOf(names[i]) !== -1) return names[i];
  }
  return '';
}

function isValidDateParts_(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

function isValidTimeRange_(start, end) {
  if (!isValidTime_(start) || !isValidTime_(end)) return false;
  return timeToMinutes_(start) < timeToMinutes_(end);
}

function isValidTime_(value) {
  const match = String(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function timeToMinutes_(value) {
  const parts = value.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function formatDate_(year, month, day) {
  return year + '-' + pad2_(month) + '-' + pad2_(day);
}

function pad2_(value) {
  return String(value).padStart(2, '0');
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeError_(lineNo, text, message) {
  return {
    line: lineNo,
    text: text,
    message: message
  };
}

/**
 * Apps Scriptエディタでの手動確認用。
 */
function testParseSchedule() {
  const sample = [
    '【仕事】',
    '7/1 09:00〜18:00 【仕事】早番',
    '7/4 09:00〜18:00 【仕事】早番（在宅）',
    '',
    '【休み】',
    '7/3 休み',
    '',
    '【有給】',
    '7/8 有給休暇',
    '',
    '【病院】',
    '7/14 17:00〜17:30 【病院】歯医者',
    '',
    '【美容】',
    '7/28 10:00〜10:30 【美容】眉毛サロン',
    '',
    '【私用】',
    '7/16 終日 資産負債入力',
    '7/21 09:00〜10:00 【私用】ディズニー'
  ].join('\n');

  const result = parseSchedule(sample, 2026);
  Logger.log(JSON.stringify(result, null, 2));
}
