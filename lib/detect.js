/**
 * ReconKit — Technology detection catalog (passive heuristics).
 * Window globals, script sources, meta tags, and response headers.
 * Minimal, curated; results are presented as "likely" indicators.
 */
(function (g) {
  'use strict';

  // window global -> tech
  const GLOBALS = {
    React: ['React', 'JavaScript Framework'],
    Vue: ['Vue.js', 'JavaScript Framework'],
    angular: ['AngularJS', 'JavaScript Framework'],
    ng: ['AngularJS', 'JavaScript Framework'],
    Ember: ['Ember.js', 'JavaScript Framework'],
    Backbone: ['Backbone.js', 'JavaScript Framework'],
    jQuery: ['jQuery', 'JavaScript Library'],
    $: ['jQuery-like $', 'JavaScript Library'],
    lodash: ['Lodash', 'JavaScript Library'],
    _: ['Underscore-like _', 'JavaScript Library'],
    moment: ['Moment.js', 'JavaScript Library'],
    axios: ['Axios', 'HTTP Client'],
    D3: ['D3.js', 'Data Visualization'],
    echarts: ['Apache ECharts', 'Data Visualization'],
    THREE: ['Three.js', '3D Graphics'],
    bootstrap: ['Bootstrap', 'CSS Framework'],
    tailwind: ['Tailwind CSS (global)', 'CSS Framework'],
    Alpine: ['Alpine.js', 'JavaScript Framework'],
    Stimulus: ['Stimulus', 'JavaScript Framework'],
    htmx: ['htmx', 'JavaScript Library'],
    marked: ['Marked (Markdown)', 'JavaScript Library'],
    hljs: ['highlight.js', 'Syntax Highlighting'],
    Prism: ['Prism.js', 'Syntax Highlighting'],
    ace: ['Ace Editor', 'Editor'],
    CKEDITOR: ['CKEditor', 'Editor'],
    tinymce: ['TinyMCE', 'Editor'],
    Quill: ['Quill', 'Editor'],
    Swiper: ['Swiper', 'Carousel'],
    Leaflet: ['Leaflet', 'Maps'],
    L: ['Leaflet-like L', 'Maps'],
    google: ['Google APIs interpolated', 'External'],
    marked: ['Marked', 'JavaScript Library']
  };
  // avoid dup keys above
  delete GLOBALS.marked;

  const SCRIPTS = [
    [/react(-|\.)/i, 'React', 'JavaScript Framework'],
    [/next\/static/i, 'Next.js', 'JavaScript Framework'],
    [/core-js/i, 'core-js', 'JavaScript Library'],
    [/jquery/i, 'jQuery', 'JavaScript Library'],
    [/lodash/i, 'Lodash', 'JavaScript Library'],
    [/moment/i, 'Moment.js', 'JavaScript Library'],
    [/bootstrap/i, 'Bootstrap', 'CSS Framework'],
    [/angular/i, 'Angular (bundle)', 'JavaScript Framework'],
    [/vue(?:\.|-)/i, 'Vue.js bundle', 'JavaScript Framework'],
    [/tailwind/i, 'Tailwind CSS', 'CSS Framework'],
    [/htmx\.min/i, 'htmx', 'JavaScript Library'],
    [/alpine/i, 'Alpine.js', 'JavaScript Framework'],
    [/swiper/i, 'Swiper', 'Carousel'],
    [/three\.min/i, 'Three.js', '3D Graphics'],
    [/ace\.min/i, 'Ace Editor', 'Editor'],
    [/d3\.v\d/i, 'D3.js', 'Data Visualization'],
    [/gstatic\.com/i, 'Google static content', 'External Service'],
    [/google-analytics|googletagmanager|gtag/i, 'Google Analytics / Tag Manager', 'Analytics'],
    [/googlesyndication/i, 'Google AdSense', 'Ad Network'],
    [/cloudflare.*\/cdn-cgi\/scripts/i, 'Cloudflare', 'CDN'],
    [/cdn\.jsdelivr\.net/i, 'jsDelivr', 'CDN'],
    [/unpkg\.com/i, 'unpkg', 'CDN'],
    [/cdnjs\.cloudflare\.com/i, 'cdnjs', 'CDN'],
    [/ajax\.googleapis\.com/i, 'Google Hosted Libraries', 'CDN']
  ];

  const CDN_HOSTS = [
    [/cloudflare\.com$/i, 'Cloudflare', 'CDN'],
    [/jsdelivr\.net$/i, 'jsDelivr', 'CDN'],
    [/unpkg\.com$/i, 'unpkg', 'CDN'],
    [/cdnjs$|cdnjs\.cloudflare/i, 'cdnjs', 'CDN'],
    [/googleapis\.com$/i, 'Google', 'CDN'],
    [/amazonaws\.com$|cloudfront\.net$/i, 'Amazon CloudFront/AWS', 'CDN'],
    [/fastly\.net$/i, 'Fastly', 'CDN'],
    [/azureedge\.net|microsoft\.com$/i, 'Microsoft Azure', 'CDN'],
    [/doubleclick\.net$/i, 'Google DoubleClick', 'Ad Network'],
    [/nikto|acunetix/i, '(scanner reference)', 'Scanner']
  ];

  const HEADER_SIGS = [
    [/cloudflare/i, 'Cloudflare', 'CDN/WAF'],
    [/^nginx/i, 'nginx', 'Web Server'],
    [/^apache/i, 'Apache', 'Web Server'],
    [/openresty/i, 'OpenResty', 'Web Server'],
    [/caddy/i, 'Caddy', 'Web Server'],
    [/cloudfront/i, 'Amazon CloudFront', 'CDN'],
    [/^amazons3|^AmazonS3/i, 'Amazon S3', 'Object Storage'],
    [/^microsoft-ii?|^IIS/i, 'Microsoft IIS', 'Web Server'],
    [/gws/i, 'Google Web Server (gws)', 'Web Server'],
    [/varnish/i, 'Varnish', 'Cache'],
    [/squid/i, 'Squid', 'Proxy'],
    [/^ats\//i, 'Apache Traffic Server', 'Proxy/Cache'],
    [/^php/i, 'PHP', 'Language'],
    [/^asp\.net|^ASP\.NET/i, 'ASP.NET', 'Language'],
    [/^express/i, 'Express.js', 'JavaScript Framework']
  ];

  const META_GENERATOR = [
    [/wordpress/i, 'WordPress', 'CMS'],
    [/joomla/i, 'Joomla', 'CMS'],
    [/drupal/i, 'Drupal', 'CMS'],
    [/blogger/i, 'Blogger', 'CMS'],
    [/ghost/i, 'Ghost', 'CMS'],
    [/wix/i, 'Wix', 'Website Builder'],
    [/squarespace/i, 'Squarespace', 'Website Builder'],
    [/shopify/i, 'Shopify', 'E-commerce'],
    [/magento/i, 'Magento', 'E-commerce'],
    [/woocommerce/i, 'WooCommerce', 'E-commerce'],
    [/prestashop/i, 'PrestaShop', 'E-commerce'],
    [/weebly/i, 'Weebly', 'Website Builder'],
    [/webflow/i, 'Webflow', 'Website Builder'],
    [/mediawiki/i, 'MediaWiki', 'Wiki'],
    [/html5 boilerplate/i, 'HTML5 Boilerplate', 'Starter Kit']
  ];

  const DOM_SIGS = [
    [/__NEXT_DATA__|__next/i, 'Next.js', 'JavaScript Framework'],
    [/__NUXT__/i, 'Nuxt.js', 'JavaScript Framework'],
    [/__GATSBY/i, 'Gatsby', 'Static Site Generator'],
    [/webpackChunk/i, 'Webpack', 'Build Tool'],
    [/__vite/i, 'Vite', 'Build Tool'],
    [/wp-emoji|wp-content/i, 'WordPress', 'CMS'],
    [/gatsby/i, 'Gatsby', 'Static Site Generator']
  ];

  function dedupe(list) {
    const seen = new Set();
    return list.filter((x) => {
      if (seen.has(x.name)) return false;
      seen.add(x.name);
      return true;
    });
  }

  /** Check window globals. `w` is a Window-like object. */
  function fromWindow(w) {
    const out = [];
    for (const key of Object.keys(GLOBALS)) {
      try {
        if (key === '$' || key === '_' || key === 'L' || key === 'ng') continue; // too generic as globals
        if (w[key] !== undefined) {
          const [name, category] = GLOBALS[key];
          out.push({ name, category, source: 'window global' });
        }
      } catch (e) { /* cross-origin frames may throw */ }
    }
    // specific framework globals that are distinctive enough
    try {
      if (w.__NEXT_DATA__ !== undefined) out.push({ name: 'Next.js', category: 'JavaScript Framework', source: 'window global' });
      if (w.__NUXT__ !== undefined) out.push({ name: 'Nuxt.js', category: 'JavaScript Framework', source: 'window global' });
    } catch (e) { /* noop */ }
    return out;
  }

  function fromScriptSources(srcs) {
    const out = [];
    for (const src of srcs) {
      for (const [re, name, category] of SCRIPTS) {
        if (re.test(src)) out.push({ name, category, source: 'script://' + src.slice(0, 120) });
      }
    }
    return out;
  }

  function fromHost(hostname) {
    const out = [];
    for (const [re, name, category] of CDN_HOSTS) {
      if (re.test(hostname)) out.push({ name, category, source: 'hostname' });
    }
    return out;
  }

  function fromHeaders(headerEntries) {
    const out = [];
    for (const [k, v] of headerEntries) {
      const lk = k.toLowerCase();
      if (lk === 'server' || lk === 'x-powered-by' || lk === 'via' || lk === 'x-generator' ||
          lk === 'x-aspnet-version' || lk === 'x-azure-ref' || lk === 'cf-ray' || lk === 'x-amz-cf-id') {
        for (const [re, name, category] of HEADER_SIGS) {
          if (re.test(String(v))) out.push({ name, category, source: `header ${k}` });
        }
      }
    }
    return out;
  }

  function fromMetaGenerators(generatorValue) {
    const out = [];
    for (const [re, name, category] of META_GENERATOR) {
      if (re.test(generatorValue)) out.push({ name, category, source: 'meta generator' });
    }
    return out;
  }

  function fromDomMarkers(doc) {
    const out = [];
    const haystack = (doc && doc.documentElement && doc.documentElement.outerHTML || '').slice(0, 20000);
    for (const [re, name, category] of DOM_SIGS) {
      if (re.test(haystack)) out.push({ name, category, source: 'DOM marker' });
    }
    return out;
  }

  g.RekLib.module('detect', function () {
    return {
      fromWindow, fromScriptSources, fromHost, fromHeaders,
      fromMetaGenerators, fromDomMarkers,
      dedupe
    };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);