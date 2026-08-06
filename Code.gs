function doGet() {
  return HtmlService.createHtmlOutputFromFile('UI')
    .setTitle('Calendar_GAS Ver1.1');
}

function getConfig() {
  return getPublicConfig_();
}

function getAvailableCalendars() {
  return listAvailableCalendars_();
}

function saveCategoryColorSettings(settings, baseCalendarId) {
  return saveCategoryColorSettings_(settings, baseCalendarId);
}

function previewSchedule(text, selectedYear, selectedMonth, selectedCategories) {
  const parsed = parseSchedule(text, selectedYear);
  parsed.events = filterEventsByCategories_(parsed.events, selectedCategories);
  appendMonthValidationErrors_(parsed, selectedYear, selectedMonth);
  parsed.success = parsed.errors.length === 0;
  parsed.summary.parsed = parsed.events.length;
  parsed.summary.errors = parsed.errors.length;
  return parsed;
}

function registerSchedule(text, selectedYear, selectedMonth, selectedCategories, calendarId, colorSettings) {
  const parsed = previewSchedule(text, selectedYear, selectedMonth, selectedCategories);

  if (parsed.errors.length > 0) {
    return {
      success: false,
      message: '入力内容にエラーがあるため登録を中止しました。',
      parsed: parsed,
      registration: {
        registered: [], skipped: [], failed: [],
        summary: { requested: parsed.events.length, registered: 0, skipped: 0, failed: 0 }
      }
    };
  }

  if (colorSettings && typeof colorSettings === 'object') {
    saveCategoryColorSettings_(colorSettings, calendarId);
  }

  const registration = registerEvents(parsed.events, calendarId);
  console.log(JSON.stringify({
    action: 'register',
    year: Number(selectedYear),
    month: Number(selectedMonth),
    calendarId: calendarId || CONFIG.CALENDAR_ID,
    requested: registration.summary.requested,
    registered: registration.summary.registered,
    skipped: registration.summary.skipped,
    failed: registration.summary.failed
  }));

  return {
    success: registration.summary.failed === 0,
    message: registration.summary.failed === 0
      ? 'Googleカレンダーへの登録処理が完了しました。'
      : '一部の予定を登録できませんでした。',
    parsed: parsed,
    registration: registration
  };
}

function previewMonthDelete(year, month, selectedCategories, calendarId) {
  return previewDeleteEventsByMonth_(year, month, selectedCategories, calendarId);
}

function deleteMonthSchedule(year, month, selectedCategories, calendarId) {
  const result = deleteEventsByMonth_(year, month, selectedCategories, calendarId);
  console.log(JSON.stringify({
    action: 'delete',
    year: Number(year),
    month: Number(month),
    calendarId: calendarId || CONFIG.CALENDAR_ID,
    categories: normalizeSelectedCategories_(selectedCategories),
    scanned: result.summary.scanned,
    deleted: result.summary.deleted,
    skipped: result.summary.skipped,
    failed: result.summary.failed
  }));
  return result;
}

function appendMonthValidationErrors_(parsed, selectedYear, selectedMonth) {
  const year = Number(selectedYear);
  const month = Number(selectedMonth);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    parsed.errors.push({ line: 0, text: '', message: '対象年は2000〜2100の範囲で指定してください。' });
    return;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    parsed.errors.push({ line: 0, text: '', message: '対象月は1〜12の範囲で指定してください。' });
    return;
  }

  parsed.events.forEach(function(eventData) {
    const parts = String(eventData.date || '').split('-').map(Number);
    if (parts[0] !== year || parts[1] !== month) {
      parsed.errors.push({
        line: eventData.sourceLine || 0,
        text: eventData.sourceText || eventData.date || '',
        message: '対象年月（' + year + '年' + month + '月）と予定日が一致しません。'
      });
    }
  });
}

function normalizeSelectedCategories_(selectedCategories) {
  return Array.isArray(selectedCategories) && selectedCategories.length
    ? selectedCategories.slice()
    : CONFIG.CATEGORY_ORDER.slice();
}

function filterEventsByCategories_(events, selectedCategories) {
  const selected = normalizeSelectedCategories_(selectedCategories);

  return events.filter(function(eventData) {
    return selected.indexOf(eventData.category) !== -1;
  });
}
