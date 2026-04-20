const AVAILABLE_LANGS = ['cs', 'en'];
const COOKIE_NAME = 'lang-choice';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function getBestLang(acceptLanguage) {
  if (!acceptLanguage) return null;

  const prefs = acceptLanguage
    .split(',')
    .map(part => {
      const [langTag, qPart] = part.trim().split(';q=');
      return {
        lang: langTag.split('-')[0].toLowerCase(),
        q: parseFloat(qPart ?? '1.0'),
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of prefs) {
    if (AVAILABLE_LANGS.includes(lang)) return lang;
  }
  return null;
}

function hasCookie(cookieHeader, name) {
  return cookieHeader.split(';').some(c => c.trim().startsWith(name + '='));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Pass through: already on English version or static asset
    if (path.startsWith('/en') || /\.\w+$/.test(path)) {
      return fetch(request);
    }

    // User has already been redirected once — let them navigate freely
    const cookie = request.headers.get('Cookie') || '';
    if (hasCookie(cookie, COOKIE_NAME)) {
      return fetch(request);
    }

    const bestLang = getBestLang(request.headers.get('Accept-Language') || '');

    if (bestLang === 'en') {
      const enUrl = new URL(request.url);
      enUrl.pathname = '/en' + (path === '/' ? '/' : path);
      const headers = new Headers({ Location: enUrl.toString() });
      headers.set('Set-Cookie', `${COOKIE_NAME}=en; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`);
      return new Response(null, { status: 302, headers });
    }

    return fetch(request);
  },
};
