/**
 * 公考学习助手 - 手绘风格 SVG 图表组件
 * 零依赖，原生 SVG + JS
 *
 * 适配现有 PWA 的 CSS 变量：
 *   --c-text / --c-text-light / --c-bg / --c-card / --c-border
 *   --c-shenlun (#7C5CFC) / --c-todo (#FF6B9D) / --c-knowledge (#5B8DEF) / --c-words (#FFB84D)
 *
 * 所有函数签名：fn(container, data, options)
 * container: HTMLElement
 * data: Array
 * options: { width, height, ... }
 */

/* ============================================================
 * 内部工具
 * ============================================================ */

/**
 * 读取容器实际宽度，fallback 到 options.width 或 320
 */
function _getWidth(options) {
  if (options && options.width) return options.width;
  return 320;
}

/**
 * 创建 SVG 命名空间元素
 */
function _svgEl(tag, attrs) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (var k in attrs) {
      if (attrs[k] !== undefined && attrs[k] !== null) {
        el.setAttribute(k, attrs[k]);
      }
    }
  }
  return el;
}

/**
 * 生成唯一 id（用于 gradient / clipPath）
 */
var _uidCounter = 0;
function _uid(prefix) {
  _uidCounter++;
  return 'chart_' + (prefix || 'x') + '_' + _uidCounter + '_' + Math.random().toString(36).slice(2, 6);
}

/**
 * 把颜色转成 rgba（简易解析 hex / rgb）
 */
function _toRgba(color, alpha) {
  alpha = alpha == null ? 1 : alpha;
  if (color[0] === '#') {
    var hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  // rgb(...) 形式
  var m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    var parts = m[1].split(',').map(function (s) { return s.trim(); });
    return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + alpha + ')';
  }
  return color;
}

/**
 * 颜色加深（用于渐变起点）
 */
