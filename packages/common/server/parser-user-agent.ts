import { LRUCache } from 'lru-cache';
import { UAParser } from 'ua-parser-js';

const parsedServerUa = {
  isServer: true,
  device: 'server',
  os: '',
  osVersion: '',
  browser: '',
  browserVersion: '',
  brand: '',
  model: '',
} as const;

// Pre-compile all regex patterns for better performance
const IPHONE_MODEL_REGEX = /(iPhone|iPad)\s*([0-9,]+)/i;
const IOS_MODEL_REGEX = /(iOS)\s*([0-9\.]+)/i;
const IPAD_OS_VERSION_REGEX = /iPadOS\s*([0-9_]+)/i;
const SINGLE_NAME_VERSION_REGEX = /^[^\/]+\/[\d.]+$/;

// Device detection regexes
const SAMSUNG_MOBILE_REGEX = /SM-[ABDEFGJMNRWZ][0-9]+/i;
const SAMSUNG_TABLET_REGEX = /SM-T[0-9]+/i;
const LG_MOBILE_REGEX = /LG-[A-Z0-9]+/i;
const MOBILE_REGEX_1 =
  /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i;
const MOBILE_REGEX_2 =
  /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw-(n|u)|c55\/|capi|ccwa|cdm-|cell|chtm|cldc|cmd-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc-s|devi|dica|dmob|do(c|p)o|ds(12|-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(-|_)|g1 u|g560|gene|gf-5|g-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd-(m|p|t)|hei-|hi(pt|ta)|hp( i|ip)|hs-c|ht(c(-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i-(20|go|ma)|i230|iac( |-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|-[a-w])|libw|lynx|m1-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|-([1-8]|c))|phil|pire|pl(ay|uc)|pn-2|po(ck|rt|se)|prox|psio|pt-g|qa-a|qc(07|12|21|32|60|-[2-7]|i-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h-|oo|p-)|sdk\/|se(c(-|0|1)|47|mc|nd|ri)|sgh-|shar|sie(-|m)|sk-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h-|v-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl-|tdg-|tel(i|m)|tim-|t-mo|to(pl|sh)|ts(70|m-|m3|m5)|tx-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas-|your|zeto|zte-/i;
const TABLET_REGEX = /tablet|ipad|xoom|sch-i800|kindle|silk|playbook/i;
const ANDROID_REGEX = /android/i;
const MOBILE_KEYWORD_REGEX = /mobile/i;

// Cache for parsed results - stores up to 1000 unique user agents
const parseCache = new LRUCache<string, UAParser.IResult>({
  ttl: 1000 * 60 * 5,
  ttlAutopurge: true,
  max: 1000,
});

const isIphone = (ua: string) => {
  const model = ua.match(IPHONE_MODEL_REGEX);
  const os = ua.match(IOS_MODEL_REGEX);
  return model && os
    ? {
        model: model[1],
        os: os[1],
        osVersion: os[2],
      }
    : null;
};

const parse = (ua: string): UAParser.IResult => {
  // Check cache first
  const cached = parseCache.get(ua);
  if (cached) {
    return cached;
  }

  const parser = new UAParser(ua);
  const res = parser.getResult();

  // Some user agents are not detected correctly by ua-parser-js
  // Doing some extra checks for ios
  if (!res.device.model && !res.os.name) {
    const iphone = isIphone(ua);
    if (iphone) {
      const result = {
        ...res,
        device: {
          ...res.device,
          model: iphone.model,
          vendor: 'Apple',
        },
        os: {
          ...res.os,
          name: iphone.os,
          version: iphone.osVersion,
        },
      };
      parseCache.set(ua, result);
      return result;
    }
  }

  // Mozilla/5.0 (iPad; iPadOS 18_0; like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/18.0
  if (res.device.model === 'iPad' && !res.os.version) {
    const osVersion = ua.match(IPAD_OS_VERSION_REGEX);
    if (osVersion) {
      const result = {
        ...res,
        os: {
          ...res.os,
          version: osVersion[1]!.replace('_', '.'),
        },
      };
      parseCache.set(ua, result);
      return result;
    }
  }

  // Cache the result
  parseCache.set(ua, res);
  return res;
};

export type UserAgentResult = ReturnType<typeof parseUserAgent>;
export function parseUserAgent(
  ua?: string | null,
  overrides?: Record<string, unknown>,
) {
  if (!ua) return parsedServerUa;
  const res = parse(ua);

  if (isServer(res)) {
    return parsedServerUa;
  }

  return {
    os: (overrides?.__os || res.os.name) as string,
    osVersion: (overrides?.__osVersion || res.os.version) as string,
    browser: (overrides?.__browser || res.browser.name) as string,
    browserVersion: (overrides?.__browserVersion ||
      res.browser.version) as string,
    device: (overrides?.__device || res.device.type || getDevice(ua)) as string,
    brand: (overrides?.__brand || res.device.vendor) as string,
    model: (overrides?.__model || res.device.model) as string,
    isServer: false,
  } as const;
}

function isServer(res: UAParser.IResult) {
  // Matches user agents like "Go-http-client/1.0" or "Go Http Client/1.0"
  // It should just match the first name (with optional spaces) and version
  if (SINGLE_NAME_VERSION_REGEX.test(res.ua)) {
    return true;
  }

  // If all of these are undefined, we can consider it a server
  return (
    res.os.name === undefined &&
    res.browser.name === undefined &&
    res.device.vendor === undefined &&
    res.device.model === undefined
  );
}

export function getDevice(ua: string) {
  // Samsung mobile devices use SM-[A,G,N,etc]XXX pattern
  const isSamsungMobile = SAMSUNG_MOBILE_REGEX.test(ua);
  if (isSamsungMobile) {
    return 'mobile';
  }

  // Samsung tablets use SM-TXXX pattern
  if (SAMSUNG_TABLET_REGEX.test(ua)) {
    return 'tablet';
  }

  // LG mobile devices use LG-XXXX pattern
  const isLGMobile = LG_MOBILE_REGEX.test(ua);
  if (isLGMobile) {
    return 'mobile';
  }

  // Check for mobile patterns
  const mobile1 = MOBILE_REGEX_1.test(ua);
  const mobile2 = MOBILE_REGEX_2.test(ua.slice(0, 4));

  if (mobile1 || mobile2) {
    return 'mobile';
  }

  // Check for tablet patterns
  // Note: We already checked for Samsung mobile/tablet and LG mobile above
  const isAndroid = ANDROID_REGEX.test(ua);
  const hasMobileKeyword = MOBILE_KEYWORD_REGEX.test(ua);

  const tablet =
    TABLET_REGEX.test(ua) ||
    (isAndroid && !hasMobileKeyword && !isSamsungMobile && !isLGMobile);

  if (tablet) {
    return 'tablet';
  }

  return 'desktop';
}
