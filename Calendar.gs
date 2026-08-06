const CATEGORY_COLOR_SETTINGS_KEY = 'CATEGORY_COLOR_SETTINGS_V1';
const CATEGORY_CALENDAR_MAP_KEY = 'CATEGORY_CALENDAR_MAP_V1';

function registerEvents(events, calendarId) {
  if (!Array.isArray(events)) throw new Error('登録対象のイベント配列が不正です。');

  const baseCalendar = getTargetCalendar_(calendarId);
  const registered = [];
  const skipped = [];
  const failed = [];
  const colorSettings = getCategoryColorSettings_();

  events.forEach(function(eventData, index) {
    try {
      validateEventData_(eventData);
      const categoryCalendar = getCategoryCalendar_(baseCalendar, eventData.category, true);

      if (CONFIG.DUPLICATE_CHECK.enabled && isDuplicateAcrossCalendars_(categoryCalendar, baseCalendar, eventData)) {
        skipped.push(buildResultItem_(eventData, index, {
          reason: '同一予定が既に存在します。'
        }));
        return;
      }

      const calendarEvent = eventData.allDay
        ? createAllDayEvent_(categoryCalendar, eventData)
        : createTimedEvent_(categoryCalendar, eventData);

      const color = getColorDefinition_(colorSettings[eventData.category]);
      registered.push(buildResultItem_(eventData, index, {
        eventId: calendarEvent.getId(),
        color: color.name,
        colorHex: color.hex,
        calendarName: categoryCalendar.getName()
      }));
    } catch (error) {
      failed.push({
        index: index,
        title: eventData && eventData.title ? eventData.title : '',
        date: eventData && eventData.date ? eventData.date : '',
        sourceLine: eventData && eventData.sourceLine ? eventData.sourceLine : '',
        message: error && error.message ? error.message : String(error)
      });
    }
  });

  return {
    registered: registered,
    skipped: skipped,
    failed: failed,
    summary: {
      requested: events.length,
      registered: registered.length,
      skipped: skipped.length,
      failed: failed.length
    }
  };
}

function buildResultItem_(eventData, index, extra) {
  return Object.assign({
    index: index,
    title: eventData.title,
    date: eventData.date,
    start: eventData.start,
    end: eventData.end,
    allDay: eventData.allDay,
    category: eventData.category,
    sourceLine: eventData.sourceLine
  }, extra || {});
}

function listAvailableCalendars_() {
  const prefix = CONFIG.MANAGED_CALENDAR_PREFIX + '｜';
  const calendars = CalendarApp.getAllOwnedCalendars().filter(function(calendar) {
    return calendar.getName().indexOf(prefix) !== 0;
  });

  const items = calendars.map(function(calendar) {
    const isDefault = calendar.isMyPrimaryCalendar();
    return {
      id: isDefault ? 'primary' : calendar.getId(),
      name: calendar.getName(),
      isDefault: isDefault
    };
  });

  items.sort(function(a, b) {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name, 'ja');
  });
  return items;
}

function getTargetCalendar_(calendarId) {
  const targetId = calendarId || CONFIG.CALENDAR_ID;
  if (!targetId || targetId === 'primary') return CalendarApp.getDefaultCalendar();

  const calendar = CalendarApp.getCalendarById(targetId);
  if (!calendar) throw new Error('指定したGoogleカレンダーが見つかりません。');
  return calendar;
}

function getCategoryColorSettings_() {
  const defaults = Object.assign({}, CONFIG.DEFAULT_CATEGORY_COLORS);
  const raw = PropertiesService.getUserProperties().getProperty(CATEGORY_COLOR_SETTINGS_KEY);
  if (!raw) return defaults;

  try {
    const saved = JSON.parse(raw);
    CONFIG.CATEGORY_ORDER.forEach(function(category) {
      if (saved[category] && COLOR_PALETTE.some(function(item) { return item.id === saved[category]; })) {
        defaults[category] = saved[category];
      }
    });
  } catch (error) {
    // 破損した設定は既定値へフォールバックする。
  }
  return defaults;
}

