// Where each logo comes from, and which serie names show it. The slug is the
// file name under assets/. Keep sources on Wikimedia where one exists: the
// others have moved or disappeared before.

export interface LogoSource {
  url: string;
  names: readonly string[];
  /**
   * The dark-theme file: a separate source, or `'invert'` to negate the
   * light one, which is right for a single-colour black glyph.
   */
  dark?: string | 'invert';
}

export const LOGO_SOURCES: Readonly<Record<string, LogoSource>> = {
  amazon: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Amazon_icon.svg',
    names: ['amazon'],
  },
  android: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Android_robot.svg',
    names: ['android', 'android browser'],
  },
  apple: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg',
    dark: 'invert',
    names: ['apple', 'mac os', 'macos'],
  },
  asus: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/2e/ASUS_Logo.svg',
    dark: 'invert',
    names: ['asus'],
  },
  chrome: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg',
    names: ['chrome', 'mobile chrome', 'chrome webview', 'chrome headless'],
  },
  chromecast: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/archive/2/26/20161130022732%21Chromecast_cast_button_icon.svg',
    dark: 'invert',
    names: ['chromecast'],
  },
  chromium: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Chromium_Logo.svg',
    names: ['chromium', 'chromium os'],
  },
  edge: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Microsoft_Edge_logo_%282019%29.png',
    names: ['edge'],
  },
  firefox: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Firefox_logo%2C_2019.svg',
    names: ['firefox', 'mobile firefox'],
  },
  huawei: {
    url: 'https://upload.wikimedia.org/wikipedia/en/0/04/Huawei_Standard_logo.svg',
    names: ['huawei'],
  },
  'huawei-browser': {
    url: 'https://www.apkmirror.com/wp-content/themes/APKMirror/ap_resize/ap_resize.php?src=https%3A%2F%2Fdownloadr2.apkmirror.com%2Fwp-content%2Fuploads%2F2021%2F09%2F49%2F613e45827fe31.png',
    names: ['huawei browser'],
  },
  ios: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/IOS_logo.svg',
    names: ['ios'],
  },
  lg: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/20/LG_symbol.svg',
    names: ['lg'],
  },
  linux: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/35/Tux.svg',
    names: ['linux'],
  },
  'miui-browser': {
    url: 'https://www.apkmirror.com/wp-content/themes/APKMirror/ap_resize/ap_resize.php?src=https%3A%2F%2Fdownloadr2.apkmirror.com%2Fwp-content%2Fuploads%2F2020%2F07%2F79%2F5f06abb0c532a.png',
    names: ['miui browser'],
  },
  motorola: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Motorola_M_symbol_blue.svg',
    names: ['motorola'],
  },
  oneplus: {
    url: 'https://pbs.twimg.com/profile_images/1709165009148809216/ebHb4xhF_400x400.png',
    names: ['oneplus'],
  },
  opera: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Opera_2015_icon.svg',
    names: ['opera', 'opera touch'],
  },
  oppo: {
    url: 'https://indoleads.nyc3.cdn.digitaloceanspaces.com/uploads/offers/logos/8695_95411e367b832.png',
    names: ['oppo'],
  },
  qqbrowser: {
    url: 'https://cdn6.aptoide.com/imgs/6/1/4/614713aba4f9ca93a4e20257014d0713_icon.png',
    names: ['qqbrowser'],
  },
  quark: {
    url: 'https://play-lh.googleusercontent.com/o__Uwu3TEsDVJ92m6zacy2GXotP2faFAlLQJOgOxYFsgoDkDYwODQ4STHY1fe0n_imlpiiUiE-QgRQaWdyi99w=w240-h480-rw',
    names: ['quark'],
  },
  // Wikimedia no longer hosts the Safari compass; simpleicons' glyph in Safari blue.
  safari: {
    url: 'https://cdn.simpleicons.org/safari/006CFF',
    names: ['safari', 'mobile safari'],
  },
  samsung: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/61/Samsung_old_logo_before_year_2015.svg',
    names: ['samsung'],
  },
  'samsung-internet': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Samsung_Internet_logo.svg',
    names: ['samsung internet'],
  },
  silk: {
    url: 'https://m.media-amazon.com/images/I/51VCjQCvF0L.png',
    names: ['silk'],
  },
  sony: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Sony_logo.svg',
    dark: 'invert',
    names: ['sony'],
  },
  ubuntu: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo-ubuntu_cof-orange-hex.svg',
    names: ['ubuntu'],
  },
  'vivo-browser': {
    url: 'https://play-lh.googleusercontent.com/SYGXsBZOFsI4p72IoWtJiuAdp2Acv0WB4e6R1jxNcQdPcOdP1sXk_Cfcr1KBt2lzZQ=w480-h960-rw',
    names: ['vivo browser'],
  },
  windows: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Windows_logo_-_2012.png',
    names: ['windows'],
  },
  xiaomi: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/29/Xiaomi_logo.svg',
    names: ['xiaomi'],
  },
};
