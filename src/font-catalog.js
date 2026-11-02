(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.QijianFonts = catalog;
})(typeof window === 'object' ? window : globalThis, function () {
  const groups = [
    {label:'衬线字体', fonts:[
      ['times','Times New Roman'], ['georgia','Georgia'], ['cambria','Cambria'],
      ['constantia','Constantia'], ['palatino','Palatino Linotype'], ['garamond','Garamond'],
      ['book-antiqua','Book Antiqua'], ['bookman','Bookman Old Style'], ['century','Century'],
      ['schoolbook','Century Schoolbook'], ['baskerville','Baskerville Old Face'],
      ['calisto','Calisto MT'], ['lucida-bright','Lucida Bright'], ['sitka','Sitka Text']
    ]},
    {label:'无衬线字体', fonts:[
      ['arial','Arial'], ['calibri','Calibri'], ['aptos','Aptos'], ['segoe','Segoe UI'],
      ['verdana','Verdana'], ['tahoma','Tahoma'], ['trebuchet','Trebuchet MS'],
      ['candara','Candara'], ['corbel','Corbel'], ['century-gothic','Century Gothic'],
      ['franklin','Franklin Gothic Book'], ['gill','Gill Sans MT'], ['bahnschrift','Bahnschrift']
    ]},
    {label:'等宽字体', fonts:[
      ['mono','Consolas'], ['courier','Courier New'], ['lucida-console','Lucida Console'],
      ['cascadia','Cascadia Mono'], ['source-code','Source Code Pro']
    ]}
  ];
  const latinFonts = Object.fromEntries([['system','ui-serif'], ...groups.flatMap(group => group.fonts)]);
  const chineseFonts = {system:'Microsoft YaHei',yahei:'Microsoft YaHei',serif:'SimSun',kai:'KaiTi',heiti:'SimHei',fangsong:'FangSong'};
  const cssFontName = value => /^[\w-]+$/.test(value) ? value : `"${String(value).replace(/["\\]/g, '\\$&')}"`;
  const fontStack = settings => `${cssFontName(latinFonts[settings.latinFont] || latinFonts.system)},${cssFontName(chineseFonts[settings.chineseFont] || chineseFonts.system)},serif`;
  return {groups, latinFonts, chineseFonts, cssFontName, fontStack};
});
