function registerEvents(events, calendarId) {
  if (!Array.isArray(events)) {
    throw new Error('登録対象のイベント配列が不正です。');
  }

  const calendar = getTargetCalendar_(calendarId);
  const registered = [];
  const skipped = [];
  const failed = [];

  events.forEach(function(eventData, index) {
    try {
      validateEventData_(eventData);

      if (CONFIG.DUPLICATE_CHECK.enabled && isDuplicateEvent_(calendar, eventData)) {
        skipped.push({
          index: index,
          title: eventData.title,
          date: eventData.date,
          start: eventData.start,
          end: eventData.end,
          allDay: eventData.allDay,
          category: eventData.category,
          sourceLine: eventData.sourceLine,
          reason: '同一予定が既に存在します。'
        });
        return;
      }

      const calendarEvent = eventData.allDay
        ? createAllDayEvent_(calendar, eventData)
        : createTimedEvent_(calendar, eventData);

      applyEventColor_(calendarEvent, eventData.color);

      registered.push({
        index: index,
        eventId: calendarEvent.getId(),
        title: eventData.title,
        date: eventData.date,
        start: eventData.start,
        end: eventData.end,
        allDay: eventData.allDay,
        category: eventData.category,
        color: eventData.color,
        sourceLine: eventData.sourceLine
      });
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

function listAvailableCalendars_() {
  const calendars = CalendarApp.getAllOwnedCalendars();

  const items = calendars.map(function(calendar) {
    return {
      id: calendar.getId(),
      name: calendar.getName(),
      isDefault: calendar.isMyPrimaryCalendar()
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

  if (!targetId || targetId === 'primary') {
    return CalendarApp.getDefaultCalendar();
  }

  const calendar = CalendarApp.getCalendarById(targetId);
  if (!calendar) {
    throw new Error('指定したGoogleカレンダーが見つかりません。');
  }
  return calendar;
}

function isDuplicateEvent_(calendar, eventData) {
  const range = getEventSearchRange_(eventData);
  const existing = calendar.getEvents(range.start, range.end);

  return existing.some(function(event) {
    if (CONFIG.DUPLICATE_CHECK.compareTitle && event.getTitle() !== eventData.title) {
      return false;
    }

    if (CONFIG.DUPLICATE_CHECK.compareAllDay && event.isAllDayEvent() !== eventData.allDay) {
      return false;
    }

    if (!CONFIG.DUPLICATE_CHECK.compareTime) {
      return true;
    }

    if (eventData.allDay) {
      return formatDateObject_(event.getAllDayStartDate()) === eventData.date;
    }

    const eventStart = formatDateTimeObject_(event.getStartTime());
    const eventEnd = formatDateTimeObject_(event.getEndTime());
    const targetStart = eventData.date + ' ' + eventData.start;
    const targetEnd = eventData.date + ' ' + eventData.end;

    return eventStart === targetStart && eventEnd === targetEnd;
  });
}

function getEventSearchRange_(eventData) {
  const date = parseLocalDate_(eventData.date);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return { start: start, end: end };
}

function deleteEventsByMonth_(year, month, selectedCategories, calendarId) {
  const numericYear = Number(year);
  const numericMonth = Number(month);

  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) {
    throw new Error('年は2000〜2100の範囲で指定してください。');
  }
  if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
    throw new Error('月は1〜12の範囲で指定してください。');
  }

  const calendar = getTargetCalendar_(calendarId);
  const start = new Date(numericYear, numericMonth - 1, 1, 0, 0, 0, 0);
  const end = new Date(numericYear, numericMonth, 1, 0, 0, 0, 0);
  const events = calendar.getEvents(start, end);

  const selected = Array.isArray(selectedCategories) && selectedCategories.length
    ? selectedCategories
    : CONFIG.CATEGORY_ORDER.slice();

  const deleted = [];
  const skipped = [];
  const failed = [];

  events.forEach(function(event) {
    const category = detectCategoryFromEvent_(event);

    if (!category || selected.indexOf(category) === -1) {
      skipped.push({
        title: event.getTitle(),
        start: event.getStartTime(),
        reason: category ? '削除対象カテゴリ外です。' : 'Calendar_GAS作成予定と判定できません。'
      });
      return;
    }

    try {
      deleted.push({
        title: event.getTitle(),
        category: category,
        start: event.getStartTime()
      });
      event.deleteEvent();
    } catch (error) {
      failed.push({
        title: event.getTitle(),
        category: category,
        message: error && error.message ? error.message : String(error)
      });
    }
  });

  return {
    success: failed.length === 0,
    deleted: deleted,
    skipped: skipped,
    failed: failed,
    summary: {
      scanned: events.length,
      deleted: deleted.length,
      skipped: skipped.length,
      failed: failed.length
    }
  };
}

function detectCategoryFromEvent_(event) {
  const description = event.getDescription() || '';
  const match = description.match(/カテゴリ:\s*(仕事|休み|有給|病院|美容|私用)/);
  if (match) return match[1];

  const title = event.getTitle() || '';
  if (/^【仕事】/.test(title)) return '仕事';
  if (title === '休み') return '休み';
  if (title === '有給休暇') return '有給';
  if (/^【病院】/.test(title)) return '病院';
  if (/^【美容】/.test(title)) return '美容';
  if (/^【私用】/.test(title)) return '私用';

  return '';
}

function createAllDayEvent_(calendar, eventData) {
  const date = parseLocalDate_(eventData.date);
  return calendar.createAllDayEvent(eventData.title, date, {
    description: buildDescription_(eventData)
  });
}

function createTimedEvent_(calendar, eventData) {
  const start = parseLocalDateTime_(eventData.date, eventData.start);
  const end = parseLocalDateTime_(eventData.date, eventData.end);

  if (start.getTime() >= end.getTime()) {
    throw new Error('終了日時は開始日時より後にしてください。');
  }

  return calendar.createEvent(eventData.title, start, end, {
    description: buildDescription_(eventData)
  });
}

function buildDescription_(eventData) {
  return [
    'Calendar_GAS Ver1.0',
    'カテゴリ: ' + eventData.category,
    '入力行: ' + eventData.sourceLine
  ].join('\n');
}

function applyEventColor_(calendarEvent, colorName) {
  const colorMap = {
    BLUE: CalendarApp.EventColor.BLUE,
    RED: CalendarApp.EventColor.RED,
    GREEN: CalendarApp.EventColor.GREEN,
    ORANGE: CalendarApp.EventColor.ORANGE,
    MAUVE: CalendarApp.EventColor.MAUVE
  };

  const eventColor = colorMap[colorName];
  if (!eventColor) {
    throw new Error('未対応の色設定です: ' + colorName);
  }

  calendarEvent.setColor(eventColor);
}

function validateEventData_(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    throw new Error('イベントデータが不正です。');
  }
  if (!eventData.title) {
    throw new Error('タイトルが空です。');
  }
  if (!eventData.date || !/^\d{4}-\d{2}-\d{2}$/.test(eventData.date)) {
    throw new Error('日付形式が不正です。');
  }
  if (!eventData.category || !CONFIG.CATEGORIES[eventData.category]) {
    throw new Error('カテゴリが不正です。');
  }
  if (!eventData.allDay && (!eventData.start || !eventData.end)) {
    throw new Error('時間指定予定には開始時刻と終了時刻が必要です。');
  }
}

function parseLocalDate_(dateText) {
  const parts = String(dateText).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);

  if (
    date.getFullYear() !== parts[0] ||
    date.getMonth() !== parts[1] - 1 ||
    date.getDate() !== parts[2]
  ) {
    throw new Error('日付が不正です: ' + dateText);
  }

  return date;
}

function parseLocalDateTime_(dateText, timeText) {
  const dateParts = String(dateText).split('-').map(Number);
  const timeParts = String(timeText).split(':').map(Number);

  const date = new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0],
    timeParts[1],
    0,
    0
  );

  if (
    date.getFullYear() !== dateParts[0] ||
    date.getMonth() !== dateParts[1] - 1 ||
    date.getDate() !== dateParts[2] ||
    date.getHours() !== timeParts[0] ||
    date.getMinutes() !== timeParts[1]
  ) {
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

function testDuplicateCheck() {
  const sample = [
    '【仕事】',
    '7/1 09:00〜18:00 【仕事】早番'
  ].join('\n');

  const parsed = parseSchedule(sample, 2026);
  const result = registerEvents(parsed.events, 'primary');
  Logger.log(JSON.stringify(result, null, 2));
}
