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

const IPHONE_MODEL_REGEX = /(iPhone|iPad)\s*([0-9,]+)/i;
const IOS_MODEL_REGEX = /(iOS)\s*([0-9\.]+)/i;

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
  const parser = new UAParser(ua);
  const res = parser.getResult();

  // Some user agents are not detected correctly by ua-parser-js
  // Doing some extra checks for ios
  if (!res.device.model && !res.os.name) {
    const iphone = isIphone(ua);
    if (iphone) {
      return {
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
    }
  }

  // Mozilla/5.0 (iPad; iPadOS 18_0; like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/18.0
  if (res.device.model === 'iPad' && !res.os.version) {
    const osVersion = ua.match(/iPadOS\s*([0-9_]+)/i);
    if (osVersion) {
      return {
        ...res,
        os: {
          ...res.os,
          version: osVersion[1]!.replace('_', '.'),
        },
      };
    }
  }

  return res;
};

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
    os: overrides?.__os || res.os.name,
    osVersion: overrides?.__osVersion || res.os.version,
    browser: overrides?.__browser || res.browser.name,
    browserVersion: overrides?.__browserVersion || res.browser.version,
    device: overrides?.__device || res.device.type || getDevice(ua),
    brand: overrides?.__brand || res.device.vendor,
    model: overrides?.__model || res.device.model,
    isServer: false,
  } as const;
}

function isServer(res: UAParser.IResult) {
  // Matches user agents like "Go-http-client/1.0" or "Go Http Client/1.0"
  // It should just match the first name (with optional spaces) and version
  const isSingleNameWithVersion = !!res.ua.match(/^[^\/]+\/[\d.]+$/);
  if (isSingleNameWithVersion) {
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
  if (/SM-[ABDEFGJMNRWZ][0-9]+/i.test(ua)) {
    return 'mobile';
  }

  // Samsung tablets use SM-TXXX pattern
  if (/SM-T[0-9]+/i.test(ua)) {
    return 'tablet';
  }

  // LG mobile devices use LG-XXXX pattern
  if (/LG-[A-Z0-9]+/i.test(ua)) {
    return 'mobile';
  }

  const mobile1 =
    /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
      ua,
    );
  const mobile2 =
    /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw-(n|u)|c55\/|capi|ccwa|cdm-|cell|chtm|cldc|cmd-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc-s|devi|dica|dmob|do(c|p)o|ds(12|-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(-|_)|g1 u|g560|gene|gf-5|g-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd-(m|p|t)|hei-|hi(pt|ta)|hp( i|ip)|hs-c|ht(c(-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i-(20|go|ma)|i230|iac( |-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|-[a-w])|libw|lynx|m1-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|-([1-8]|c))|phil|pire|pl(ay|uc)|pn-2|po(ck|rt|se)|prox|psio|pt-g|qa-a|qc(07|12|21|32|60|-[2-7]|i-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h-|oo|p-)|sdk\/|se(c(-|0|1)|47|mc|nd|ri)|sgh-|shar|sie(-|m)|sk-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h-|v-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl-|tdg-|tel(i|m)|tim-|t-mo|to(pl|sh)|ts(70|m-|m3|m5)|tx-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas-|your|zeto|zte-/i.test(
      ua.slice(0, 4),
    );
  const tablet =
    /tablet|ipad|xoom|sch-i800|kindle|silk|playbook/i.test(ua) ||
    (/android/i.test(ua) &&
      !/mobile/i.test(ua) &&
      !/SM-[ABDEFGJMNRWZ][0-9]+/i.test(ua) &&
      !/LG-[A-Z0-9]+/i.test(ua));

  if (mobile1 || mobile2) {
    return 'mobile';
  }

  if (tablet) {
    return 'tablet';
  }

  return 'desktop';
}
