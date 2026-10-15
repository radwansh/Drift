/* @ds-bundle: {"format":4,"namespace":"Clarivo","components":[{"name":"Button"},{"name":"TextField"},{"name":"SegmentedControl"},{"name":"Badge"},{"name":"Variance"},{"name":"Stat"},{"name":"Notice"},{"name":"DriftStrip"},{"name":"Logo"},{"name":"Icon"}]} */
(function () {
  'use strict';
  /* React is read at render time, so the bundle can load before or after React 18. */
  function R() { return window.React; }
  function h() { var r = R(); return r.createElement.apply(r, arguments); }
  var MINUS = '−';

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) { if (arguments[i]) out.push(arguments[i]); }
    return out.join(' ');
  }
  function omit(obj, keys) {
    var out = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) out[k] = obj[k]; }
    return out;
  }
  var uid = 0;
  function useId(prefix) {
    var ref = R().useRef(null);
    if (ref.current === null) { uid += 1; ref.current = prefix + uid; }
    return ref.current;
  }

  /* Icons: 20px grid, 1.75 stroke, round caps. Anything beyond these comes from Lucide at stroke 1.75. */
  var RING = 'M10 1.75a8.25 8.25 0 1 1 0 16.5a8.25 8.25 0 1 1 0-16.5z';
  var ICONS = {
    'arrow-up': ['M10 16V4', 'M5 9l5-5 5 5'],
    'arrow-down': ['M10 4v12', 'M5 11l5 5 5-5'],
    'arrow-right': ['M4 10h12', 'M11 5l5 5-5 5'],
    'minus': ['M4.5 10h11'],
    'chevron-down': ['M5 7.5l5 5 5-5'],
    'info': [RING, 'M10 9v5', 'M10 6.25v.01'],
    'check-circle': [RING, 'M6.5 10.25l2.4 2.4 4.6-5.1'],
    'alert': ['M10 2.75 1.75 17.25h16.5z', 'M10 8v4.25', 'M10 14.75v.01'],
    'x-circle': [RING, 'M7.25 7.25l5.5 5.5', 'M12.75 7.25l-5.5 5.5'],
    'upload': ['M10 13V3.5', 'M6 7.5l4-4 4 4', 'M3.5 13v2.75c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V13'],
    'search': ['M8.75 2.5a6.25 6.25 0 1 1 0 12.5a6.25 6.25 0 1 1 0-12.5z', 'M13.25 13.25 17.5 17.5'],
    'download': ['M10 3.5V13', 'M6 9l4 4 4-4', 'M3.5 13v2.75c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V13'],
    'check': ['M4.5 10.5l3.5 3.5 7.5-8'],
    'globe': [RING, 'M1.75 10h16.5', 'M10 1.75c2.4 2.3 3.6 5.05 3.6 8.25s-1.2 5.95-3.6 8.25c-2.4-2.3-3.6-5.05-3.6-8.25s1.2-5.95 3.6-8.25z'],
    'lock': ['M5 9h10a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M6.75 9V6.5a3.25 3.25 0 0 1 6.5 0V9'],
    'layers': ['M10 2.5 2.5 6.25 10 10l7.5-3.75z', 'M2.5 10 10 13.75 17.5 10', 'M2.5 13.75 10 17.5l7.5-3.75'],
    'shield-check': ['M10 2.25 3.75 4.75v4.6c0 4.1 2.65 7 6.25 8.4 3.6-1.4 6.25-4.3 6.25-8.4v-4.6z', 'M7.25 10.25l1.9 1.9 3.6-4'],
    'users': ['M7.5 9.25a3 3 0 1 0 0-6a3 3 0 1 0 0 6z', 'M2.25 17c.4-2.9 2.55-4.75 5.25-4.75s4.85 1.85 5.25 4.75', 'M13 3.4a3 3 0 0 1 0 5.7', 'M14.5 12.4c1.8.5 3 2.1 3.25 4.6'],
    'ban': [RING, 'M4.2 4.2l11.6 11.6'],
    'trash': ['M3.5 5.5h13', 'M8 5.5V3.75h4V5.5', 'M5 5.5l.75 11h8.5L15 5.5', 'M8.5 8.75v5', 'M11.5 8.75v5'],
    'mail': ['M3 4.75h14a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75v-9A.75.75 0 0 1 3 4.75z', 'M2.5 5.5 10 11l7.5-5.5'],
    'menu': ['M3 6h14', 'M3 10h14', 'M3 14h14'],
    'x': ['M5 5l10 10', 'M15 5 5 15'],
    'columns': ['M3.25 3.25h13.5v13.5H3.25z', 'M8 3.25v13.5', 'M12.75 3.25v13.5'],
    'chart': ['M3.25 16.75h13.5', 'M6 13.5V9.5', 'M10 13.5V5.5', 'M14 13.5v-6']
  };

  function Icon(props) {
    var paths = ICONS[props.name] || ICONS.info;
    var size = props.size || 16;
    var a = {
      className: cx('cv-icon', props.className), width: size, height: size, viewBox: '0 0 20 20',
      fill: 'none', stroke: 'currentColor', strokeWidth: props.strokeWidth || 1.75,
      strokeLinecap: 'round', strokeLinejoin: 'round', focusable: 'false'
    };
    if (props.title) { a.role = 'img'; a['aria-label'] = props.title; } else { a['aria-hidden'] = 'true'; }
    return h('svg', a, paths.map(function (d, i) { return h('path', { key: i, d: d }); }));
  }

  function DriftStrip(props) {
    var count = props.count || 24;
    var animate = props.animate || false;
    var drift = animate === 'scan' ? -1 : (props.drift != null ? props.drift : Math.round((count - 1) * 0.7));
    var ticks = [];
    for (var i = 0; i < count; i++) {
      ticks.push(h('span', {
        key: i,
        className: cx('cv-drift__tick', i === drift && 'cv-drift__tick--drift'),
        style: animate === 'scan' ? { animationDelay: (i * 90) + 'ms' } : undefined
      }));
    }
    var a = { className: cx('cv-drift', 'cv-drift--' + (props.size || 'md'), animate && ('cv-drift--' + animate), props.className) };
    if (props.label) { a.role = 'img'; a['aria-label'] = props.label; } else { a['aria-hidden'] = 'true'; }
    return h('span', a, ticks);
  }

  function Button(props) {
    var variant = props.variant || 'primary';
    var size = props.size || 'md';
    var rest = omit(props, ['variant', 'size', 'iconLeft', 'iconRight', 'iconOnly', 'loading', 'children', 'className', 'type', 'href', 'ariaLabel']);
    if (props.ariaLabel && !rest['aria-label']) rest['aria-label'] = props.ariaLabel;
    var kids = [];
    if (props.loading) kids.push(h(DriftStrip, { key: 'l', count: 5, size: 'xs', animate: 'scan' }));
    else if (props.iconLeft) kids.push(h(Icon, { key: 'il', name: props.iconLeft }));
    if (props.iconOnly) {
      if (!rest['aria-label'] && typeof props.children === 'string') rest['aria-label'] = props.children;
    } else {
      kids.push(h('span', { key: 't' }, props.children));
    }
    if (props.iconRight && !props.loading) kids.push(h(Icon, { key: 'ir', name: props.iconRight }));
    var cls = cx('cv-btn', 'cv-btn--' + variant, 'cv-btn--' + size, props.iconOnly && 'cv-btn--icon-only', props.className);
    if (props.href) {
      /* A destination is a link: same look, real <a>. */
      return h('a', Object.assign({ href: props.href, className: cls }, omit(rest, ['disabled'])), kids);
    }
    return h('button', Object.assign({
      type: props.type || 'button',
      className: cls,
      'aria-busy': props.loading ? 'true' : undefined
    }, rest), kids);
  }

  function TextField(props) {
    var autoId = useId('cv-field-');
    var id = props.id || autoId;
    var msgId = id + '-msg';
    var rest = omit(props, ['label', 'hint', 'error', 'prefix', 'suffix', 'className', 'id', 'mono']);
    var input = h('input', Object.assign({ type: 'text' }, rest, {
      id: id,
      className: cx('cv-field__input', props.mono && 'cv-field__input--mono'),
      'aria-invalid': props.error ? 'true' : undefined,
      'aria-describedby': (props.error || props.hint) ? msgId : undefined
    }));
    var msg = null;
    if (props.error) msg = h('p', { className: 'cv-field__msg cv-field__msg--error', id: msgId }, h(Icon, { name: 'x-circle' }), props.error);
    else if (props.hint) msg = h('p', { className: 'cv-field__msg', id: msgId }, props.hint);
    return h('div', { className: cx('cv-field', props.error && 'cv-field--invalid', props.className) },
      h('label', { className: 'cv-field__label', htmlFor: id }, props.label),
      h('div', { className: 'cv-field__control' },
        props.prefix ? h('span', { className: 'cv-field__affix', 'aria-hidden': 'true' }, props.prefix) : null,
        input,
        props.suffix ? h('span', { className: 'cv-field__affix', 'aria-hidden': 'true' }, props.suffix) : null),
      msg);
  }

  function SegmentedControl(props) {
    var opts = (props.options || []).map(function (o) { return typeof o === 'object' ? o : { value: o, label: String(o) }; });
    var controlled = props.value !== undefined;
    var st = R().useState(props.defaultValue !== undefined ? props.defaultValue : (opts[0] ? opts[0].value : null));
    var value = controlled ? props.value : st[0];
    function pick(v) { if (!controlled) st[1](v); if (props.onChange) props.onChange(v); }
    return h('div', {
      className: cx('cv-seg', props.size === 'sm' && 'cv-seg--sm', props.className),
      role: 'group', 'aria-label': props['aria-label'] || props.label || undefined
    }, opts.map(function (o) {
      return h('button', {
        key: String(o.value), type: 'button', className: 'cv-seg__btn',
        'aria-pressed': o.value === value ? 'true' : 'false',
        onClick: function () { pick(o.value); }
      }, o.label);
    }));
  }

  function Badge(props) {
    var tone = props.tone || 'neutral';
    var dot = props.dot != null ? props.dot : (tone === 'signal' && !props.icon);
    return h('span', { className: cx('cv-badge', 'cv-badge--' + tone, props.className) },
      props.icon ? h(Icon, { name: props.icon, size: 12, strokeWidth: 2 }) : null,
      dot ? h('span', { className: 'cv-badge__dot', 'aria-hidden': 'true' }) : null,
      props.children);
  }

  function fmt(n, locale, currency, decimals) {
    var o = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    if (currency) { o.style = 'currency'; o.currency = currency; }
    try { return new Intl.NumberFormat(locale, o).format(n); } catch (e) { return String(n); }
  }

  function Variance(props) {
    var v = Number(props.value) || 0;
    var dir = props.direction || (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
    var locale = props.locale || 'en-GB';
    var decimals = props.decimals != null ? props.decimals : 2;
    var none = dir === 'flat' && v === 0;
    var sign = v > 0 ? '+' : v < 0 ? MINUS : '';
    var amount = none ? 'No change' : sign + fmt(Math.abs(v), locale, props.currency, decimals);
    var pct = null;
    if (props.percent != null && !none) {
      var p = Number(props.percent);
      pct = (p > 0 ? '+' : p < 0 ? MINUS : '') + fmt(Math.abs(p), locale, null, 1) + '%';
    }
    var icon = dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'minus';
    var spoken = dir === 'up' ? 'Increase ' : dir === 'down' ? 'Decrease ' : '';
    return h('span', { className: cx('cv-var', 'cv-var--' + dir, props.flagged && 'cv-var--flagged', props.size === 'lg' && 'cv-var--lg', props.className) },
      props.flagged ? h('span', { className: 'cv-var__flag', 'aria-hidden': 'true' }) : null,
      h(Icon, { name: icon, strokeWidth: 2 }),
      spoken ? h('span', { className: 'cv-sr' }, spoken) : null,
      h('span', null, amount),
      pct ? h('span', { className: 'cv-var__pct' }, pct) : null,
      props.flagged ? h('span', { className: 'cv-sr' }, ', flagged') : null);
  }

  function Stat(props) {
    var foot = (props.variance || props.caption) ? h('div', { className: 'cv-stat__foot' },
      props.variance ? h(Variance, props.variance) : null,
      props.caption ? h('span', null, props.caption) : null) : null;
    return h('div', { className: cx('cv-stat', props.className) },
      h('div', { className: 'cv-stat__label' }, props.label),
      h('div', { className: 'cv-stat__value' }, props.value),
      foot);
  }

  function Notice(props) {
    var tone = props.tone || 'info';
    var icon = { info: 'info', success: 'check-circle', warning: 'alert', danger: 'x-circle' }[tone] || 'info';
    return h('div', { className: cx('cv-notice', 'cv-notice--' + tone, props.className), role: tone === 'danger' ? 'alert' : 'status' },
      h(Icon, { name: icon, size: 20, className: 'cv-notice__icon' }),
      h('div', { className: 'cv-notice__body' },
        props.title ? h('p', { className: 'cv-notice__title' }, props.title) : null,
        props.children ? h('div', { className: 'cv-notice__text' }, props.children) : null),
      props.action || null);
  }

  /* Logo geometry: the Drift C (ring with its upper segment drifted outward) + the Instrument Sans 700 wordmark with a square tittle. */
  var WORD = 'M291.0 10.0Q211.0 10.0 150.0 -24.0Q89.0 -58.0 54.5 -118.0Q20.0 -178.0 20.0 -255.0Q20.0 -332.0 54.5 -392.0Q89.0 -452.0 150.0 -486.0Q211.0 -520.0 291.0 -520.0Q358.0 -520.0 411.5 -495.5Q465.0 -471.0 499.5 -428.0Q534.0 -385.0 544.0 -327.0H399.0Q388.0 -364.0 359.5 -383.0Q331.0 -402.0 293.0 -402.0Q257.0 -402.0 230.5 -384.0Q204.0 -366.0 190.0 -333.0Q176.0 -300.0 176.0 -255.0Q176.0 -210.0 190.0 -177.0Q204.0 -144.0 230.5 -126.0Q257.0 -108.0 293.0 -108.0Q331.0 -108.0 359.5 -127.0Q388.0 -146.0 399.0 -183.0H544.0Q534.0 -125.0 499.5 -82.0Q465.0 -39.0 411.5 -14.5Q358.0 10.0 291.0 10.0ZM610.0 0.0V-720.0H760.0V0.0ZM1189.0 0.0Q1183.0 -22.0 1180.5 -47.0Q1178.0 -72.0 1178.0 -105.0H1174.0V-346.0Q1174.0 -377.0 1153.5 -394.5Q1133.0 -412.0 1093.0 -412.0Q1055.0 -412.0 1032.5 -399.0Q1010.0 -386.0 1003.0 -361.0H860.0Q870.0 -430.0 931.0 -475.0Q992.0 -520.0 1098.0 -520.0Q1208.0 -520.0 1266.0 -471.0Q1324.0 -422.0 1324.0 -330.0V-105.0Q1324.0 -80.0 1327.5 -54.5Q1331.0 -29.0 1339.0 0.0ZM1011.0 10.0Q935.0 10.0 890.0 -28.5Q845.0 -67.0 845.0 -131.0Q845.0 -202.0 898.5 -245.5Q952.0 -289.0 1048.0 -302.0L1197.0 -323.0V-236.0L1073.0 -217.0Q1033.0 -211.0 1014.0 -195.0Q995.0 -179.0 995.0 -151.0Q995.0 -126.0 1013.0 -113.0Q1031.0 -100.0 1061.0 -100.0Q1108.0 -100.0 1141.0 -125.5Q1174.0 -151.0 1174.0 -185.0L1188.0 -105.0Q1166.0 -48.0 1121.0 -19.0Q1076.0 10.0 1011.0 10.0ZM1427.0 0.0V-510.0H1574.0V-390.0H1577.0V0.0ZM1577.0 -266.0 1564.0 -387.0Q1582.0 -452.0 1623.0 -486.0Q1664.0 -520.0 1725.0 -520.0Q1744.0 -520.0 1753.0 -516.0V-376.0Q1748.0 -378.0 1739.0 -378.5Q1730.0 -379.0 1717.0 -379.0Q1645.0 -379.0 1611.0 -353.5Q1577.0 -328.0 1577.0 -266.0ZM1804.0 0.0V-510.0H1954.0V0.0ZM2191.0 0.0 1990.0 -510.0H2151.0L2308.0 -34.0H2224.0L2380.0 -510.0H2537.0L2336.0 0.0ZM2809.0 10.0Q2725.0 10.0 2661.5 -23.5Q2598.0 -57.0 2562.5 -117.5Q2527.0 -178.0 2527.0 -257.0Q2527.0 -336.0 2562.5 -395.0Q2598.0 -454.0 2661.5 -487.0Q2725.0 -520.0 2809.0 -520.0Q2894.0 -520.0 2957.5 -487.0Q3021.0 -454.0 3056.0 -395.0Q3091.0 -336.0 3091.0 -257.0Q3091.0 -178.0 3055.5 -117.5Q3020.0 -57.0 2956.5 -23.5Q2893.0 10.0 2809.0 10.0ZM2809.0 -108.0Q2844.0 -108.0 2872.5 -126.0Q2901.0 -144.0 2918.0 -177.5Q2935.0 -211.0 2935.0 -258.0Q2935.0 -327.0 2898.5 -364.5Q2862.0 -402.0 2809.0 -402.0Q2756.0 -402.0 2719.5 -364.0Q2683.0 -326.0 2683.0 -258.0Q2683.0 -211.0 2700.0 -177.5Q2717.0 -144.0 2745.5 -126.0Q2774.0 -108.0 2809.0 -108.0Z';
  var LOGO = {
    mark: { vb: [12, 12, 96, 96], c: 'M74.833 14.349A48 48 0 1 0 93.941 93.941L79.799 79.799A28 28 0 1 1 68.652 33.370Z', seg: 'M107.417 32.603A48 48 0 0 0 89.035 13.568L79.035 30.889A28 28 0 0 1 89.758 41.992Z' },
    word: { vb: [20, -740, 3071, 750], tittle: [1804, -740, 150, 150] },
    lockup: { vb: [0, -755, 3987, 790], shift: 896.4, c: 'M517.062 -735.667A395 395 0 1 0 674.307 -80.693L557.929 -197.071A230.417 230.417 0 1 1 466.203 -579.139Z', seg: 'M785.201 -585.456A395 395 0 0 0 633.937 -742.095L551.645 -599.562A230.417 230.417 0 0 1 639.883 -508.189Z' }
  };

  function Logo(props) {
    var variant = props.variant || 'lockup';
    var tone = props.tone || 'auto';
    var height = props.height || 32;
    var ink = tone === 'reversed' ? '#ffffff' : tone === 'mono' ? 'currentColor' : tone === 'brand' ? '#121a22' : 'var(--ink, #121a22)';
    var sig = tone === 'mono' ? 'currentColor' : tone === 'auto' ? 'var(--signal, #e0592a)' : '#e0592a';
    var g = LOGO[variant] || LOGO.lockup;
    var vb = g.vb;
    var kids;
    function rect(fill) { var t = LOGO.word.tittle; return h('rect', { key: 't', x: t[0], y: t[1], width: t[2], height: t[3], style: { fill: fill } }); }
    if (variant === 'mark') {
      kids = [h('path', { key: 'c', d: g.c, style: { fill: ink } }), h('path', { key: 's', d: g.seg, style: { fill: sig } })];
    } else if (variant === 'wordmark') {
      kids = [h('path', { key: 'w', d: WORD, style: { fill: ink } }), rect(sig)];
    } else {
      kids = [h('path', { key: 'c', d: g.c, style: { fill: ink } }), h('path', { key: 's', d: g.seg, style: { fill: sig } }),
        h('g', { key: 'w', transform: 'translate(' + g.shift + ' 0)' }, h('path', { d: WORD, style: { fill: ink } }), rect(ink))];
    }
    return h('svg', {
      className: cx('cv-logo', props.className), viewBox: vb.join(' '), height: height,
      width: Math.round(height * vb[2] / vb[3] * 10) / 10, role: 'img', 'aria-label': props.title || 'Clarivo', focusable: 'false'
    }, kids);
  }

  var api = { Button: Button, TextField: TextField, SegmentedControl: SegmentedControl, Badge: Badge, Variance: Variance, Stat: Stat, Notice: Notice, DriftStrip: DriftStrip, Logo: Logo, Icon: Icon };
  window.Clarivo = Object.assign(window.Clarivo || {}, api);
})();