function saveCategoryColorSettings_(settings, baseCalendarId) {
  if (!settings || typeof settings !== 'object') throw new Error('カラー設定が不正です。');

  const normalized = {};
  CONFIG.CATEGORY_ORDER.forEach(function(category) {
    const colorId = settings[category] || CONFIG.DEFAULT_CATEGORY_COLORS[category];
    getColorDefinition_(colorId);
    normalized[category] = colorId;
  });

  PropertiesService.getUserProperties().setProperty(CATEGORY_COLOR_SETTINGS_KEY, JSON.stringify(normalized));

  const baseCalendar = getTargetCalendar_(baseCalendarId);
  const map = getCategoryCalendarMap_();
  const baseKey = baseCalendar.getId();
  const baseMap = map[baseKey] || {};
  const updated = [];

  CONFIG.CATEGORY_ORDER.forEach(function(category) {
    const categoryCalendarId = baseMap[category];
    if (!categoryCalendarId) return;
    const calendar = CalendarApp.getCalendarById(categoryCalendarId);
    if (!calendar) return;
    applyCalendarColor_(calendar.getId(), normalized[category]);
    updated.push(category);
  });

  return {
    success: true,
    settings: normalized,
    updatedCalendars: updated
  };
}

function getCategoryCalendarMap_() {
  const raw = PropertiesService.getUserProperties().getProperty(CATEGORY_CALENDAR_MAP_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (error) { return {}; }
}

function saveCategoryCalendarMap_(map) {
  PropertiesService.getUserProperties().setProperty(CATEGORY_CALENDAR_MAP_KEY, JSON.stringify(map));
}

function getCategoryCalendar_(baseCalendar, category, createIfMissing) {
  const baseKey = baseCalendar.getId();
  const map = getCategoryCalendarMap_();
  const baseMap = map[baseKey] || {};
  const mappedId = baseMap[category];

  if (mappedId) {
    const mappedCalendar = CalendarApp.getCalendarById(mappedId);
    if (mappedCalendar) return mappedCalendar;
  }

  const expectedName = getManagedCalendarName_(baseCalendar, category);
  const existing = CalendarApp.getAllOwnedCalendars().find(function(calendar) {
    return calendar.getName() === expectedName;
  });

  if (existing) {
    baseMap[category] = existing.getId();
    map[baseKey] = baseMap;
    saveCategoryCalendarMap_(map);
    applyCalendarColor_(existing.getId(), getCategoryColorSettings_()[category]);
    return existing;
  }

  if (!createIfMissing) return null;

  const created = CalendarApp.createCalendar(expectedName, {
    description: 'Calendar_GAS管理用 / 基準: ' + baseCalendar.getName() + ' / カテゴリ: ' + category,
    timeZone: Session.getScriptTimeZone()
  });

  baseMap[category] = created.getId();
  map[baseKey] = baseMap;
  saveCategoryCalendarMap_(map);
  applyCalendarColor_(created.getId(), getCategoryColorSettings_()[category]);
  return created;
}

function getManagedCalendarName_(baseCalendar, category) {
  return CONFIG.MANAGED_CALENDAR_PREFIX + '｜' + baseCalendar.getName() + '｜' + category;
}

function applyCalendarColor_(calendarId, colorId) {
  const color = getColorDefinition_(colorId);
  const endpoint = 'https://www.googleapis.com/calendar/v3/users/me/calendarList/' +
    encodeURIComponent(calendarId) + '?colorRgbFormat=true';

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      backgroundColor: color.hex,
      foregroundColor: getReadableForeground_(color.hex)
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('カレンダー色の設定に失敗しました (' + status + '): ' + response.getContentText());
  }
}

function getReadableForeground_(hex) {
  const value = String(hex || '').replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  return luminance > 170 ? '#000000' : '#ffffff';
}