function _darken(color, factor) {
  factor = factor || 0.85;
  if (color[0] === '#') {
    var hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = Math.round(parseInt(hex.slice(0, 2), 16) * factor);
    var g = Math.round(parseInt(hex.slice(2, 4), 16) * factor);
    var b = Math.round(parseInt(hex.slice(4, 6), 16) * factor);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  return color;
}

/**
 * 创建渐变 def
 */
function _gradient(defs, id, colorStart, colorEnd, angle) {
  angle = angle || 90;
  var grad = _svgEl('linearGradient', {
    id: id,
    x1: '0%', y1: '0%',
    x2: angle === 90 ? '0%' : '100%',
    y2: angle === 90 ? '100%' : '0%'
  });
  grad.appendChild(_svgEl('stop', { offset: '0%', 'stop-color': colorStart }));
  grad.appendChild(_svgEl('stop', { offset: '100%', 'stop-color': colorEnd }));
  defs.appendChild(grad);
}

/**
 * 柔和阴影 filter
 */
function _softShadow(defs, id) {
  var filter = _svgEl('filter', {
    id: id,
    x: '-20%', y: '-20%', width: '140%', height: '140%'
  });
  filter.appendChild(_svgEl('feGaussianBlur', {
    in: 'SourceAlpha', stdDeviation: '2'
  }));
  filter.appendChild(_svgEl('feOffset', {
    dx: '0', dy: '2', result: 'offsetblur'
  }));
  var comp = _svgEl('feComponentTransfer');
  comp.appendChild(_svgEl('feFuncA', { type: 'linear', slope: '0.15' }));
  filter.appendChild(comp);
  var merge = _svgEl('feMerge');
  merge.appendChild(_svgEl('feMergeNode'));
  merge.appendChild(_svgEl('feMergeNode', { in: 'SourceGraphic' }));
  filter.appendChild(merge);
  defs.appendChild(filter);
}

/**
 * 创建根 SVG，设置 viewBox + 内联样式
 */
function _rootSVG(width, height) {
  var svg = _svgEl('svg', {
    viewBox: '0 0 ' + width + ' ' + height,
    preserveAspectRatio: 'xMidYMid meet',
    style: 'width:100%;height:auto;display:block;background:transparent;'
  });
  return svg;
}

/**
 * 默认配色（和 PWA 主题一致）
 */
var PALETTE = ['#7C5CFC', '#FF6B9D', '#5B8DEF', '#FFB84D', '#4ECDC4', '#95E1A3', '#FFA07A', '#C3A6FF'];

/**
 * 获取 data[i].color 或 PALETTE[i % n]
 */
function _color(data, i) {
  return (data[i] && data[i].color) || PALETTE[i % PALETTE.length];
}

/**
 * nice number 算法 - 求合适的刻度
 */
function _niceScale(min, max, tickCount) {
  tickCount = tickCount || 5;
  var range = _niceNum(max - min, false);
  var step = _niceNum(range / (tickCount - 1), true);
  var niceMin = Math.floor(min / step) * step;
  var niceMax = Math.ceil(max / step) * step;
  return { min: niceMin, max: niceMax, step: step };
}
function _niceNum(range, round) {
  var exp = Math.floor(Math.log10(range || 1));
  var frac = (range || 1) / Math.pow(10, exp);
  var nf;
  if (round) {
    if (frac < 1.5) nf = 1;
    else if (frac < 3) nf = 2;
    else if (frac < 7) nf = 5;
    else nf = 10;
  } else {
    if (frac <= 1) nf = 1;
    else if (frac <= 2) nf = 2;
    else if (frac <= 5) nf = 5;
    else nf = 10;
  }
  return nf * Math.pow(10, exp);
}


/* ============================================================
 * 1. drawLineChart - 折线图
 * ============================================================
 *
 * @param {HTMLElement} container
 * @param {Array<{label:string, value:number}>} data
 * @param {Object} options
 *   - width: number (默认 320)
 *   - height: number (默认 200)
 *   - color: string 线条颜色（默认取 PALETTE[0]）
 *   - fill: boolean 是否填充渐变区域（默认 true）
 *   - unit: string 数值单位
 *   - period: 'week' | 'month' | 'year'（仅影响标签密度，可选）
 */
function drawLineChart(container, data, options) {
  options = options || {};
  container.innerHTML = '';

  var W = _getWidth(options);
  var H = options.height || 200;
  var padding = { top: 24, right: 20, bottom: 34, left: 38 };
  var cw = W - padding.left - padding.right;
  var ch = H - padding.top - padding.bottom;

  var color = options.color || PALETTE[0];

  var svg = _rootSVG(W, H);
  var defs = _svgEl('defs');
  svg.appendChild(defs);

  var gid = _uid('linefill');
  _gradient(defs, gid, _toRgba(color, 0.35), _toRgba(color, 0.02), 90);
  var sid = _uid('shadow');
  _softShadow(defs, sid);

  // 数据范围
  var values = data.map(function (d) { return d.value; });
  var dmin = Math.min.apply(null, values);
  var dmax = Math.max.apply(null, values);
  if (dmin === dmax) { dmin = dmin - 1; dmax = dmax + 1; }
  dmin = Math.max(0, dmin - (dmax - dmin) * 0.1);
  var scale = _niceScale(dmin, dmax, 5);

  // 坐标转换
  var n = data.length;
  var xStep = n > 1 ? cw / (n - 1) : cw;
  function px(i) { return n > 1 ? padding.left + i * xStep : padding.left + cw / 2; }
  function py(v) {
    var ratio = (v - scale.min) / (scale.max - scale.min || 1);
    return padding.top + ch - ratio * ch;
  }

  // Y 轴网格线 + 标签
  var ticks = Math.round((scale.max - scale.min) / scale.step);
  for (var t = 0; t <= ticks; t++) {
    var v = scale.min + t * scale.step;
    var y = py(v);
    svg.appendChild(_svgEl('line', {
      x1: padding.left, y1: y,
      x2: W - padding.right, y2: y,
      stroke: 'var(--c-border, #EEE)',
      'stroke-width': 1,
      'stroke-dasharray': '3,4'
    }));
    svg.appendChild(_svgEl('text', {
      x: padding.left - 6, y: y + 4,
      'text-anchor': 'end',
      'font-size': 9,
      fill: 'var(--c-text-light, #888)'
    })).textContent = _fmt(v);
  }

  // 填充区域路径
  if (options.fill !== false) {
    var fillPath = 'M ' + px(0) + ' ' + py(scale.min) + ' ';
    for (var i = 0; i < n; i++) {
      fillPath += 'L ' + px(i) + ' ' + py(data[i].value) + ' ';
    }
    fillPath += 'L ' + px(n - 1) + ' ' + py(scale.min) + ' Z';
    svg.appendChild(_svgEl('path', {
      d: fillPath,
      fill: 'url(#' + gid + ')',
      stroke: 'none'
    }));
  }

  // 折线 - 用 Catmull-Rom 转 Bezier 做平滑曲线
  var linePath = '';
  for (var i = 0; i < n; i++) {
    if (i === 0) {
      linePath += 'M ' + px(i) + ' ' + py(data[i].value);
    } else {
      var p0 = data[i - 2] || data[i - 1];
      var p1 = data[i - 1];
      var p2 = data[i];
      var p3 = data[i + 1] || data[i];
      var cp1x = px(i - 1) + (px(i) - px(i - 2 || i - 1)) / 6;
      var cp1y = py(p1.value) + (py(p2.value) - py(p0.value)) / 6;
      var cp2x = px(i) - (px(i + 1 || i) - px(i - 1)) / 6;
      var cp2y = py(p2.value) - (py(p3.value) - py(p1.value)) / 6;
      linePath += ' C ' + cp1x + ' ' + cp1y + ' ' + cp2x + ' ' + cp2y + ' ' + px(i) + ' ' + py(data[i].value);
    }
  }
  svg.appendChild(_svgEl('path', {
    d: linePath,
    fill: 'none',
    stroke: color,
    'stroke-width': 2.5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    filter: 'url(#' + sid + ')'
  }));

  // 数据点
  for (var i = 0; i < n; i++) {
    var cx = px(i), cy = py(data[i].value);
    svg.appendChild(_svgEl('circle', {
      cx: cx, cy: cy, r: 3.5,
      fill: 'var(--c-card, #FFF)',
      stroke: color,
      'stroke-width': 2
    }));
  }

  // X 轴标签
  var labelStep = _labelStep(n, options.period);
  for (var i = 0; i < n; i++) {
    if (i % labelStep === 0 || i === n - 1) {
      svg.appendChild(_svgEl('text', {
        x: px(i), y: H - padding.bottom + 16,
        'text-anchor': 'middle',
        'font-size': 9,
        fill: 'var(--c-text-light, #888)'
      })).textContent = data[i].label;
    }
  }

  container.appendChild(svg);
}

/**
 * 根据数据量 + 周期决定标签间隔
 */
function _labelStep(n, period) {
  if (n <= 7) return 1;
  if (n <= 14) return 2;
  if (period === 'year') return Math.ceil(n / 6);
  return Math.ceil(n / 7);
}

/**
 * 格式化数字（千位省略）
 */
function _fmt(v) {
  if (v >= 1000) return (v / 1000).toFixed(1).replace('.0', '') + 'k';
  if (v % 1 !== 0) return v.toFixed(1);
  return v;
}


/* ============================================================
 * 2. drawBarChart - 柱状图
 * ============================================================
 *
 * @param {HTMLElement} container
 * @param {Array<{label:string, value:number, color?:string}>} data
 * @param {Object} options
 *   - width, height
 *   - unit: string
 *   - rounded: boolean (默认 true，圆角柱)
 */
function drawBarChart(container, data, options) {
  options = options || {};
  container.innerHTML = '';

  var W = _getWidth(options);
  var H = options.height || 200;
  var padding = { top: 24, right: 16, bottom: 34, left: 38 };
  var cw = W - padding.left - padding.right;
  var ch = H - padding.top - padding.bottom;

  var svg = _rootSVG(W, H);
  var defs = _svgEl('defs');
  svg.appendChild(defs);

  var sid = _uid('shadow');
  _softShadow(defs, sid);

  // 每个柱子一个渐变
  var gradIds = data.map(function (d, i) {
    var c = _color(data, i);
    var gid = _uid('bar' + i);
    _gradient(defs, gid, _darken(c, 0.8), c, 90);
    return gid;
  });

  // 数据范围
  var values = data.map(function (d) { return d.value; });
  var dmax = Math.max.apply(null, values);
  var dmin = Math.min(0, Math.min.apply(null, values));
  var scale = _niceScale(dmin, dmax, 5);

  // 网格线
  var ticks = Math.round((scale.max - scale.min) / scale.step);
  for (var t = 0; t <= ticks; t++) {
    var v = scale.min + t * scale.step;
    var y = padding.top + ch - ((v - scale.min) / (scale.max - scale.min || 1)) * ch;
    svg.appendChild(_svgEl('line', {
      x1: padding.left, y1: y,
      x2: W - padding.right, y2: y,
      stroke: 'var(--c-border, #EEE)',
      'stroke-width': 1,
      'stroke-dasharray': '3,4'
    }));
    svg.appendChild(_svgEl('text', {
      x: padding.left - 6, y: y + 4,
      'text-anchor': 'end',
      'font-size': 9,
      fill: 'var(--c-text-light, #888)'
    })).textContent = _fmt(v);
  }

  // 柱子
  var n = data.length;
  var gap = 0.35;
  var barW = (cw / n) * (1 - gap);
  var slot = cw / n;

  for (var i = 0; i < n; i++) {
    var v = data[i].value;
    var bh = Math.abs((v - scale.min) / (scale.max - scale.min || 1)) * ch;
    var baseY = padding.top + ch - ((0 - scale.min) / (scale.max - scale.min || 1)) * ch;
    var bx = padding.left + i * slot + (slot - barW) / 2;
    var by = v >= 0 ? baseY - bh : baseY;

    var r = options.rounded === false ? 0 : Math.min(barW / 2, 6);
    var rect = _svgEl('rect', {
      x: bx, y: by, width: barW, height: bh,
      rx: r, ry: r,
      fill: 'url(#' + gradIds[i] + ')',
      filter: 'url(#' + sid + ')'
    });
    svg.appendChild(rect);

    // 数值标签
    svg.appendChild(_svgEl('text', {
      x: bx + barW / 2, y: by - 5,
      'text-anchor': 'middle',
      'font-size': 9,
      'font-weight': '600',
      fill: 'var(--c-text, #2D2D2D)'
    })).textContent = _fmt(v);

    // X 轴标签
    svg.appendChild(_svgEl('text', {
      x: bx + barW / 2, y: H - padding.bottom + 16,
      'text-anchor': 'middle',
      'font-size': 9,
      fill: 'var(--c-text-light, #888)'
    })).textContent = data[i].label;
  }

  container.appendChild(svg);
}


/* ============================================================
 * 3. drawRingChart - 环形图 / 饼图
 * ============================================================
 *
 * @param {HTMLElement} container
 * @param {Array<{label:string, value:number, color?:string}>} data
 * @param {Object} options
 *   - width, height
 *   - donut: boolean (默认 true，环形；false 为饼图)
 *   - title: string 中心文字（如 "总计"）
 *   - showLegend: boolean (默认 true)
 */
function drawRingChart(container, data, options) {
  options = options || {};
  container.innerHTML = '';

  var W = _getWidth(options);
  var donut = options.donut !== false;
  var legendW = options.showLegend === false ? 0 : Math.min(W * 0.38, 130);
  var chartW = legendW > 0 ? W - legendW : W;
  var H = options.height || Math.max(chartW, 160);
  var cx = chartW / 2;
  var cy = H / 2;
  var R = Math.min(chartW, H) / 2 - 14;
  var innerR = donut ? R * 0.62 : 0;

  var svg = _rootSVG(W, H);
  var defs = _svgEl('defs');
  svg.appendChild(defs);

  var sid = _uid('shadow');
  _softShadow(defs, sid);

  // 总和
  var total = data.reduce(function (s, d) { return s + d.value; }, 0);
  if (total <= 0) total = 1;

  var startAngle = -Math.PI / 2; // 从 12 点方向开始
  var gap = data.length > 1 ? 0.015 : 0; // 扇区间隙(弧度)

  for (var i = 0; i < data.length; i++) {
    var angle = (data[i].value / total) * Math.PI * 2;
    var endAngle = startAngle + angle - gap;
    if (endAngle < startAngle) endAngle = startAngle; // 防止间隙过大

    var c = _color(data, i);
    var gid = _uid('ring' + i);
    _gradient(defs, gid, _darken(c, 0.75), c, 45);

    var arc = _arcPath(cx, cy, R, innerR, startAngle, endAngle, donut);
    svg.appendChild(_svgEl('path', {
      d: arc,
      fill: 'url(#' + gid + ')',
      stroke: 'var(--c-card, #FFF)',
      'stroke-width': 2,
      filter: 'url(#' + sid + ')'
    }));

    startAngle = endAngle + gap;
  }

  // 中心文字（仅环形图）
  if (donut) {
    if (options.title) {
      svg.appendChild(_svgEl('text', {
        x: cx, y: cy - 6,
        'text-anchor': 'middle',
        'font-size': 10,
        fill: 'var(--c-text-light, #888)'
      })).textContent = options.title;
    }
    svg.appendChild(_svgEl('text', {
      x: cx, y: cy + 12,
      'text-anchor': 'middle',
      'font-size': 18,
      'font-weight': '700',
      fill: 'var(--c-text, #2D2D2D)'
    })).textContent = _fmt(total);
  }

  // 图例
  if (legendW > 0) {
    var lx = chartW + 8;
    var ly = 16;
    var lh = Math.min((H - 20) / data.length, 24);
    for (var i = 0; i < data.length; i++) {
      var c = _color(data, i);
      svg.appendChild(_svgEl('rect', {
        x: lx, y: ly + i * lh,
        width: 10, height: 10,
        rx: 3, ry: 3,
        fill: c
      }));
      var pct = ((data[i].value / total) * 100).toFixed(0) + '%';
      svg.appendChild(_svgEl('text', {
        x: lx + 16, y: ly + i * lh + 9,
        'font-size': 10,
        fill: 'var(--c-text, #2D2D2D)'
      })).textContent = data[i].label + ' ' + pct;
    }
  }

  container.appendChild(svg);
}

/**
 * 生成环形扇区 / 饼图扇区路径
 */
function _arcPath(cx, cy, r, innerR, a0, a1, donut) {
  var largeArc = (a1 - a0) > Math.PI ? 1 : 0;
  var x0 = cx + r * Math.cos(a0);
  var y0 = cy + r * Math.sin(a0);
  var x1 = cx + r * Math.cos(a1);
  var y1 = cy + r * Math.sin(a1);

  if (!donut) {
    // 饼图：从圆心出发
    return 'M ' + cx + ' ' + cy +
      ' L ' + x0 + ' ' + y0 +
      ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x1 + ' ' + y1 +
      ' Z';
  }

  // 环形扇区
  var ix0 = cx + innerR * Math.cos(a0);
  var iy0 = cy + innerR * Math.sin(a0);
  var ix1 = cx + innerR * Math.cos(a1);
  var iy1 = cy + innerR * Math.sin(a1);

  return 'M ' + x0 + ' ' + y0 +
    ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x1 + ' ' + y1 +
    ' L ' + ix1 + ' ' + iy1 +
    ' A ' + innerR + ' ' + innerR + ' 0 ' + largeArc + ' 0 ' + ix0 + ' ' + iy0 +
    ' Z';
}


/* ============================================================
 * 4. drawCalendarHeatmap - 打卡热力图
 * ============================================================
 *
 * @param {HTMLElement} container
 * @param {Array<{date:string, value:number}>} data  date 格式 'YYYY-MM-DD'
 * @param {Object} options
 *   - width
 *   - weeks: number 显示周数（默认 13，约 3 个月）
 *   - color: string 基础色（默认 --c-shenlun / #7C5CFC）
 *   - showMonthLabels: boolean (默认 true)
 *   - showDayLabels: boolean (默认 true)
 */
function drawCalendarHeatmap(container, data, options) {
  options = options || {};
  container.innerHTML = '';

  var W = _getWidth(options);
  var weeks = options.weeks || 13;
  var cellSize = Math.floor((W - 28) / weeks); // 每格大小
  cellSize = Math.min(cellSize, 14);
  var gap = 2;
  var step = cellSize + gap;

  var dayLabelW = options.showDayLabels === false ? 0 : 18;
  var topPad = options.showMonthLabels === false ? 8 : 20;
  var H = topPad + step * 7 + 6;

  var baseColor = options.color || '#7C5CFC';

  var svg = _rootSVG(W, H);
  var defs = _svgEl('defs');
  svg.appendChild(defs);

  // 构建日期 -> value 映射
  var map = {};
  data.forEach(function (d) { map[d.date] = d.value; });

  // 确定日期范围：从最近一个周日往回推 weeks 周
  var today = new Date();
  var end = new Date(today);
  // 回退到周六（本周最后一天）
  end.setDate(end.getDate() + (6 - end.getDay()));
  var start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  // 对齐到周日
  start.setDate(start.getDate() - start.getDay());

  // 找到最大值用于颜色分级
  var maxVal = 1;
  data.forEach(function (d) { if (d.value > maxVal) maxVal = d.value; });

  // 5 级颜色
  function levelColor(val) {
    if (!val || val <= 0) return 'var(--c-border, #EEE)';
    var ratio = val / maxVal;
    var level;
    if (ratio < 0.25) level = 0;
    else if (ratio < 0.5) level = 1;
    else if (ratio < 0.75) level = 2;
    else level = 3;
    return _toRgba(baseColor, [0.35, 0.55, 0.75, 1.0][level]);
  }

  // 绘制格子
  var monthLabels = {};
  var cur = new Date(start);

  for (var w = 0; w < weeks + 1; w++) {
    for (var d = 0; d < 7; d++) {
      var date = new Date(cur);
      date.setDate(cur.getDate() + d);
      if (date > end) continue;

      var ds = _dateStr(date);
      var val = map[ds] || 0;
      var x = dayLabelW + w * step;
      var y = topPad + d * step;

      // 记录月份标签（该列第一天）
      if (d === 0 && date.getDate() <= 7) {
        var monthKey = date.getMonth();
        if (!monthLabels[monthKey]) {
          monthLabels[monthKey] = { x: x, label: (date.getMonth() + 1) + '月' };
        }
      }

      svg.appendChild(_svgEl('rect', {
        x: x, y: y,
        width: cellSize, height: cellSize,
        rx: 3, ry: 3,
        fill: levelColor(val),
        stroke: val > 0 ? _toRgba(baseColor, 0.1) : 'none',
        'stroke-width': 0.5
      }));
    }
    cur.setDate(cur.getDate() + 7);
  }

  // 月份标签
  if (options.showMonthLabels !== false) {
    Object.keys(monthLabels).forEach(function (k) {
      var m = monthLabels[k];
      svg.appendChild(_svgEl('text', {
        x: m.x, y: 14,
        'font-size': 9,
        fill: 'var(--c-text-light, #888)'
      })).textContent = m.label;
    });
  }

  // 星期标签（一/三/五）
  if (options.showDayLabels !== false) {
    var dayLabels = ['', '一', '', '三', '', '五', ''];
    for (var d = 0; d < 7; d++) {
      if (dayLabels[d]) {
        svg.appendChild(_svgEl('text', {
          x: 0, y: topPad + d * step + cellSize - 1,
          'font-size': 8,
          fill: 'var(--c-text-light, #888)'
        })).textContent = dayLabels[d];
      }
    }
  }

  // 图例
  var legY = H - 2;
  var legX = W - 5 * step;
  svg.appendChild(_svgEl('text', {
    x: legX - 4, y: legY - 2,
    'text-anchor': 'end',
    'font-size': 8,
    fill: 'var(--c-text-light, #888)'
  })).textContent = '少';
  for (var l = 0; l < 5; l++) {
    svg.appendChild(_svgEl('rect', {
      x: legX + l * step, y: legY - cellSize,
      width: cellSize, height: cellSize,
      rx: 2, ry: 2,
      fill: l === 0 ? 'var(--c-border, #EEE)' : _toRgba(baseColor, [0.35, 0.55, 0.75, 1.0][l - 1])
    }));
  }
  svg.appendChild(_svgEl('text', {
    x: legX + 5 * step + 3, y: legY - 2,
    'font-size': 8,
    fill: 'var(--c-text-light, #888)'
  })).textContent = '多';

  container.appendChild(svg);
}

/**
 * Date -> 'YYYY-MM-DD'
 */
function _dateStr(d) {
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}


/* ============================================================
 * 导出（同时挂载到 window 方便直接引用）
 * ============================================================ */

if (typeof window !== 'undefined') {
  window.drawLineChart = drawLineChart;
  window.drawBarChart = drawBarChart;
  window.drawRingChart = drawRingChart;
  window.drawCalendarHeatmap = drawCalendarHeatmap;
}

// CommonJS / ES module 兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    drawLineChart: drawLineChart,
    drawBarChart: drawBarChart,
    drawRingChart: drawRingChart,
    drawCalendarHeatmap: drawCalendarHeatmap
  };
}
