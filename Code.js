function doGet() {
  return HtmlService.createHtmlOutputFromFile('UI')
    .setTitle('Calendar_GAS Ver1.0');
}

function getConfig() {
  return getPublicConfig_();
}

function getAvailableCalendars() {
  return listAvailableCalendars_();
}

function previewSchedule(text, selectedYear, selectedMonth, selectedCategories) {
  const parsed = parseSchedule(text, selectedYear, selectedMonth);
  parsed.events = filterEventsByCategories_(parsed.events, selectedCategories);
  parsed.summary.parsed = parsed.events.length;
  return parsed;
}

function registerSchedule(text, selectedYear, selectedMonth, selectedCategories, calendarId) {
  const parsed = parseSchedule(text, selectedYear, selectedMonth);
  parsed.events = filterEventsByCategories_(parsed.events, selectedCategories);
  parsed.summary.parsed = parsed.events.length;

  if (parsed.errors.length > 0) {
    return {
      success: false,
      message: '入力内容にエラーがあるため登録を中止しました。',
      parsed: parsed,
      registration: {
        registered: [],
        skipped: [],
        failed: [],
        summary: {
          requested: parsed.events.length,
          registered: 0,
          skipped: 0,
          failed: 0
        }
      }
    };
  }

  const registration = registerEvents(parsed.events, calendarId);

  return {
    success: registration.summary.failed === 0,
    message: registration.summary.failed === 0
      ? 'Googleカレンダーへの登録処理が完了しました。'
      : '一部の予定を登録できませんでした。',
    parsed: parsed,
    registration: registration
  };
}

function deleteMonthSchedule(year, month, selectedCategories, calendarId) {
  return deleteEventsByMonth_(year, month, selectedCategories, calendarId);
}

function filterEventsByCategories_(events, selectedCategories) {
  const selected = Array.isArray(selectedCategories) && selectedCategories.length
    ? selectedCategories
    : CONFIG.CATEGORY_ORDER.slice();

  return events.filter(function(eventData) {
    return selected.indexOf(eventData.category) !== -1;
  });
}
