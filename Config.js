const CONFIG = Object.freeze({
  VERSION: '1.0.1',
  CALENDAR_ID: 'primary',
  DEFAULT_YEAR_MODE: 'AUTO',
  DUPLICATE_CHECK: {
    enabled: true,
    compareTitle: true,
    compareTime: true,
    compareAllDay: true
  },
  CATEGORY_ORDER: ['仕事', '休み', '有給', '終日', '病院', '健康', '美容', '私用'],
  CATEGORIES: {
    '仕事': {
      color: 'BLUE',
      defaultAllDay: false,
      titlePrefix: '【仕事】'
    },
    '休み': {
      color: 'RED',
      defaultAllDay: true,
      titlePrefix: ''
    },
    '有給': {
      color: 'RED',
      defaultAllDay: true,
      titlePrefix: ''
    },
    '終日': {
      color: 'YELLOW',
      defaultAllDay: true,
      titlePrefix: ''
    },
    '病院': {
      color: 'MAUVE',
      defaultAllDay: false,
      titlePrefix: '【病院】'
    },
    '健康': {
      color: 'GREEN',
      defaultAllDay: false,
      titlePrefix: '【健康】'
    },
    '美容': {
      color: 'GREEN',
      defaultAllDay: false,
      titlePrefix: '【美容】'
    },
    '私用': {
      color: 'ORANGE',
      defaultAllDay: false,
      titlePrefix: '【私用】'
    }
  },
  WORK_TITLE_RULES: {
    '早番': '【仕事】早番',
    '中番': '【仕事】中番',
    '遅番': '【仕事】遅番'
  },
  TIME_SEPARATORS: ['〜', '～', '~', '-', '−', '－', '―'],
  SUPPORTED_DATE_FORMATS: ['M/D', 'YYYY/M/D']
});

function getPublicConfig_() {
  return {
    version: CONFIG.VERSION,
    calendarId: CONFIG.CALENDAR_ID,
    duplicateCheckEnabled: CONFIG.DUPLICATE_CHECK.enabled,
    categories: CONFIG.CATEGORY_ORDER.map(function(name) {
      return {
        name: name,
        color: CONFIG.CATEGORIES[name].color,
        defaultAllDay: CONFIG.CATEGORIES[name].defaultAllDay
      };
    })
  };
}