function isDuplicateAcrossCalendars_(categoryCalendar, baseCalendar, eventData) {
  if (isDuplicateEvent_(categoryCalendar, eventData)) return true;
  if (categoryCalendar.getId() !== baseCalendar.getId() && isDuplicateEvent_(baseCalendar, eventData)) return true;
  return false;
}

function isDuplicateEvent_(calendar, eventData) {
  const range = getEventSearchRange_(eventData);
  const existing = calendar.getEvents(range.start, range.end);

  return existing.some(function(event) {
    if (CONFIG.DUPLICATE_CHECK.compareTitle && event.getTitle() !== eventData.title) return false;
    if (CONFIG.DUPLICATE_CHECK.compareAllDay && event.isAllDayEvent() !== eventData.allDay) return false;
    if (!CONFIG.DUPLICATE_CHECK.compareTime) return true;
    if (eventData.allDay) return formatDateObject_(event.getAllDayStartDate()) === eventData.date;

    const eventStart = formatDateTimeObject_(event.getStartTime());
    const eventEnd = formatDateTimeObject_(event.getEndTime());
    return eventStart === eventData.date + ' ' + eventData.start &&
      eventEnd === eventData.date + ' ' + eventData.end;
  });
}

function getEventSearchRange_(eventData) {
  const date = parseLocalDate_(eventData.date);
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0)
  };
}

function buildDeleteMonthContext_(year, month, selectedCategories, calendarId) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) {
    throw new Error('年は2000〜2100の範囲で指定してください。');
  }
  if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
    throw new Error('月は1〜12の範囲で指定してください。');
  }

  const selected = Array.isArray(selectedCategories) && selectedCategories.length
    ? selectedCategories.slice()
    : CONFIG.CATEGORY_ORDER.slice();
  const baseCalendar = getTargetCalendar_(calendarId);
  const calendars = [baseCalendar];

  selected.forEach(function(category) {
    const managed = getCategoryCalendar_(baseCalendar, category, false);
    if (managed && !calendars.some(function(item) { return item.getId() === managed.getId(); })) {
      calendars.push(managed);
    }
  });

  return {
    year: numericYear,
    month: numericMonth,
    categories: selected,
    baseCalendar: baseCalendar,
    calendars: calendars,
    start: new Date(numericYear, numericMonth - 1, 1, 0, 0, 0, 0),
    end: new Date(numericYear, numericMonth, 1, 0, 0, 0, 0)
  };
}

function collectDeleteMonthTargets_(context) {
  const targets = [];
  const skipped = [];
  let scanned = 0;

  context.calendars.forEach(function(calendar) {
    const events = calendar.getEvents(context.start, context.end);
    scanned += events.length;

    events.forEach(function(event) {
      const category = detectCategoryFromEvent_(event);
      if (!category || context.categories.indexOf(category) === -1) {
        skipped.push({
          title: event.getTitle(),
          start: event.getStartTime(),
          reason: category ? '削除対象カテゴリ外です。' : 'Calendar_GAS作成予定と判定できません。'
        });
        return;
      }

      targets.push({
        event: event,
        title: event.getTitle(),
        category: category,
        start: event.getStartTime(),
        calendar: calendar.getName()
      });
    });
  });

  return {
    targets: targets,
    skipped: skipped,
    scanned: scanned
  };
}

function previewDeleteEventsByMonth_(year, month, selectedCategories, calendarId) {
  const context = buildDeleteMonthContext_(year, month, selectedCategories, calendarId);
  const collected = collectDeleteMonthTargets_(context);

  return {
    year: context.year,
    month: context.month,
    categories: context.categories,
    baseCalendar: {
      id: context.baseCalendar.isMyPrimaryCalendar() ? 'primary' : context.baseCalendar.getId(),
      name: context.baseCalendar.getName()
    },
    calendars: context.calendars.map(function(calendar) {
      return {
        id: calendar.isMyPrimaryCalendar() ? 'primary' : calendar.getId(),
        name: calendar.getName()
      };
    }),
    targets: collected.targets.map(function(item) {
      return {
        title: item.title,
        category: item.category,
        start: item.start,
        calendar: item.calendar
      };
    }),
    summary: {
      scanned: collected.scanned,
      targets: collected.targets.length,
      skipped: collected.skipped.length
    }
  };
}

