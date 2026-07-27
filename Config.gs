const COLOR_PALETTE = Object.freeze([
  { id: 'ROSE',        name: 'ローズ',       hex: '#AD1457' },
  { id: 'PINK',        name: 'ピンク',       hex: '#D81B60' },
  { id: 'FLAMINGO',    name: 'フラミンゴ',   hex: '#E67C73' },
  { id: 'TOMATO',      name: 'トマト',       hex: '#D50000' },
  { id: 'TANGERINE',   name: 'タンジェリン', hex: '#F4511E' },
  { id: 'ORANGE',      name: 'オレンジ',     hex: '#EF6C00' },
  { id: 'MANGO',       name: 'マンゴー',     hex: '#F09300' },
  { id: 'BANANA',      name: 'バナナ',       hex: '#F6BF26' },
  { id: 'CITRON',      name: 'シトロン',     hex: '#E4C441' },
  { id: 'AVOCADO',     name: 'アボカド',     hex: '#7CB342' },
  { id: 'PISTACHIO',   name: 'ピスタチオ',   hex: '#33B679' },
  { id: 'BASIL',       name: 'バジル',       hex: '#0B8043' },
  { id: 'PEACOCK',     name: 'ピーコック',   hex: '#039BE5' },
  { id: 'COBALT',      name: 'コバルト',     hex: '#4285F4' },
  { id: 'BLUEBERRY',   name: 'ブルーベリー', hex: '#3F51B5' },
  { id: 'LAVENDER',    name: 'ラベンダー',   hex: '#7986CB' },
  { id: 'GRAPE',       name: 'グレープ',     hex: '#8E24AA' },
  { id: 'AMETHYST',    name: 'アメジスト',   hex: '#B39DDB' },
  { id: 'GRAPHITE',    name: 'グラファイト', hex: '#616161' },
  { id: 'BIRCH',       name: 'バーチ',       hex: '#A79B8E' },
  { id: 'CYAN',        name: 'シアン',       hex: '#46BDC6' },
  { id: 'MINT',        name: 'ミント',       hex: '#7AE7BF' },
  { id: 'LILAC',       name: 'ライラック',   hex: '#DBADFF' },
  { id: 'PEACH',       name: 'ピーチ',       hex: '#FFB878' },
  { id: 'SKY',         name: 'スカイ',       hex: '#A4BDFC' }
]);

const CONFIG = Object.freeze({
  VERSION: '1.1.0',
  CALENDAR_ID: 'primary',
  DEFAULT_YEAR_MODE: 'AUTO',
  MANAGED_CALENDAR_PREFIX: 'ちゃっぴー',
  DUPLICATE_CHECK: {
    enabled: true,
    compareTitle: true,
    compareTime: true,
    compareAllDay: true
  },
  CATEGORY_ORDER: ['仕事', '休み', '有給', '終日', '病院', '健康', '美容', '私用'],
  DEFAULT_CATEGORY_COLORS: {
    '仕事': 'COBALT',
    '休み': 'ROSE',
    '有給': 'ROSE',
    '終日': 'BANANA',
    '病院': 'GRAPE',
    '健康': 'BASIL',
    '美容': 'PISTACHIO',
    '私用': 'ORANGE'
  },
  CATEGORIES: {
    '仕事': { defaultAllDay: false, titlePrefix: '【仕事】' },
    '休み': { defaultAllDay: true, titlePrefix: '' },
    '有給': { defaultAllDay: true, titlePrefix: '' },
    '終日': { defaultAllDay: true, titlePrefix: '' },
    '病院': { defaultAllDay: false, titlePrefix: '【病院】' },
    '健康': { defaultAllDay: false, titlePrefix: '【健康】' },
    '美容': { defaultAllDay: false, titlePrefix: '【美容】' },
    '私用': { defaultAllDay: false, titlePrefix: '【私用】' }
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
  const colorSettings = getCategoryColorSettings_();
  return {
    version: CONFIG.VERSION,
    calendarId: CONFIG.CALENDAR_ID,
    duplicateCheckEnabled: CONFIG.DUPLICATE_CHECK.enabled,
    categories: CONFIG.CATEGORY_ORDER.map(function(name) {
      return {
        name: name,
        colorId: colorSettings[name],
        defaultAllDay: CONFIG.CATEGORIES[name].defaultAllDay
      };
    }),
    colorPalette: COLOR_PALETTE.map(function(item) {
      return { id: item.id, name: item.name, hex: item.hex };
    }),
    categoryColorSettings: colorSettings,
    categoryCalendarMode: true
  };
}

function getColorDefinition_(colorId) {
  const found = COLOR_PALETTE.find(function(item) { return item.id === colorId; });
  if (!found) throw new Error('未対応のカラーIDです: ' + colorId);
  return found;
}
