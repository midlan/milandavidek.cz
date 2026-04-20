export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Pass through: already on English version or static asset
    if (path.startsWith('/en') || /\.\w+$/.test(path)) {
      return fetch(request);
    }

    // Parse primary language from Accept-Language header
    const lang = (request.headers.get('Accept-Language') || '')
      .split(',')[0]
      .split('-')[0]
      .trim()
      .toLowerCase();

    if (lang === 'en') {
      const enUrl = new URL(request.url);
      enUrl.pathname = '/en' + (path === '/' ? '/' : path);
      return Response.redirect(enUrl.toString(), 302);
    }

    return fetch(request);
  }
};