function deleteEventsByMonth_(year, month, selectedCategories, calendarId) {
  const context = buildDeleteMonthContext_(year, month, selectedCategories, calendarId);
  const collected = collectDeleteMonthTargets_(context);
  const deleted = [];
  const failed = [];

  collected.targets.forEach(function(item) {
    try {
      deleted.push({
        title: item.title,
        category: item.category,
        start: item.start,
        calendar: item.calendar
      });
      item.event.deleteEvent();
    } catch (error) {
      failed.push({
        title: item.title,
        category: item.category,
        message: error && error.message ? error.message : String(error)
      });
    }
  });

  return {
    success: failed.length === 0,
    deleted: deleted,
    skipped: collected.skipped,
    failed: failed,
    summary: {
      scanned: collected.scanned,
      deleted: deleted.length,
      skipped: collected.skipped.length,
      failed: failed.length
    }
  };
}

function detectCategoryFromEvent_(event) {
  const description = event.getDescription() || '';
  const match = description.match(/カテゴリ:\s*(仕事|休み|有給|終日|病院|健康|美容|私用)/);
  if (match) return match[1];

  const title = event.getTitle() || '';
  if (/^【仕事】/.test(title)) return '仕事';
  if (title === '休み') return '休み';
  if (/^(有給休暇|午後休|2時間休)$/.test(title)) return '有給';
  if (title === '資産負債入力' || /^【終日】/.test(title)) return '終日';
  if (/^【病院】/.test(title)) return '病院';
  if (/^【健康】/.test(title)) return '健康';
  if (/^【美容】/.test(title)) return '美容';
  if (/^【私用】/.test(title)) return '私用';
  return '';
}

function createAllDayEvent_(calendar, eventData) {
  const date = parseLocalDate_(eventData.date);
  return calendar.createAllDayEvent(eventData.title, date, { description: buildDescription_(eventData) });
}

function createTimedEvent_(calendar, eventData) {
  const start = parseLocalDateTime_(eventData.date, eventData.start);
  const end = parseLocalDateTime_(eventData.date, eventData.end);
  if (start.getTime() >= end.getTime()) throw new Error('終了日時は開始日時より後にしてください。');
  return calendar.createEvent(eventData.title, start, end, { description: buildDescription_(eventData) });
}

function buildDescription_(eventData) {
  return [
    'Calendar_GAS Ver1.1',
    'カテゴリ: ' + eventData.category,
    '入力行: ' + eventData.sourceLine
  ].join('\n');
}

function validateEventData_(eventData) {
  if (!eventData || typeof eventData !== 'object') throw new Error('イベントデータが不正です。');
  if (!eventData.title) throw new Error('タイトルが空です。');
  if (!eventData.date || !/^\d{4}-\d{2}-\d{2}$/.test(eventData.date)) throw new Error('日付形式が不正です。');
  if (!eventData.category || !CONFIG.CATEGORIES[eventData.category]) throw new Error('カテゴリが不正です。');
  if (!eventData.allDay && (!eventData.start || !eventData.end)) throw new Error('時間指定予定には開始時刻と終了時刻が必要です。');
}

function parseLocalDate_(dateText) {
  const parts = String(dateText).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
    throw new Error('日付が不正です: ' + dateText);
  }
  return date;
}

function parseLocalDateTime_(dateText, timeText) {
  const dateParts = String(dateText).split('-').map(Number);
  const timeParts = String(timeText).split(':').map(Number);
  const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0, 0);
  if (date.getFullYear() !== dateParts[0] || date.getMonth() !== dateParts[1] - 1 || date.getDate() !== dateParts[2] ||
      date.getHours() !== timeParts[0] || date.getMinutes() !== timeParts[1]) {
    throw new Error('日時が不正です: ' + dateText + ' ' + timeText);
  }
  return date;
}

function formatDateObject_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatDateTimeObject_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}
